/**
 * Assistant shopping tools for Chat-to-Cart.
 *
 * Each tool is a pure async function that talks to Shopify via the
 * catalogue helpers (`lib/catalogue`) and the cart store (`lib/cart`).
 * Tools return structured data so `lib/gemini.ts` can attach them to
 * `tool_data` and the chat widget can render rich cards.
 *
 * Prices, titles, stock and images always come from Shopify at the moment
 * of the call — never from the model.
 */

import {
  CatalogueProduct,
  searchCatalogue,
  getProductById,
  getVariantById,
} from './catalogue';
import {
  Cart,
  readCartById,
  mutateCart,
  addLine,
  setLineQuantity,
  removeLine,
  cartSubtotal,
  cartItemCount,
  buildCheckoutLines,
  revalidateCart,
  RevalidatedCart,
} from './cart';

// ── Tool result types ─────────────────────────────────────────────────

export interface SearchResult {
  ok: true;
  query: string;
  count: number;
  products: readonly CatalogueProduct[];
}

export interface ProductDetailResult {
  ok: true;
  product: CatalogueProduct;
}

export interface ProductNotFound {
  ok: false;
  message: string;
}

/** Compact cart view shared by the mutating tools. */
export interface CartView {
  id: string;
  itemCount: number;
  total: number;
  currency: string;
  lines: Array<{
    id: string;
    productTitle: string;
    size: string;
    quantity: number;
    unitPrice: number;
    image: string | null;
  }>;
}

export interface AddToCartResult {
  ok: true;
  lineId: string;
  productTitle: string;
  size: string;
  quantity: number;
  unitPrice: number;
  cart: CartView;
}

export interface AddToCartError {
  ok: false;
  reason: 'variant_not_found' | 'out_of_stock' | 'invalid_quantity' | 'cart_not_found';
  message: string;
  inStockSizes?: Array<{ size: string; stock: number; variantId: string }>;
}

export interface UpdateCartResult {
  ok: true;
  lineId: string;
  quantity: number;
  cart: CartView;
}

export interface UpdateCartError {
  ok: false;
  reason: 'line_not_found' | 'out_of_stock' | 'invalid_quantity' | 'cart_not_found';
  message: string;
}

export interface RemoveFromCartResult {
  ok: true;
  removedLineId: string;
  cart: CartView;
}

export interface ViewCartResult {
  ok: true;
  empty: boolean;
  itemCount: number;
  total: number;
  currency: string;
  lines: CartView['lines'];
}

export interface ProposeCheckoutResult {
  ok: true;
  itemCount: number;
  total: number;
  currency: string;
  lines: CartView['lines'];
  /** Whether every price/stock level matched the cart at checkout time. */
  unchanged: boolean;
}

export interface CartError {
  ok: false;
  reason: 'cart_not_found';
  message: string;
}

// ── Internal: build the compact cart representation used by tools ─────

function toolCartView(cart: Cart): CartView {
  return {
    id: cart.id,
    itemCount: cartItemCount(cart.lines),
    total: cartSubtotal(cart.lines),
    currency: process.env.STORE_CURRENCY || 'USD',
    lines: cart.lines.map(l => ({
      id: l.id,
      productTitle: l.title,
      size: l.size,
      quantity: l.quantity,
      unitPrice: l.price,
      image: l.image,
    })),
  };
}

// ── 1. search_products ────────────────────────────────────────────────

export async function searchProducts(options: {
  query: string;
  max_price?: number;
  size?: string;
  category?: string;
  limit?: number;
}): Promise<SearchResult> {
  const products = await searchCatalogue({
    query: options.query,
    maxPrice: options.max_price,
    size: options.size,
    category: options.category,
    limit: options.limit ?? 6,
  });
  return {
    ok: true,
    query: options.query,
    count: products.length,
    products,
  };
}

// ── 2. get_product ────────────────────────────────────────────────────

export async function getProduct(
  id: string,
): Promise<ProductDetailResult | ProductNotFound> {
  const product = await getProductById(id);
  if (!product) {
    return { ok: false, message: `Product ${id} was not found in the catalogue.` };
  }
  return { ok: true, product };
}

// ── 3. add_to_cart ────────────────────────────────────────────────────

export async function addToCart(
  cartId: string,
  variantId: string,
  quantity: number,
): Promise<AddToCartResult | AddToCartError | CartError> {
  if (!Number.isInteger(quantity) || quantity < 1) {
    return {
      ok: false,
      reason: 'invalid_quantity',
      message: 'Quantity must be at least 1.',
    };
  }

  const cart = await readCartById(cartId);
  if (!cart) {
    return {
      ok: false,
      reason: 'cart_not_found',
      message: 'No cart found for this session.',
    };
  }

  const found = await getVariantById(variantId);
  if (!found) {
    return {
      ok: false,
      reason: 'variant_not_found',
      message: 'That product variant is not available.',
    };
  }

  const { product, variant } = found;

  if (variant.stock < quantity) {
    // Surface in-stock alternatives for the same product so the assistant
    // can offer another size without a second search.
    const inStockSizes = product.variants
      .filter(v => v.stock > 0)
      .map(v => ({ size: v.size, stock: v.stock, variantId: v.id }));
    return {
      ok: false,
      reason: 'out_of_stock',
      message: `${product.title} in size ${variant.size} has ${variant.stock} left — not enough for ${quantity}.`,
      inStockSizes,
    };
  }

  const updated = await mutateCart(cartId, lines =>
    addLine(lines, {
      productId: product.id,
      variantId: variant.id,
      title: product.title,
      size: variant.size,
      price: Number(variant.price),
      quantity,
      image: product.image,
    }),
  );

  const newLine = updated.lines.find(l => l.variantId === variant.id)!;

  return {
    ok: true,
    lineId: newLine.id,
    productTitle: product.title,
    size: variant.size,
    quantity: newLine.quantity,
    unitPrice: newLine.price,
    cart: toolCartView(updated),
  };
}

// ── 4. update_cart ────────────────────────────────────────────────────

export async function updateCart(
  cartId: string,
  lineId: string,
  quantity: number,
): Promise<UpdateCartResult | UpdateCartError | CartError> {
  if (!Number.isInteger(quantity) || quantity < 0) {
    return {
      ok: false,
      reason: 'invalid_quantity',
      message: 'Quantity must be 0 or more.',
    };
  }

  const cart = await readCartById(cartId);
  if (!cart) {
    return {
      ok: false,
      reason: 'cart_not_found',
      message: 'No cart found for this session.',
    };
  }

  const line = cart.lines.find(l => l.id === lineId);
  if (!line) {
    return {
      ok: false,
      reason: 'line_not_found',
      message: 'That cart line was not found.',
    };
  }

  if (quantity === 0) {
    const updated = await mutateCart(cartId, lines => removeLine(lines, lineId));
    return { ok: true, lineId, quantity: 0, cart: toolCartView(updated) };
  }

  // Re-check stock for this variant at update time.
  const found = await getVariantById(line.variantId);
  if (!found || found.variant.stock < quantity) {
    return {
      ok: false,
      reason: 'out_of_stock',
      message: found
        ? `${line.title} in size ${line.size} only has ${found.variant.stock} left.`
        : `${line.title} is no longer available.`,
    };
  }

  const updated = await mutateCart(cartId, lines =>
    setLineQuantity(lines, lineId, quantity),
  );
  return {
    ok: true,
    lineId,
    quantity,
    cart: toolCartView(updated),
  };
}

// ── 5. remove_from_cart ───────────────────────────────────────────────

export async function removeFromCart(
  cartId: string,
  lineId: string,
): Promise<RemoveFromCartResult | UpdateCartError | CartError> {
  const cart = await readCartById(cartId);
  if (!cart) {
    return {
      ok: false,
      reason: 'cart_not_found',
      message: 'No cart found for this session.',
    };
  }

  const line = cart.lines.find(l => l.id === lineId);
  if (!line) {
    return {
      ok: false,
      reason: 'line_not_found',
      message: 'That cart line was not found.',
    };
  }

  const updated = await mutateCart(cartId, lines => removeLine(lines, lineId));
  return {
    ok: true,
    removedLineId: lineId,
    cart: toolCartView(updated),
  };
}

// ── 6. view_cart ──────────────────────────────────────────────────────

export async function viewCart(
  cartId: string,
): Promise<ViewCartResult | CartError> {
  const cart = await readCartById(cartId);
  if (!cart) {
    return {
      ok: false,
      reason: 'cart_not_found',
      message: 'No cart found for this session.',
    };
  }

  const view = toolCartView(cart);
  return {
    ok: true,
    empty: cart.lines.length === 0,
    itemCount: view.itemCount,
    total: view.total,
    currency: view.currency,
    lines: view.lines,
  };
}

// ── 7. propose_checkout ───────────────────────────────────────────────

/**
 * Returns a checkout card view for the shopper to approve.
 * Does **not** create a payment or Stripe session.
 *
 * Internally re-reads prices/stock from Shopify (via `buildCheckoutLines`)
 * and updates the cart so the checkout card is always based on live values.
 */
export async function proposeCheckout(
  cartId: string,
): Promise<ProposeCheckoutResult | CartError> {
  const cart = await readCartById(cartId);
  if (!cart) {
    return {
      ok: false,
      reason: 'cart_not_found',
      message: 'No cart found for this session.',
    };
  }

  const checkout = await buildCheckoutLines(cart);
  const itemCount = checkout.lines.reduce((sum, l) => sum + l.quantity, 0);
  return {
    ok: true,
    itemCount,
    total: checkout.total,
    currency: checkout.currency,
    lines: checkout.lines.map(l => ({
      id: l.lineId,
      productTitle: l.title,
      size: l.size,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      image: l.image,
    })),
    unchanged: checkout.revalidation.unchanged,
  };
}

/**
 * Re-check cart against Shopify and return the full revalidation object.
 * Exposed so checkout callers can detect price/stock drift before
 * creating a Stripe session.
 */
export async function revalidateCartForCheckout(
  cartId: string,
): Promise<({ ok: true } & RevalidatedCart) | CartError> {
  const cart = await readCartById(cartId);
  if (!cart) {
    return {
      ok: false,
      reason: 'cart_not_found',
      message: 'No cart found for this session.',
    };
  }
  const revalidation = await revalidateCart(cart);
  return { ok: true, ...revalidation };
}

// ── Removed Store Concierge tools (kept as loud failures) ────────────
// `lib/gemini.ts` previously imported these names. They are not part of
// Chat-to-Cart; calling one throws so a stale import surfaces immediately
// instead of silently doing the wrong thing.

export const lookupOrder = async (): Promise<never> => {
  throw new Error('lookupOrder is not part of Chat-to-Cart. Use viewCart / getProduct instead.');
};
export const sizeHelp = async (): Promise<never> => {
  throw new Error('sizeHelp is not part of Chat-to-Cart. Use getProduct instead.');
};
export const getPolicy = async (): Promise<never> => {
  throw new Error('getPolicy is not part of Chat-to-Cart.');
};
export const requestRefund = async (): Promise<never> => {
  throw new Error('requestRefund is not part of Chat-to-Cart.');
};
export const proposeDiscount = async (): Promise<never> => {
  throw new Error('proposeDiscount is not part of Chat-to-Cart.');
};
export const requestStatus = async (): Promise<never> => {
  throw new Error('requestStatus is not part of Chat-to-Cart.');
};
