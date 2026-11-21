import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import {
  lookupOrder,
  sizeHelp,
  getPolicy,
  requestRefund,
  proposeDiscount,
  requestStatus,
} from './tools';

const env = z.object({
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().default('gemini-1.5-flash'),
}).parse(process.env);

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

const systemInstruction = `
You are the support concierge for Northwind Supply Co., a fake apparel shop.
Be friendly and concise (2–3 sentences).
- Before showing order details, ask for order number and email.
- Never say a refund or discount code is final until it is approved by the owner.
- Never say a refund or discount request was submitted/sent unless request_refund or propose_discount returned a reference in this same turn.
- If a customer asks to return or refund an eligible order (paid, within 30 days, not already refunded), ALWAYS use request_refund and let the owner decide. Do not debate whether the reason is good enough.
- If a customer has a problem that warrants compensation (late delivery, wrong size shipped, etc.), you may propose up to 15% discount using propose_discount.
- All dates/times are in ${process.env.STORE_TIMEZONE || 'UTC'}.
`;

const tools = [
  {
    name: 'lookup_order',
    description: 'Look up an order by order number (e.g. #1001) and customer email. Only returns details if the email matches.',
    parameters: {
      type: 'object',
      properties: {
        order_number: { type: 'string' },
        email: { type: 'string' },
      },
      required: ['order_number', 'email'],
    },
  },
  {
    name: 'size_help',
    description: 'Get sizes, stock, size chart and recommend a size for a product.',
    parameters: {
      type: 'object',
      properties: {
        product_query: { type: 'string' },
        measurements: {
          type: 'object',
          properties: {
            chest: { type: 'number' },
            waist: { type: 'number' },
          },
        },
      },
      required: ['product_query'],
    },
  },
  {
    name: 'get_policy',
    description: 'Get the store policy for returns, exchanges, or shipping.',
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string', enum: ['returns', 'exchanges', 'shipping'] },
      },
      required: ['topic'],
    },
  },
  {
    name: 'request_refund',
    description: 'Create a pending refund approval request. Only if eligible (paid, within 30 days, not already refunded).',
    parameters: {
      type: 'object',
      properties: {
        order_number: { type: 'string' },
        email: { type: 'string' },
        line_items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              lineItemId: { type: 'string' },
              quantity: { type: 'number' },
            },
            required: ['lineItemId', 'quantity'],
          },
        },
        reason: { type: 'string' },
      },
      required: ['order_number', 'email', 'line_items', 'reason'],
    },
  },
  {
    name: 'propose_discount',
    description: 'Create a pending discount approval request (max 15%). Only for real problems like late delivery or out-of-stock size.',
    parameters: {
      type: 'object',
      properties: {
        order_number: { type: 'string' },
        email: { type: 'string' },
        percent: { type: 'number' },
        reason: { type: 'string' },
      },
      required: ['order_number', 'email', 'percent', 'reason'],
    },
  },
  {
    name: 'request_status',
    description: 'Get the current status of an approval request by reference.',
    parameters: {
      type: 'object',
      properties: {
        reference: { type: 'string' },
      },
      required: ['reference'],
    },
  },
];

async function callTool(name: string, args: any): Promise<any> {
  const result = await (async () => {
    switch (name) {
      case 'lookup_order':
        return lookupOrder(args.order_number, args.email);
      case 'size_help':
        return sizeHelp(args.product_query, args.measurements);
      case 'get_policy':
        return getPolicy(args.topic);
      case 'request_refund':
        return requestRefund(args.order_number, args.email, args.line_items, args.reason);
      case 'propose_discount':
        return proposeDiscount(args.order_number, args.email, args.percent, args.reason);
      case 'request_status':
        return requestStatus(args.reference);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  })();
  return { name, args, result };
}

const CLAIMS_SUBMITTED = /\b(submitted|sent|forwarded|passed)\b[^.]{0,60}\b(request|owner|approval)\b|\brequest\b[^.]{0,40}\b(submitted|sent|forwarded)\b/i;

export async function runConcierge(messages: Array<{ role: 'customer' | 'assistant'; content: string }>) {
  const model = genAI.getGenerativeModel({
    model: env.GEMINI_MODEL,
    systemInstruction,
    tools: [{ functionDeclarations: tools as any }],
  });

  // Build chat history (all prior messages except the last user message,
  // which we send via sendMessage to start the turn)
  const priorMessages = messages.slice(0, -1);
  const lastMessage = messages[messages.length - 1];

  const history = priorMessages.map(m => ({
    role: m.role === 'customer' ? 'user' : 'model',
    parts: [{ text: m.content }],
  }));

  const chat = model.startChat({
    history,
    generationConfig: { maxOutputTokens: 8192 },
  });

  async function sendWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastErr;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await fn();
      } catch (e: any) {
        lastErr = e;
        const status = e?.status || e?.statusText;
        if (status === 503 || status === 429 || e?.message?.includes('high demand')) {
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
          continue;
        }
        throw e;
      }
    }
    throw lastErr;
  }

  let approvalReference: string | null = null;
  let nudged = false;
  let lastToolData: { name: string; result: any } | null = null;

  // Send the last user message
  let result = await sendWithRetry(() => chat.sendMessage(lastMessage.content));

  for (let i = 0; i < 8; i++) {
    const response = result.response;
    const functionCalls = response.functionCalls();

    if (!functionCalls?.length) {
      const text = response.text();
      // Guard: the model sometimes claims it submitted a request without calling the tool.
      if (!approvalReference && !nudged && CLAIMS_SUBMITTED.test(text)) {
        nudged = true;
        result = await sendWithRetry(() => chat.sendMessage(
          'System check: you said a request was submitted, but no request_refund or propose_discount call succeeded in this turn. ' +
          'If the customer wants a return/refund and you have the order number and email, call request_refund now. ' +
          'Otherwise reply without claiming anything was submitted.'));
        continue;
      }
      return { reply: text, approval_reference: approvalReference, tool_data: lastToolData };
    }

    // Execute all function calls and send results back
    const functionResponses: Array<{ name: string; response: any }> = [];
    for (const call of functionCalls) {
      const toolCall = await callTool(call.name, call.args);
      const toolResult = toolCall.result;

      if (call.name === 'request_refund' || call.name === 'propose_discount') {
        if (toolResult.ok && toolResult.reference) {
          approvalReference = toolResult.reference;
        }
      }

      // Capture rich tool data for card rendering
      lastToolData = { name: call.name, result: toolResult };

      functionResponses.push({ name: call.name, response: toolResult });
    }

    // sendMessage with function response parts — the SDK preserves thought signatures internally
    const parts = functionResponses.map(fr => ({
      functionResponse: fr,
    }));

    result = await sendWithRetry(() => chat.sendMessage(parts));
  }

  return {
    reply: "I'm not sure how to help with that. Try asking about your order, returns, or sizing.",
    approval_reference: approvalReference,
    tool_data: lastToolData,
  };
}
