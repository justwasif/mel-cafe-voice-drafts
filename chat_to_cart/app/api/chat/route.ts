import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { runAssistant } from '@/lib/gemini';
import { randomUUID } from 'crypto';

const bodySchema = z.object({
  conversation_id: z.string().uuid().nullish(), // the page sends null on the first message
  message: z.string().min(1).max(2000),
});

type Message = { role: 'customer' | 'assistant'; content: string };

const conversations = new Map<string, { messages: Message[]; cartId: string }>();
const ipRequests = new Map<string, number[]>();
const RATE_LIMIT = 20; // per minute

function rateLimit(ip: string) {
  const now = Date.now();
  const windowStart = now - 60_000;
  const timestamps = ipRequests.get(ip) || [];
  const recent = timestamps.filter(t => t > windowStart);
  if (recent.length >= RATE_LIMIT) return false;
  recent.push(now);
  ipRequests.set(ip, recent);
  return true;
}

function getConversation(id: string) {
  return conversations.get(id);
}

function createConversation(): { id: string; messages: Message[]; cartId: string } {
  const id = randomUUID();
  const cartId = randomUUID();
  const conversation = { messages: [], cartId };
  conversations.set(id, conversation);
  return { id, ...conversation };
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!rateLimit(ip)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  const { conversation_id, message } = parsed.data;

  let conversation = conversation_id ? getConversation(conversation_id) : undefined;
  if (!conversation) {
    const created = createConversation();
    conversation = { messages: created.messages, cartId: created.cartId };
  }

  conversation.messages.push({ role: 'customer', content: message });

  const { reply, tool_data } = await runAssistant(conversation.cartId, conversation.messages);

  conversation.messages.push({ role: 'assistant', content: reply });

  // Find the conversation id by cartId/map lookup since we didn't keep it above
  let conversationId = conversation_id;
  if (!conversationId) {
    for (const [id, value] of conversations.entries()) {
      if (value.cartId === conversation.cartId) {
        conversationId = id;
        break;
      }
    }
  }

  return NextResponse.json({ reply, tool_data, conversation_id: conversationId });
}
