import { GoogleGenerativeAI, FunctionDeclaration, SchemaType } from '@google/generative-ai';
import { z } from 'zod';

const apiKey = process.env.GEMINI_API_KEY!;
const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

const genAI = new GoogleGenerativeAI(apiKey);

export const CafeToolSchemas = {
  search_menu: z.object({ query: z.string() }),
  add_item: z.object({
    item_name: z.string(),
    size: z.string().optional(),
    options: z.array(z.string()).optional(),
    qty: z.number().min(1).max(20).optional(),
  }),
  remove_item: z.object({ line_id: z.string() }),
  view_order: z.object({}),
  send_to_kitchen: z.object({}),
};

const functions: FunctionDeclaration[] = [
  {
    name: 'search_menu',
    description: 'Search the cafe menu by item name, category (coffee, tea, bakery, breakfast, cold_drinks), or keyword. Returns matching items with sizes, prices, options, and availability.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: { query: { type: SchemaType.STRING } },
      required: ['query'],
    },
  },
  {
    name: 'add_item',
    description: 'Add a menu item to the current order. Prices and availability come from search_menu. If size is not provided and the item has multiple sizes, ask the customer. If an item is sold out, refuse and suggest an alternative.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        item_name: { type: SchemaType.STRING },
        size: { type: SchemaType.STRING },
        options: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        qty: { type: SchemaType.INTEGER },
      },
      required: ['item_name'],
    },
  },
  {
    name: 'remove_item',
    description: 'Remove one line from the current order by its line_id. Use view_order to get line_ids.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: { line_id: { type: SchemaType.STRING } },
      required: ['line_id'],
    },
  },
  {
    name: 'view_order',
    description: 'Show the current order total, items, sizes, options, and unavailable lines.',
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: 'send_to_kitchen',
    description: 'Send the current order to the kitchen after the customer confirms. Only call when the customer explicitly agrees.',
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
];

export function getCafeGeminiModel() {
  return genAI.getGenerativeModel({
    model: modelName,
    tools: [{ functionDeclarations: functions }],
    toolConfig: { functionCallingConfig: { mode: 'AUTO' as any } },
  });
}

export const CAFE_SYSTEM_PROMPT = `You are Remy, the warm barista at Ember & Oat, a cozy neighborhood cafe. You take voice orders from customers.

Rules:
- Keep replies short and friendly (1-2 sentences) to stay within the voice plan limit.
- Use search_menu to find items; never make up prices or availability.
- If an item is sold out, politely say so and suggest a similar available item.
- For drinks with sizes, ask which size if the customer did not say one.
- Add items with add_item. Read back the running total with view_order.
- Only call send_to_kitchen when the customer explicitly confirms the order.
- Do not say "confirmed" or "paid" — those happen after kitchen staff confirm and after Stripe payment.
- Use the cafe timezone (${process.env.CAFE_TIMEZONE || 'America/New_York'}) if mentioning time.
- Today's date is ${new Date().toISOString().split('T')[0]}.
`;

