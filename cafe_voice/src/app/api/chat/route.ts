import { NextRequest, NextResponse } from 'next/server';
import { getCafeGeminiModel, CAFE_SYSTEM_PROMPT, CafeToolSchemas } from '@/lib/gemini-cafe';
import {
  findMenuItems,
  getOrderWithItems,
  addOrderItem,
  removeOrderItem,
  updateOrderStatus,
  normalizeSize,
  normalizeOption,
} from '@/lib/cafe';
import { z } from 'zod';

const requestSchema = z.object({
  messages: z.array(z.object({ role: z.string(), content: z.string() })),
  order_id: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, order_id: orderId } = requestSchema.parse(body);

    const model = getCafeGeminiModel();

    const contents: any[] = [
      { role: 'user', parts: [{ text: CAFE_SYSTEM_PROMPT }] },
      { role: 'model', parts: [{ text: "Understood. I'm Remy, ready to take your order." }] },
      ...messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
    ];

    let result = await model.generateContent({ contents });
    let functionCalls = result.response.functionCalls();
    let maxLoops = 6;
    let updatedOrderId: string | null = orderId || null;
    let replyText = '';

    while (functionCalls && functionCalls.length > 0 && maxLoops > 0) {
      const call = functionCalls[0];
      const name = call.name;
      const args = call.args;
      let toolResult: any = { error: 'Unknown tool' };

      try {
        if (name === 'search_menu') {
          const parsed = CafeToolSchemas.search_menu.parse(args);
          const items = await findMenuItems(parsed.query);
          toolResult = { items };
        } else if (name === 'add_item') {
          const parsed = CafeToolSchemas.add_item.parse(args);
          if (!updatedOrderId) {
            toolResult = { error: 'No active order. Ask the customer for their first name first.' };
          } else {
            const matches = await findMenuItems(parsed.item_name);
            const match = matches.find((m) => m.available);
            if (!match) {
              const alternatives = (await findMenuItems(parsed.item_name.split(' ')[0]))
                .filter((m) => m.available)
                .slice(0, 2)
                .map((m) => m.name);
              toolResult = { error: 'Item unavailable', alternatives };
            } else {
              let size = parsed.size;
              if (!size) {
                size = match.sizes.length === 1
                  ? match.sizes[0].size
                  : match.sizes.find((s) => s.size.toLowerCase() === 'regular')?.size || match.sizes[0].size;
              }
              const normalizedSize = normalizeSize(match, size);
              if (!normalizedSize) {
                toolResult = { error: `Size ${size} not available`, available_sizes: match.sizes.map((s) => s.size) };
              } else {
                const options = (parsed.options || [])
                  .map((o) => normalizeOption(match, o))
                  .filter(Boolean) as { name: string; price: number }[];
                const order = await addOrderItem(updatedOrderId, match, normalizedSize, options, parsed.qty || 1);
                toolResult = { order };
              }
            }
          }
        } else if (name === 'remove_item') {
          const parsed = CafeToolSchemas.remove_item.parse(args);
          if (!updatedOrderId) {
            toolResult = { error: 'No active order' };
          } else {
            const order = await removeOrderItem(updatedOrderId, parsed.line_id);
            toolResult = { order };
          }
        } else if (name === 'view_order') {
          if (!updatedOrderId) {
            toolResult = { error: 'No active order' };
          } else {
            const order = await getOrderWithItems(updatedOrderId);
            toolResult = { order };
          }
        } else if (name === 'send_to_kitchen') {
          if (!updatedOrderId) {
            toolResult = { error: 'No active order' };
          } else {
            const order = await updateOrderStatus(updatedOrderId, 'sent_to_kitchen');
            toolResult = { order };
          }
        }
      } catch (e: any) {
        toolResult = { error: e.message || 'Tool error' };
      }

      const rawParts = result.response.candidates?.[0]?.content?.parts || [];
      const matchingPart = rawParts.find((p: any) => p.functionCall?.name === name) as any;
      const thoughtSignature = matchingPart?.thoughtSignature || '';

      contents.push({
        role: 'model',
        parts: [{ functionCall: { name, args }, ...(thoughtSignature ? { thoughtSignature } : {}) }],
      });
      contents.push({
        role: 'user',
        parts: [{ functionResponse: { name, response: toolResult } }],
      });

      result = await model.generateContent({ contents });
      functionCalls = result.response.functionCalls();
      maxLoops--;
    }

    replyText = result.response.text() || "I'm sorry, I didn't catch that. Could you repeat?";

    if (!replyText && maxLoops < 6) {
      contents.push({
        role: 'user',
        parts: [{ text: 'Please respond to the customer in one warm sentence.' }],
      });
      const followup = await model.generateContent({ contents });
      replyText = followup.response.text() || "I'm sorry, I didn't catch that.";
    }

    return NextResponse.json({ reply: replyText, order_id: updatedOrderId });
  } catch (err: any) {
    console.error('Chat error:', err);
    return NextResponse.json({ reply: 'Something went wrong. Please try again in a moment.' }, { status: 500 });
  }
}

