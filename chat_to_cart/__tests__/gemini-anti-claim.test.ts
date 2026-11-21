import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/tools', () => ({
  searchProducts: vi.fn(),
  getProduct: vi.fn(),
  addToCart: vi.fn(),
  updateCart: vi.fn(),
  removeFromCart: vi.fn(),
  viewCart: vi.fn(),
}));

import {
  searchProducts,
  getProduct,
  addToCart,
  updateCart,
  removeFromCart,
  viewCart,
} from '@/lib/tools';
import { runAssistant } from '@/lib/gemini';

const cartId = 'test-cart-id';

function assistantMsg(content: string) {
  return { role: 'assistant' as const, content };
}

function customerMsg(content: string) {
  return { role: 'customer' as const, content };
}

describe('runAssistant anti-claim guard', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not call add_to_cart when the model only claims it added an item', async () => {
    (addToCart as any).mockResolvedValue({
      ok: true,
      lineId: 'line-1',
      productTitle: 'Field Jacket',
      size: 'M',
      quantity: 1,
      unitPrice: 145,
      cart: { lines: [], total: '145.00', currency: 'USD', itemCount: 1 },
    });

    const model = {
      startChat: vi.fn().mockReturnValue({
        sendMessage: vi.fn().mockResolvedValue({
          response: {
            functionCalls: () => [],
            text: () => 'I have added the Field Jacket in M to your cart. Ready to check out?',
          },
        }),
      }),
    };

    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    vi.spyOn(GoogleGenerativeAI.prototype, 'getGenerativeModel').mockReturnValue(model as any);

    const messages = [customerMsg('Add the Field Jacket in M to my cart.')];
    const result = await runAssistant(cartId, messages);

    expect(addToCart).not.toHaveBeenCalled();
    expect(result.tool_data).toBeNull();
    expect(result.reply).toContain('added');
  });

  it('returns tool_data when add_to_cart is actually called', async () => {
    const addResult = {
      ok: true,
      lineId: 'line-1',
      productTitle: 'Field Jacket',
      size: 'M',
      quantity: 1,
      unitPrice: 145,
      cart: { lines: [], total: '145.00', currency: 'USD', itemCount: 1 },
    };
    (addToCart as any).mockResolvedValue(addResult);

    const model = {
      startChat: vi.fn().mockReturnValue({
        sendMessage: vi.fn().mockResolvedValue({
          response: {
            functionCalls: () => [
              { name: 'add_to_cart', args: { variant_id: 'variant-1', quantity: 1 } },
            ],
            text: () => 'Added the Field Jacket in M to your cart.',
          },
        }),
      }),
    };

    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    vi.spyOn(GoogleGenerativeAI.prototype, 'getGenerativeModel').mockReturnValue(model as any);

    const messages = [customerMsg('Add the Field Jacket in M to my cart.')];
    const result = await runAssistant(cartId, messages);

    expect(addToCart).toHaveBeenCalledWith(cartId, 'variant-1', 1);
    expect(result.tool_data).toEqual({ name: 'add_to_cart', result: addResult });
  });
});
