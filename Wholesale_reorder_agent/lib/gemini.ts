import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';

const env = z.object({
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().default('gemini-1.5-flash'),
  STORE_CURRENCY: z.string().default('USD'),
}).parse(process.env);

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

/**
 * Build the short "why" note for a draft PO.
 * All numbers are computed upstream and passed in; Gemini only words them.
 * If Gemini fails, a template note is returned.
 */
export async function writePoWhyNote(input: {
  supplierName: string;
  leadTimeDays: number;
  total: number;
  currency: string;
  lines: Array<{
    item_name: string;
    size: string;
    qty: number;
    rate: number;
    run_out_date: string | null;
    on_hand: number;
  }>;
}): Promise<string> {
  const facts = input.lines
    .map(l => {
      const runOut = l.run_out_date
        ? new Date(l.run_out_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : 'unknown';
      return `${l.item_name} ${l.size} sells ~${l.rate.toFixed(1)}/day, on hand ${l.on_hand}, runs out ${runOut}`;
    })
    .join('; ');

  const totalStr = `${input.currency === 'USD' ? '$' : ''}${input.total.toFixed(2)}`;

  const prompt = `You are writing a one-paragraph (2-3 sentences, ~40 words) internal note for a small shop owner explaining why this purchase order from ${input.supplierName} is being drafted. Use ONLY these facts (do not invent numbers): ${facts}. The supplier lead time is ${input.leadTimeDays} days and the PO total is ${totalStr}. Explain that these items will run out before a reorder can arrive. Plain prose, no bullets, no greeting.`;

  try {
    const model = genAI.getGenerativeModel({ model: env.GEMINI_MODEL });
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    if (text) return text;
  } catch {
    // fall through to template
  }
  return templateNote(input);
}

function templateNote(input: {
  supplierName: string;
  leadTimeDays: number;
  total: number;
  currency: string;
  lines: Array<{ item_name: string; size: string; run_out_date: string | null }>;
}): string {
  const first = input.lines[0];
  const runOut = first?.run_out_date
    ? new Date(first.run_out_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : 'soon';
  const totalStr = `${input.currency === 'USD' ? '$' : ''}${input.total.toFixed(2)}`;
  return `${input.lines.length} item(s) from ${input.supplierName} are running low, with ${first?.item_name ?? 'the first item'} running out around ${runOut}. A ${input.leadTimeDays}-day lead time means a reorder is needed now. Draft PO total: ${totalStr}.`;
}

/**
 * Build a short morning summary of the latest run.
 */
export async function writeMorningSummary(input: {
  variantsChecked: number;
  orderNowCount: number;
  draftPoCount: number;
  totalValue: number;
  currency: string;
  nextRunOut: { item: string; date: string } | null;
}): Promise<string> {
  const next = input.nextRunOut
    ? `${input.nextRunOut.item} runs out ${new Date(input.nextRunOut.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : 'no imminent run-outs';
  const totalStr = `${input.currency === 'USD' ? '$' : ''}${input.totalValue.toFixed(2)}`;

  const prompt = `Write a 2-sentence morning summary for a shop owner. Facts only: checked ${input.variantsChecked} variants, ${input.orderNowCount} need reordering now, ${input.draftPoCount} draft purchase orders totalling ${totalStr}, and ${next}. Plain prose, no greeting.`;

  try {
    const model = genAI.getGenerativeModel({ model: env.GEMINI_MODEL });
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    if (text) return text;
  } catch {
    // fall through
  }
  return `Checked ${input.variantsChecked} variants: ${input.orderNowCount} to reorder, ${input.draftPoCount} draft POs (${totalStr}). ${next}.`;
}
