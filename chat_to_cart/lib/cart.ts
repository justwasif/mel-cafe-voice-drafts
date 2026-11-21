/**
 * Server-side cart store.
 *
 * Keyed by an httpOnly signed cookie (SESSION_SECRET).  Carts live in
 * memory and are mirrored to `data/carts.json` so they survive a restart.
 *
 * Exports for checkout callers:
 *   - readCart(cookieValue?)  → the cart for a session
 *   - mutateCart(...)          → apply a change and persist
 *   - revalidateCart(cart)     → re-read every price/stock level from Shopify
 *
 * Nothing here talks to the network except `revalidateCart`, which uses the
 * shared `lib/catalogue` helpers.
 */

import { createHmac, timingSafeEqual, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import {
  CatalogueProduct,
  CatalogueVariant,
  getVariantById,
  fetchCatalogue,
} from './catalogue';

// ── Types ─────────────────────────────────────────────────────────────

export interface CartLine {
  /** Stable line identifier (cart-local, not Shopify's) */
  id: string;
  /** Shopify product ID */
  productId: string;
  /** Shopify variant ID */
  variantId: string;
  title: string;
  size: string;
  /** Unit price captured when the line was added (re-checked at checkout) */
  price: number;
  quantity: number;
  image: string | null;
}

export interface Cart {
  id: string;
  lines: CartLine[];
  createdAt: string;
  updatedAt: string;
}

/** Result of re-validating a cart against live Shopify data. */
export interface RevalidatedCart {
  cart: Cart;
  /** Lines whose price changed since they were added */
  priceChanges: Array<{
    lineId: string;
    title: string;
    oldPrice: number;
    newPrice: number;
  }>;
  /** Lines that are now out of stock or under-stocked */
  stockIssues: Array<{
    lineId: string;
    title: string;
    requested: number;
    available: number;
  }>;
  /** Lines whose variant no longer exists in the catalogue */
  removedLines: Array<{ lineId: string; title: string }>;
  /** True when nothing at all changed */
  unchanged: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────

export const CART_COOKIE_NAME = 'northwind_cart';
const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'carts.json');
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

// ── In-memory store ───────────────────────────────────────────────────

const carts = new Map<string, Cart>();

// ── Cookie signing ────────────────────────────────────────────────────

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 8) {
    throw new Error(
      'SESSION_SECRET is required to sign the cart cookie (min 8 characters).',
    );
  }
  return secret;
}

/** Sign a cart id → `id.signature` (hex HMAC-SHA256). */
export function signCartId(cartId: string): string {
  const sig = createHmac('sha256', getSecret())
    .update(cartId)
    .digest('hex');
  return `${cartId}.${sig}`;
}

/** Verify and extract the cart id from a signed cookie value. */
export function unsignCartId(cookieValue: string | undefined | null): string | null {
  if (!cookieValue) return null;
  const idx = cookieValue.lastIndexOf('.');
  if (idx <= 0) return null;
  const cartId = cookieValue.slice(0, idx);
  const sig = cookieValue.slice(idx + 1);
  const expected = createHmac('sha256', getSecret()).update(cartId).digest('hex');
  if (sig.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  return cartId;
}

/**
 * Parse a raw `Cookie` header and return the signed cart id inside it.
 * Tolerates missing, malformed or tampered cookies by returning `null`.
 */
export function readCartIdFromCookieHeader(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name !== CART_COOKIE_NAME) continue;
    const value = decodeURIComponent(part.slice(eq + 1).trim());
    const id = unsignCartId(value);
    if (id) return id;
  }
  return null;
}

// ── Persistence ───────────────────────────────────────────────────────

interface PersistedCarts {
  [cartId: string]: Cart;
}

async function loadFromDisk(): Promise<void> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw) as PersistedCarts;
    for (const [id, cart] of Object.entries(parsed ?? {})) {
      if (cart && Array.isArray(cart.lines)) {
        carts.set(id, cart);
      }
    }
  } catch {
    // No file yet, or it is unreadable/corrupt — start from memory only.
  }
}

let loadPromise: Promise<void> | null = null;

/** Ensure the in-memory store has been seeded from disk (idempotent). */
export async function hydrateCarts(): Promise<void> {
  if (!loadPromise) loadPromise = loadFromDisk();
  await loadPromise;
}

async function persist(): Promise<void> {
  const snapshot: PersistedCarts = {};
  for (const [id, cart] of carts) snapshot[id] = cart;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(snapshot, null, 2), 'utf8');
  } catch {
    // Persistence is best-effort; the in-memory copy is authoritative.
  }
}

// ── Core cart operations ──────────────────────────────────────────────

function emptyCart(id: string): Cart {
  const now = new Date().toISOString();
  return { id, lines: [], createdAt: now, updatedAt: now };
}

/**
 * Read the cart for a session.
 *
 * @param cookieValue the raw signed cookie value (e.g. `abc.def`). When
 *   omitted a brand-new cart id is minted and returned in `cookieValue`.
 */
export async function readCart(
  cookieValue?: string | null,
): Promise<{ cart: Cart; cookieValue: string }> {
  await hydrateCarts();

  let cartId = unsignCartId(cookieValue);
  if (!cartId) {
    cartId = randomUUID();
  }

  let cart = carts.get(cartId);
  if (!cart) {
    cart = emptyCart(cartId);
    carts.set(cartId, cart);
  }

  return { cart, cookieValue: signCartId(cartId) };
}

/** Read a cart by an already-unpacked cart id (no cookie round-trip). */
export async function readCartById(cartId: string): Promise<Cart | null> {
  await hydrateCarts();
  // The order page can run in a module instance that hydrated before this
  // cart was written. Re-read the file once when the id is missing.
  if (!carts.has(cartId)) await loadFromDisk();
  return carts.get(cartId) ?? null;
}

/** Persist the current in-memory state to `data/carts.json`. */
export async function flushCarts(): Promise<void> {
  await hydrateCarts();
  await persist();
}

/** Remove a cart entirely (used after a successful checkout). */
export async function clearCart(cartId: string): Promise<void> {
  await hydrateCarts();
  carts.delete(cartId);
  await persist();
}

/**
 * Apply a mutation to a cart and persist it.
 * The mutator receives a deep-ish copy and returns the lines to store.
 */
export async function mutateCart(
  cartId: string,
  mutator: (lines: CartLine[]) => CartLine[] | void,
): Promise<Cart> {
  await hydrateCarts();
  const cart = carts.get(cartId) ?? emptyCart(cartId);
  const nextLines = mutator(cart.lines.map(l => ({ ...l })));
  const lines = nextLines ?? cart.lines;
  const updated: Cart = {
    ...cart,
    lines,
    updatedAt: new Date().toISOString(),
  };
  carts.set(cartId, updated);
  await persist();
  return updated;
}

/** Append a line, merging into an existing line for the same variant. */
export function addLine(
  lines: CartLine[],
  line: Omit<CartLine, 'id'> & { id?: string },
): CartLine[] {
  const existing = lines.find(l => l.variantId === line.variantId);
  if (existing) {
    return lines.map(l =>
      l.variantId === line.variantId
        ? { ...l, quantity: l.quantity + line.quantity, price: line.price }
        : l,
    );
  }
  return [
    ...lines,
    { ...line, id: line.id ?? randomUUID() } as CartLine,
  ];
}

/** Set the quantity of a line; quantity <= 0 removes it. */
export function setLineQuantity(
  lines: CartLine[],
  lineId: string,
  quantity: number,
): CartLine[] {
  if (quantity <= 0) return lines.filter(l => l.id !== lineId);
  return lines.map(l => (l.id === lineId ? { ...l, quantity } : l));
}

/** Remove a line by id. */
export function removeLine(lines: CartLine[], lineId: string): CartLine[] {
  return lines.filter(l => l.id !== lineId);
}

/**
 * Server-calculated cart total.  Always sums the unit price × quantity
 * stored on the line — never a client-supplied amount.
 */
export function cartSubtotal(lines: CartLine[]): number {
  const total = lines.reduce(
    (sum, line) => sum + line.price * line.quantity,
    0,
  );
  // Round to cents to avoid float drift (0.1 + 0.2 problems).
  return Math.round(total * 100) / 100;
}

/** Total number of items in the cart (for the header badge). */
export function cartItemCount(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

// ── Revalidation against live Shopify ─────────────────────────────────

/**
 * Re-read every price and stock level for the cart's lines from Shopify.
 *
 * Returns the cart with updated prices, plus a list of changes so the
 * checkout flow can show the shopper what moved and ask again.
 */
export async function revalidateCart(
  cart: Cart,
): Promise<RevalidatedCart> {
  const priceChanges: RevalidatedCart['priceChanges'] = [];
  const stockIssues: RevalidatedCart['stockIssues'] = [];
  const removedLines: RevalidatedCart['removedLines'] = [];

  const catalogue = await fetchCatalogue();
  const variantIndex = new Map<string, { product: CatalogueProduct; variant: CatalogueVariant }>();
  for (const product of catalogue) {
    for (const variant of product.variants) {
      variantIndex.set(variant.id, { product, variant });
    }
  }

  const lines: CartLine[] = [];

  for (const line of cart.lines) {
    const found = variantIndex.get(line.variantId);

    if (!found) {
      // The variant is gone from the restricted catalogue.
      removedLines.push({ lineId: line.id, title: line.title });
      continue;
    }

    const { product, variant } = found;
    const newPrice = Number(variant.price);

    if (newPrice !== line.price) {
      priceChanges.push({
        lineId: line.id,
        title: line.title,
        oldPrice: line.price,
        newPrice,
      });
    }

    if (variant.stock < line.quantity) {
      stockIssues.push({
        lineId: line.id,
        title: line.title,
        requested: line.quantity,
        available: variant.stock,
      });
    }

    lines.push({
      ...line,
      productId: product.id,
      title: product.title,
      size: variant.size,
      price: newPrice,
      image: product.image,
      // Clamp to what is actually available (0 → drop the line).
      quantity: Math.min(line.quantity, variant.stock),
    });
  }

  const finalLines = lines.filter(l => l.quantity > 0);
  const unchanged =
    priceChanges.length === 0 &&
    stockIssues.length === 0 &&
    removedLines.length === 0;

  const updated: Cart = {
    ...cart,
    lines: finalLines,
    updatedAt: new Date().toISOString(),
  };

  // Persist the refreshed cart (prices/stock may have moved).
  await hydrateCarts();
  carts.set(cart.id, updated);
  await persist();

  return { cart: updated, priceChanges, stockIssues, removedLines, unchanged };
}

/**
 * Convenience for the checkout route: re-read prices/stock and return the
 * Stripe-ready line items built **only** from live Shopify values.
 */
export async function buildCheckoutLines(cart: Cart): Promise<{
  lines: Array<{
    lineId: string;
    title: string;
    size: string;
    quantity: number;
    unitPrice: number;
    image: string | null;
  }>;
  total: number;
  currency: string;
  revalidation: RevalidatedCart;
}> {
  const revalidation = await revalidateCart(cart);
  return {
    lines: revalidation.cart.lines.map(l => ({
      lineId: l.id,
      title: l.title,
      size: l.size,
      quantity: l.quantity,
      unitPrice: l.price,
      image: l.image,
    })),
    total: cartSubtotal(revalidation.cart.lines),
    currency: process.env.STORE_CURRENCY || 'USD',
    revalidation,
  };
}

/** Re-export so callers can fetch a single variant without two imports. */
export { getVariantById };
