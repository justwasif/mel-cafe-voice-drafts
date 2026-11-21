/**
 * Pure unit tests for lib/cart.ts.
 *
 * `lib/catalogue` is mocked so revalidation can be tested with controlled
 * data, and `SESSION_SECRET` is set in-process. No filesystem or network
 * is required: the cart store writes to `data/carts.json` best-effort and
 * the in-memory copy is authoritative.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

vi.mock('../lib/catalogue', () => ({
  fetchCatalogue: vi.fn(),
  getVariantById: vi.fn(),
}));

import { fetchCatalogue } from '../lib/catalogue';
import {
  signCartId,
  unsignCartId,
  readCartIdFromCookieHeader,
  readCart,
  readCartById,
  mutateCart,
  addLine,
  setLineQuantity,
  removeLine,
  cartSubtotal,
  cartItemCount,
  revalidateCart,
  buildCheckoutLines,
  clearCart,
  CART_COOKIE_NAME,
  CartLine,
} from '../lib/cart';

// ── Shared fixtures ───────────────────────────────────────────────────

const SECRET = 'test-session-secret-1234';

beforeAll(() => {
  process.env.SESSION_SECRET = SECRET;
  process.env.STORE_CURRENCY = 'USD';
});

function line(overrides: Partial<CartLine> = {}): CartLine {
  return {
    id: 'line-1',
    productId: 'gid://shopify/Product/Field-Jacket',
    variantId: 'gid://shopify/ProductVariant/fj-m',
    title: 'Field Jacket',
    size: 'M',
    price: 149,
    quantity: 1,
    image: 'https://cdn.shopify.com/fj.jpg',
    ...overrides,
  };
}

function catalogueWith(variants: Array<{ id: string; price: string; stock: number; size: string }>, productTitle = 'Field Jacket') {
  return [
    {
      id: 'gid://shopify/Product/Field-Jacket',
      title: productTitle,
      description: '',
      image: 'https://cdn.shopify.com/fj.jpg',
      imageAlt: productTitle,
      variants: variants.map(v => ({
        id: v.id,
        size: v.size,
        price: v.price,
        stock: v.stock,
      })),
    },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Cookie signing ────────────────────────────────────────────────────

describe('cart: signed cookie', () => {
  it('signCartId produces id.signature', () => {
    const signed = signCartId('abc-123');
    expect(signed).toMatch(/^abc-123\.[0-9a-f]+$/);
  });

  it('unsignCartId round-trips a valid signature', () => {
    const signed = signCartId('abc-123');
    expect(unsignCartId(signed)).toBe('abc-123');
  });

  it('unsignCartId rejects a tampered signature', () => {
    const signed = signCartId('abc-123');
    const tampered = signed.slice(0, -1) + '0';
    expect(unsignCartId(tampered)).toBeNull();
  });

  it('unsignCartId rejects a different secret', () => {
    const signed = signCartId('abc-123');
    process.env.SESSION_SECRET = 'a-different-secret-xyz';
    expect(unsignCartId(signed)).toBeNull();
    process.env.SESSION_SECRET = SECRET;
  });

  it('unsignCartId rejects undefined / malformed values', () => {
    expect(unsignCartId(undefined)).toBeNull();
    expect(unsignCartId(null)).toBeNull();
    expect(unsignCartId('')).toBeNull();
    expect(unsignCartId('no-dot')).toBeNull();
  });

  it('readCartIdFromCookieHeader finds and verifies the cart cookie', () => {
    const signed = signCartId('cart-xyz');
    const header = `theme=dark; ${CART_COOKIE_NAME}=${encodeURIComponent(signed)}; other=1`;
    expect(readCartIdFromCookieHeader(header)).toBe('cart-xyz');
  });

  it('readCartIdFromCookieHeader returns null when the cookie is missing or tampered', () => {
    expect(readCartIdFromCookieHeader(null)).toBeNull();
    expect(readCartIdFromCookieHeader('theme=dark')).toBeNull();
    expect(readCartIdFromCookieHeader(`${CART_COOKIE_NAME}=tampered.value`)).toBeNull();
  });
});

// ── Pure line helpers ─────────────────────────────────────────────────

describe('cart: pure line helpers', () => {
  it('addLine merges quantity for the same variant', () => {
    const l1 = line({ id: 'a', variantId: 'v1', quantity: 1 });
    const result = addLine([l1], { ...l1, quantity: 2 });
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(3);
  });

  it('addLine appends a new line for a new variant', () => {
    const l1 = line({ id: 'a', variantId: 'v1' });
    const l2 = line({ id: 'b', variantId: 'v2' });
    expect(addLine([l1], l2)).toHaveLength(2);
  });

  it('addLine assigns an id when none is provided', () => {
    const result = addLine([], line({ id: undefined } as any));
    expect(result[0].id).toBeTruthy();
  });

  it('setLineQuantity updates the quantity', () => {
    const l1 = line({ id: 'a', quantity: 1 });
    expect(setLineQuantity([l1], 'a', 3)[0].quantity).toBe(3);
  });

  it('setLineQuantity removes the line when quantity <= 0', () => {
    const l1 = line({ id: 'a' });
    expect(setLineQuantity([l1], 'a', 0)).toHaveLength(0);
    expect(setLineQuantity([l1], 'a', -1)).toHaveLength(0);
  });

  it('removeLine drops the matching line', () => {
    const l1 = line({ id: 'a' });
    const l2 = line({ id: 'b' });
    expect(removeLine([l1, l2], 'a')).toHaveLength(1);
    expect(removeLine([l1, l2], 'a')[0].id).toBe('b');
  });

  it('cartSubtotal sums price × quantity and rounds to cents', () => {
    const lines = [
      line({ id: 'a', price: 149, quantity: 2 }),
      line({ id: 'b', price: 14.0, quantity: 1 }),
    ];
    expect(cartSubtotal(lines)).toBe(312);
  });

  it('cartSubtotal avoids float drift', () => {
    const lines = [
      line({ id: 'a', price: 0.1, quantity: 1 }),
      line({ id: 'b', price: 0.2, quantity: 1 }),
    ];
    expect(cartSubtotal(lines)).toBe(0.3);
  });

  it('cartItemCount sums quantities', () => {
    const lines = [line({ quantity: 2 }), line({ quantity: 3, id: 'b', variantId: 'v2' })];
    expect(cartItemCount(lines)).toBe(5);
  });
});

// ── readCart / mutateCart ─────────────────────────────────────────────

describe('cart: readCart & mutateCart', () => {
  it('readCart mints a new signed cookie when none is provided', async () => {
    const { cart, cookieValue } = await readCart(null);
    expect(cart.lines).toEqual([]);
    expect(unsignCartId(cookieValue)).toBe(cart.id);
  });

  it('readCart returns the same cart for a valid cookie', async () => {
    const first = await readCart(null);
    const second = await readCart(first.cookieValue);
    expect(second.cart.id).toBe(first.cart.id);
  });

  it('readCart mints a new cart for a tampered cookie', async () => {
    const first = await readCart(null);
    const tampered = first.cookieValue.slice(0, -1) + '0';
    const second = await readCart(tampered);
    expect(second.cart.id).not.toBe(first.cart.id);
  });

  it('mutateCart applies a mutation and persists it', async () => {
    const { cart } = await readCart(null);
    const updated = await mutateCart(cart.id, lines =>
      addLine(lines, line({ id: 'l1' })),
    );
    expect(updated.lines).toHaveLength(1);

    const reloaded = await readCartById(cart.id);
    expect(reloaded?.lines).toHaveLength(1);
  });

  it('clearCart removes the cart', async () => {
    const { cart } = await readCart(null);
    await mutateCart(cart.id, lines => addLine(lines, line()));
    await clearCart(cart.id);
    expect(await readCartById(cart.id)).toBeNull();
  });
});

// ── revalidateCart ────────────────────────────────────────────────────

describe('cart: revalidateCart', () => {
  it('reports unchanged when prices and stock match', async () => {
    (fetchCatalogue as ReturnType<typeof vi.fn>).mockResolvedValue(
      catalogueWith([{ id: 'gid://shopify/ProductVariant/fj-m', price: '149.00', stock: 9, size: 'M' }]),
    );
    const { cart } = await readCart(null);
    await mutateCart(cart.id, lines =>
      addLine(lines, line({ variantId: 'gid://shopify/ProductVariant/fj-m', price: 149, quantity: 1 })),
    );
    const result = await revalidateCart(cart);
    expect(result.unchanged).toBe(true);
    expect(result.priceChanges).toHaveLength(0);
    expect(result.stockIssues).toHaveLength(0);
  });

  it('reports a price change', async () => {
    (fetchCatalogue as ReturnType<typeof vi.fn>).mockResolvedValue(
      catalogueWith([{ id: 'gid://shopify/ProductVariant/fj-m', price: '159.00', stock: 9, size: 'M' }]),
    );
    const { cart } = await readCart(null);
    await mutateCart(cart.id, lines =>
      addLine(lines, line({ variantId: 'gid://shopify/ProductVariant/fj-m', price: 149, quantity: 1 })),
    );
    const stored = (await readCartById(cart.id))!;
    const result = await revalidateCart(stored);
    expect(result.unchanged).toBe(false);
    expect(result.priceChanges).toHaveLength(1);
    expect(result.priceChanges[0]).toMatchObject({ oldPrice: 149, newPrice: 159 });
    // The cart line is updated to the new price.
    expect(result.cart.lines[0].price).toBe(159);
  });

  it('reports a stock issue and clamps quantity to available', async () => {
    (fetchCatalogue as ReturnType<typeof vi.fn>).mockResolvedValue(
      catalogueWith([{ id: 'gid://shopify/ProductVariant/fj-m', price: '149.00', stock: 3, size: 'M' }]),
    );
    const { cart } = await readCart(null);
    await mutateCart(cart.id, lines =>
      addLine(lines, line({ variantId: 'gid://shopify/ProductVariant/fj-m', quantity: 5 })),
    );
    const stored = (await readCartById(cart.id))!;
    const result = await revalidateCart(stored);
    expect(result.stockIssues).toHaveLength(1);
    expect(result.stockIssues[0]).toMatchObject({ requested: 5, available: 3 });
    expect(result.cart.lines[0].quantity).toBe(3);
  });

  it('removes lines whose variant no longer exists', async () => {
    (fetchCatalogue as ReturnType<typeof vi.fn>).mockResolvedValue(catalogueWith([]));
    const { cart } = await readCart(null);
    await mutateCart(cart.id, lines => addLine(lines, line({ variantId: 'gid://shopify/ProductVariant/gone' })));
    const stored = (await readCartById(cart.id))!;
    const result = await revalidateCart(stored);
    expect(result.removedLines).toHaveLength(1);
    expect(result.cart.lines).toHaveLength(0);
  });

  it('drops a line that became out of stock (stock 0)', async () => {
    (fetchCatalogue as ReturnType<typeof vi.fn>).mockResolvedValue(
      catalogueWith([{ id: 'gid://shopify/ProductVariant/fj-m', price: '149.00', stock: 0, size: 'M' }]),
    );
    const { cart } = await readCart(null);
    await mutateCart(cart.id, lines => addLine(lines, line({ variantId: 'gid://shopify/ProductVariant/fj-m', quantity: 1 })));
    const stored = (await readCartById(cart.id))!;
    const result = await revalidateCart(stored);
    expect(result.cart.lines).toHaveLength(0);
  });
});

// ── buildCheckoutLines ────────────────────────────────────────────────

describe('cart: buildCheckoutLines', () => {
  it('builds lines from live Shopify prices and returns the total + currency', async () => {
    (fetchCatalogue as ReturnType<typeof vi.fn>).mockResolvedValue(
      catalogueWith([{ id: 'gid://shopify/ProductVariant/fj-m', price: '149.00', stock: 9, size: 'M' }]),
    );
    const { cart } = await readCart(null);
    await mutateCart(cart.id, lines => addLine(lines, line({ variantId: 'gid://shopify/ProductVariant/fj-m', quantity: 2 })));
    const stored = (await readCartById(cart.id))!;

    const checkout = await buildCheckoutLines(stored);
    expect(checkout.lines).toHaveLength(1);
    expect(checkout.lines[0].unitPrice).toBe(149);
    expect(checkout.lines[0].quantity).toBe(2);
    expect(checkout.total).toBe(298);
    expect(checkout.currency).toBe('USD');
  });

  it('total is built from Shopify prices only, not from the stored cart', async () => {
    // Cart was built at $149, but Shopify now says $199.
    (fetchCatalogue as ReturnType<typeof vi.fn>).mockResolvedValue(
      catalogueWith([{ id: 'gid://shopify/ProductVariant/fj-m', price: '199.00', stock: 9, size: 'M' }]),
    );
    const { cart } = await readCart(null);
    await mutateCart(cart.id, lines => addLine(lines, line({ variantId: 'gid://shopify/ProductVariant/fj-m', price: 149, quantity: 1 })));
    const stored = (await readCartById(cart.id))!;

    const checkout = await buildCheckoutLines(stored);
    expect(checkout.lines[0].unitPrice).toBe(199);
    expect(checkout.total).toBe(199);
    expect(checkout.revalidation.priceChanges).toHaveLength(1);
  });
});
