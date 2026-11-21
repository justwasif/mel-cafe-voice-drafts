import { GoogleGenerativeAI, FunctionDeclaration, SchemaType } from '@google/generative-ai';
import { z } from 'zod';

const apiKey = process.env.GEMINI_API_KEY!;
const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

const genAI = new GoogleGenerativeAI(apiKey);

export const ToolSchemas = {
  get_restaurant_info: z.object({ topic: z.string() }),
  find_open_tables: z.object({
    party_size: z.number().min(1).max(8),
    date: z.string(), // YYYY-MM-DD
    time: z.string(), // HH:MM
  }),
  create_pending_booking: z.object({
    guest_name: z.string().min(1),
    guest_phone: z.string().min(1),
    party_size: z.number().min(1).max(8),
    date: z.string(),
    time: z.string(),
    notes: z.string().optional(),
  }),
  get_booking_status: z.object({ reference: z.string() }),
};

const functions: FunctionDeclaration[] = [
  {
    name: 'get_restaurant_info',
    description: 'Get info about the restaurant: hours, menu, location, policies, parking, dietary options. Topic can be "hours", "menu", "location", "policies", "parking", "dietary", or a specific question.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        topic: { type: SchemaType.STRING },
      },
      required: ['topic'],
    },
  },
  {
    name: 'find_open_tables',
    description: 'Find available tables for a party size at a specific date and time. Date format: YYYY-MM-DD. Time format: HH:MM (24h).',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        party_size: { type: SchemaType.INTEGER },
        date: { type: SchemaType.STRING },
        time: { type: SchemaType.STRING },
      },
      required: ['party_size', 'date', 'time'],
    },
  },
  {
    name: 'create_pending_booking',
    description: 'Create a pending booking after confirming details with the guest. Date format: YYYY-MM-DD. Time format: HH:MM (24h). Never call this without explicit guest confirmation.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        guest_name: { type: SchemaType.STRING },
        guest_phone: { type: SchemaType.STRING },
        party_size: { type: SchemaType.INTEGER },
        date: { type: SchemaType.STRING },
        time: { type: SchemaType.STRING },
        notes: { type: SchemaType.STRING },
      },
      required: ['guest_name', 'guest_phone', 'party_size', 'date', 'time'],
    },
  },
  {
    name: 'get_booking_status',
    description: 'Get the status of a booking by its reference code (e.g. LT-A1B2C3).',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        reference: { type: SchemaType.STRING },
      },
      required: ['reference'],
    },
  },
];

export function getGeminiModel() {
  return genAI.getGenerativeModel({
    model: modelName,
    tools: [{ functionDeclarations: functions }],
    toolConfig: { functionCallingConfig: { mode: 'AUTO' as any } },
  });
}

export const SYSTEM_PROMPT = `You are Juniper, the warm and efficient voice host at Lantern & Thyme, a cozy bistro. You help guests with questions and take reservation requests.

Rules:
- Keep replies short and warm (1-2 sentences) to stay within voice plan limits.
- Collect booking details: name, party size, date, time, phone, and any notes (allergies, occasion).
- Read the details back and get an explicit "yes" before creating a booking.
- If a slot is full, offer the 2 nearest open times.
- Never say "confirmed". Say: "I've sent your request to our host. You'll see it confirmed on this screen in a moment."
- Refuse past dates, parties over 8 ("please call us"), and times outside opening hours.
- Resolve relative dates like "Friday" or "tomorrow at 7" in the restaurant timezone (America/New_York).
- Don't make up menu items or policies. Use get_restaurant_info for facts.
- Today's date is ${new Date().toISOString().split('T')[0]}.
`;
