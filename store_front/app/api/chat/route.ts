import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { runConcierge } from '@/lib/gemini';
import { supabaseAdmin } from '@/lib/supabase-admin';

const bodySchema = z.object({
  conversation_id: z.string().uuid().nullish(), // the page sends null on the first message
  message: z.string().min(1).max(2000),
});

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

  let conversationId = conversation_id;
  if (!conversationId) {
    const { data, error } = await supabaseAdmin.from('conversations').insert({}).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    conversationId = data.id;
  }

  await supabaseAdmin.from('messages').insert({
    conversation_id: conversationId,
    role: 'customer',
    content: message,
  });

  const { data: prior } = await supabaseAdmin
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  const messages = (prior || []).map(m => ({
    role: m.role as 'customer' | 'assistant',
    content: m.content,
  }));

  const { reply, approval_reference, tool_data } = await runConcierge(messages);

  await supabaseAdmin.from('messages').insert({
    conversation_id: conversationId,
    role: 'assistant',
    content: reply,
  });

  return NextResponse.json({ reply, approval_reference, tool_data, conversation_id: conversationId });
}
