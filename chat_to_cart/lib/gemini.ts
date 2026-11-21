import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import {
  searchProducts,
  getProduct,
  addToCart,
  updateCart,
  removeFromCart,
  viewCart,
  proposeCheckout,
} from './tools';

const env = z.object({
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().default('gemini-1.5-flash'),
  STORE_CURRENCY: z.string().default('USD'),
}).parse(process.env);

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

const systemInstruction = `
You are the shopping assistant for Northwind Supply Co., a fake outdoor apparel shop.
Be friendly and concise (2–3 sentences).
- Recommend only products returned by search_products or get_product.
- Never invent a product, price, discount, stock level, or order.
- Ask one short question when size is missing.
- The assistant can never pay, apply discounts, or change prices.
- Never say an item was "added", "checkout ready", or a cart exists unless add_to_cart returned ok in this same turn.
- If a customer asks to add something to the cart, ALWAYS use add_to_cart (with the variant_id from a product you just looked up) instead of saying you added it.
- All prices and stock come from tools, not the model. Do not repeat every variant; highlight the best match.
- When the shopper names more than one item, call search_products once per item. Use a short noun query ("jacket", "base layer", "canvas shorts"). Put the size in the size argument and a budget in max_price. Do not put "warm", "under", or the size letter inside the query.
- If a search returns no products, search once more with a single noun before saying it is not in the catalogue.
- Do not add items yourself. The shopper uses the Add to cart button on the card.
- Answer stock questions from search_products or get_product, including when a size is out of stock.
`;

const tools = [
  {
    name: 'search_products',
    description: 'Search the Shopify catalogue for Northwind products. Returns up to 6 matching products with variants, price and stock.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What the shopper is looking for, e.g. warm jacket' },
        max_price: { type: 'number', description: 'Optional maximum price in USD' },
        size: { type: 'string', description: 'Optional size like S, M, L, XL' },
        category: { type: 'string', description: 'Optional category like jacket, tee, pants' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_product',
    description: 'Get full details, variants, price and stock for one product by id.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Shopify product id, e.g. gid://shopify/Product/123456' },
      },
      required: ['id'],
    },
  },
  {
    name: 'add_to_cart',
    description: 'Add a product variant to the current cart. Re-checks stock and price.',
    parameters: {
      type: 'object',
      properties: {
        variant_id: { type: 'string', description: 'Shopify product variant id' },
        quantity: { type: 'number', default: 1 },
      },
      required: ['variant_id'],
    },
  },
  {
    name: 'update_cart',
    description: 'Change the quantity of a line in the cart. Set quantity to 0 to remove.',
    parameters: {
      type: 'object',
      properties: {
        line_id: { type: 'string' },
        quantity: { type: 'number' },
      },
      required: ['line_id', 'quantity'],
    },
  },
  {
    name: 'remove_from_cart',
    description: 'Remove a line from the cart.',
    parameters: {
      type: 'object',
      properties: {
        line_id: { type: 'string' },
      },
      required: ['line_id'],
    },
  },
  {
    name: 'view_cart',
    description: 'Show the current cart contents and server-calculated total.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'propose_checkout',
    description: 'Show the checkout card so the shopper can approve. Does not charge the card and does not create a Stripe session. Call it only when the shopper says they are ready to check out.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
];

async function callTool(name: string, args: any, cartId: string): Promise<any> {
  const result = await (async () => {
    switch (name) {
      case 'search_products':
        return searchProducts({
          query: args.query,
          max_price: args.max_price,
          size: args.size,
          category: args.category,
        });
      case 'get_product':
        return getProduct(args.id);
      case 'add_to_cart':
        return addToCart(cartId, args.variant_id, args.quantity ?? 1);
      case 'update_cart':
        return updateCart(cartId, args.line_id, args.quantity);
      case 'remove_from_cart':
        return removeFromCart(cartId, args.line_id);
      case 'view_cart':
        return viewCart(cartId);
      case 'propose_checkout':
        return proposeCheckout(cartId);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  })();
  return { name, args, result };
}

const CLAIMS_SUBMITTED = /\b(added|in your cart|checkout ready|cart updated)\b[^.]{0,80}\b(item|product|variant|cart|checkout)\b|\b(item|product|variant|cart|checkout)\b[^.]{0,40}\b(added|updated|ready)\b/i;

export async function runAssistant(
  cartId: string,
  messages: Array<{ role: 'customer' | 'assistant'; content: string }>
) {
  const model = genAI.getGenerativeModel({
    model: env.GEMINI_MODEL,
    systemInstruction,
    tools: [{ functionDeclarations: tools as any }],
  });

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

  let nudged = false;
  let lastToolData: { name: string; result: any } | null = null;
  // A turn often searches twice (jacket, then the base layer). The widget only
  // renders the last tool result, so keep every catalogue card from this turn.
  const seenProducts: any[] = [];
  const rememberCatalogue = (name: string, result: any) => {
    const items = name === 'get_product'
      ? [result?.product].filter(Boolean)
      : name === 'search_products' && Array.isArray(result?.products) ? result.products : [];
    for (const p of items) {
      const key = p?.id || p?.title;
      if (!key || seenProducts.some(x => (x.id || x.title) === key)) continue;
      seenProducts.push(p);
    }
  };
  const cardsForUi = (data: { name: string; result: any } | null) => {
    if (!data || (data.name !== 'search_products' && data.name !== 'get_product') || !seenProducts.length) return data;
    return {
      name: 'search_products',
      result: { ...(data.result || {}), ok: true, count: seenProducts.length, products: seenProducts },
    };
  };

  let result = await sendWithRetry(() => chat.sendMessage(lastMessage.content));

  for (let i = 0; i < 8; i++) {
    const response = result.response;
    const functionCalls = response.functionCalls();

    if (!functionCalls?.length) {
      const text = response.text();
      if (!nudged && CLAIMS_SUBMITTED.test(text)) {
        nudged = true;
        result = await sendWithRetry(() => chat.sendMessage(
          'System check: you claimed something was added to the cart or checkout ready, ' +
          'but no add_to_cart call succeeded in this turn. ' +
          'If the customer wants to add an item, call add_to_cart with the variant_id now. ' +
          'Otherwise reply without claiming anything was added or ready.'));
        continue;
      }
      return { reply: text, tool_data: cardsForUi(lastToolData) };
    }

    const functionResponses: Array<{ name: string; response: any }> = [];
    for (const call of functionCalls) {
      const toolCall = await callTool(call.name, call.args, cartId);
      lastToolData = { name: call.name, result: toolCall.result };
      rememberCatalogue(call.name, toolCall.result);
      functionResponses.push({ name: call.name, response: toolCall.result });
    }

    const parts = functionResponses.map(fr => ({
      functionResponse: fr,
    }));

    result = await sendWithRetry(() => chat.sendMessage(parts));
  }

  return {
    reply: "I'm not sure how to help with that. Try searching for a product, asking about stock, or viewing your cart.",
    tool_data: cardsForUi(lastToolData),
  };
}
