'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProductVariant = {
  id: string;
  size: string;
  price: string;
  stock: number;
};

export type Product = {
  id: string;
  title: string;
  description: string;
  image: string | null;
  imageAlt: string;
  variants: ProductVariant[];
};

/**
 * A cart line as the assistant tools return it (`CartView['lines']` in
 * `lib/tools.ts`): `id`, `productTitle`, `size`, `quantity`, `unitPrice`,
 * `image`.  The cart API route uses the same shape.
 */
export type CartLine = {
  id: string;
  productTitle: string;
  size: string;
  quantity: number;
  unitPrice: number;
  image: string | null;
};

/** A cart as the assistant tools return it (`CartView` in `lib/tools.ts`). */
export type Cart = {
  id: string;
  itemCount: number;
  total: number;
  currency: string;
  lines: CartLine[];
};

export type Message = {
  role: 'customer' | 'assistant';
  content: string;
  ts: string;
  toolData?: { name: string; result: any } | null;
};

export type ToolActivity = {
  label: string;
  detail?: string;
};

type PriceChange = {
  title: string;
  size: string;
  oldPrice: number;
  newPrice: number;
  oldStock: number;
  newStock: number;
  outOfStock?: boolean;
};

const CART_ENDPOINT = '/api/cart';
const CHECKOUT_ENDPOINT = '/api/checkout';

const SUGGESTION_CHIPS = [
  "A warm jacket in M under $150",
  'Merino sweater for a cold morning',
  'Socks and a belt to finish the look',
];

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function formatMoney(value: string | number | null | undefined, currency = 'USD'): string {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(n)) return '—';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2,
    }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

export function priceNumber(value: string | number | null | undefined): number {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(n) ? n : 0;
}

/** Stock label per the DESIGN status colours: in stock / low (≤5) / out of stock. */
export function stockLabel(stock: number): { text: string; className: string } {
  if (stock <= 0) return { text: 'Out of stock', className: 'text-nw-text-muted bg-[#F3F0EC]' };
  if (stock <= 5) return { text: `Low stock · ${stock} left`, className: 'text-nw-low-stock bg-[#FDF3E7]' };
  return { text: 'In stock', className: 'text-nw-stock bg-[#EAF5EE]' };
}

/** Title used for the grid filter bar, e.g. "Showing 4 picks from your assistant". */
export function picksLabel(count: number): string {
  return `Showing ${count} pick${count === 1 ? '' : 's'} from your assistant`;
}

/** Extracts the searchable product titles out of a `search_products` tool result. */
export function searchResultTitles(result: any): string[] {
  return searchResultProducts(result)
    .map((p: any) => (typeof p === 'string' ? p : p?.title))
    .filter((t: any): t is string => typeof t === 'string' && t.length > 0);
}

/** The product list carried by a `search_products` tool result. */
export function searchResultProducts(result: any): any[] {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  if (Array.isArray(result.products)) return result.products;
  if (Array.isArray(result.items)) return result.items;
  return [];
}

/** The single product carried by a `get_product` tool result. */
export function getProductResult(result: any): any | null {
  if (!result) return null;
  if (result.product) return result.product;
  if (Array.isArray(result.products)) return result.products[0] ?? null;
  return null;
}

/**
 * Normalises any cart-shaped tool result into the `Cart` shape the UI uses.
 * Handles the nested `CartView` returned by the mutating tools, the flat
 * `view_cart` result and the flat `propose_checkout` result.
 */
/** True when this product and size are already a line in the cart. */
export function sizeInCart(cart: Cart | null | undefined, title: string, size: string | null | undefined): boolean {
  if (!size) return false;
  return !!cart?.lines.some(l => l.productTitle === title && l.size === size && l.quantity > 0);
}

export function toCart(result: any): Cart | null {
  if (!result) return null;
  const source = result.cart ?? result;
  if (!source || !Array.isArray(source.lines)) return null;
  const lines: CartLine[] = source.lines.map((l: any) => ({
    id: l.id ?? l.line_id ?? l.variantId ?? l.variant_id ?? '',
    productTitle: l.productTitle ?? l.title ?? '',
    size: l.size ?? '',
    quantity: Number(l.quantity ?? 0),
    unitPrice: Number(l.unitPrice ?? l.price ?? 0),
    image: l.image ?? null,
  }));
  return {
    id: source.id ?? source.cart_id ?? '',
    itemCount:
      source.itemCount ??
      lines.reduce((sum, l) => sum + l.quantity, 0),
    total: Number(source.total ?? source.subtotal ?? 0),
    currency: source.currency ?? 'USD',
    lines,
  };
}

/**
 * Reads the price/stock drift out of a checkout rejection.
 *
 * The server re-validates the cart against live Shopify data before it
 * creates a Stripe session.  It reports drift in the `RevalidatedCart`
 * shape (`priceChanges`, `stockIssues`, `removedLines`); snake_case
 * variants are accepted too so the UI keeps working with either contract.
 */
export function parseCheckoutChanges(payload: any): PriceChange[] {
  if (!payload) return [];

  const priceChanges: any[] = payload.priceChanges ?? payload.price_changes ?? [];
  const stockIssues: any[] = payload.stockIssues ?? payload.stock_issues ?? [];
  const removedLines: any[] = payload.removedLines ?? payload.removed_lines ?? [];
  const legacy: any[] = payload.changes ?? payload.price_changed ?? [];

  const changes: PriceChange[] = [];

  for (const c of legacy) {
    changes.push({
      title: c.title ?? c.productTitle ?? c.product_title ?? 'Item',
      size: c.size ?? '',
      oldPrice: Number(c.oldPrice ?? c.old_price ?? c.previous_price ?? 0),
      newPrice: Number(c.newPrice ?? c.new_price ?? c.price ?? 0),
      oldStock: Number(c.oldStock ?? c.old_stock ?? 0),
      newStock: Number(c.newStock ?? c.new_stock ?? 0),
      outOfStock: c.outOfStock ?? c.out_of_stock ?? (Number(c.newStock ?? c.new_stock ?? 0) <= 0),
    });
  }

  for (const c of priceChanges) {
    changes.push({
      title: c.title ?? c.productTitle ?? 'Item',
      size: c.size ?? '',
      oldPrice: Number(c.oldPrice ?? 0),
      newPrice: Number(c.newPrice ?? 0),
      oldStock: Number(c.oldStock ?? 0),
      newStock: Number(c.newStock ?? 0),
      outOfStock: false,
    });
  }

  for (const c of stockIssues) {
    changes.push({
      title: c.title ?? 'Item',
      size: c.size ?? '',
      oldPrice: Number(c.oldPrice ?? 0),
      newPrice: Number(c.newPrice ?? 0),
      oldStock: Number(c.requested ?? c.oldStock ?? 0),
      newStock: Number(c.available ?? c.newStock ?? 0),
      outOfStock: Number(c.available ?? 0) <= 0,
    });
  }

  for (const c of removedLines) {
    changes.push({
      title: c.title ?? 'Item',
      size: c.size ?? '',
      oldPrice: Number(c.oldPrice ?? 0),
      newPrice: 0,
      oldStock: Number(c.requested ?? c.oldStock ?? 0),
      newStock: 0,
      outOfStock: true,
    });
  }

  return changes;
}

// ---------------------------------------------------------------------------
// Icons (inline, no extra dependency)
// ---------------------------------------------------------------------------

function Icon({ name, className = 'h-4 w-4' }: { name: string; className?: string }) {
  const common = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (name) {
    case 'search':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      );
    case 'cart':
      return (
        <svg {...common}>
          <circle cx="9" cy="20" r="1.4" />
          <circle cx="18" cy="20" r="1.4" />
          <path d="M2 3h2.2l2.3 12.2a1.6 1.6 0 0 0 1.6 1.3h8.8a1.6 1.6 0 0 0 1.6-1.3L21 7H5" />
        </svg>
      );
    case 'lock':
      return (
        <svg {...common}>
          <rect x="4" y="10" width="16" height="11" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
      );
    case 'send':
      return (
        <svg {...common}>
          <path d="M4 12 20 4l-6 16-2.5-6.5L4 12Z" />
        </svg>
      );
    case 'close':
      return (
        <svg {...common}>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      );
    case 'check':
      return (
        <svg {...common}>
          <path d="M5 12.5 9.5 17 19 7" />
        </svg>
      );
    case 'plus':
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case 'minus':
      return (
        <svg {...common}>
          <path d="M5 12h14" />
        </svg>
      );
    case 'sparkle':
      return (
        <svg {...common}>
          <path d="M12 3.5 13.8 9 19.5 10.8 13.8 12.6 12 18.2 10.2 12.6 4.5 10.8 10.2 9 12 3.5Z" />
        </svg>
      );
    case 'trash':
      return (
        <svg {...common}>
          <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
        </svg>
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Stock chip
// ---------------------------------------------------------------------------

function StockChip({ stock, className = '' }: { stock: number; className?: string }) {
  const { text, className: tone } = stockLabel(stock);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tone} ${className}`}
    >
      {text}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Size chips
// ---------------------------------------------------------------------------

function SizeChips({
  variants,
  selected,
  onSelect,
  size = 'sm',
}: {
  variants: ProductVariant[];
  selected?: string | null;
  onSelect?: (variant: ProductVariant) => void;
  size?: 'sm' | 'md';
}) {
  const pad = size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[11px]';
  return (
    <div className="flex flex-wrap gap-1.5">
      {variants.map((v) => {
        const out = v.stock <= 0;
        const isSelected = selected === v.id;
        const base = `rounded-lg border font-medium transition-colors ${pad}`;
        const tone = isSelected
          ? 'border-forest-700 bg-forest-700 text-white'
          : out
            ? 'border-nw-border bg-[#F5F2EE] text-nw-text-muted line-through cursor-not-allowed'
            : 'border-nw-border bg-white text-nw-text-secondary hover:border-forest-400 hover:text-forest-700';
        if (!onSelect) {
          return (
            <span key={v.id} className={`${base} ${tone}`} title={out ? 'Out of stock' : `${v.stock} in stock`}>
              {v.size}
            </span>
          );
        }
        return (
          <button
            key={v.id}
            type="button"
            disabled={out}
            title={out ? 'Out of stock' : `${v.stock} in stock`}
            onClick={() => onSelect(v)}
            className={`${base} ${tone} disabled:cursor-not-allowed`}
          >
            {v.size}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Product card (assistant-side, compact)
// ---------------------------------------------------------------------------

export function ProductCard({
  product,
  onAdd,
  addingVariantId,
  cart,
}: {
  product: {
    id: string;
    title: string;
    image?: string | null;
    variants?: ProductVariant[];
  };
  onAdd?: (productId: string, variant: ProductVariant) => void;
  addingVariantId?: string | null;
  cart?: Cart | null;
}) {
  const variants = product.variants ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  const productId = product.id ?? product.title;
  const bestVariant = variants.find((v) => v.stock > 0) ?? variants[0];
  const price = bestVariant?.price;
  const chosen = variants.find((v) => v.id === selected) ?? null;
  const added = sizeInCart(cart, product.title, chosen?.size);
  const adding = !!chosen && addingVariantId === chosen.id;
  const disabled = !chosen || chosen.stock <= 0 || adding;

  return (
    <div className="mt-2 rounded-2xl border border-nw-border bg-white p-3 shadow-[0_1px_2px_rgb(0_0_0/.04),0_10px_30px_-12px_rgb(0_0_0/.10)]">
      <div className="flex gap-3">
        {product.image ? (
          <img
            src={product.image}
            alt={product.title}
            className="h-20 w-16 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <div className="h-20 w-16 shrink-0 rounded-xl bg-[#F3F0EC]" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-nw-text">{product.title}</div>
          <div className="mt-0.5 text-[13px] font-semibold tabular-nums text-nw-text">
            {formatMoney(price)}
          </div>
          <div className="mt-1.5">
            <StockChip stock={bestVariant?.stock ?? 0} />
          </div>
        </div>
      </div>

      {variants.length > 0 && (
        <div className="mt-3">
          <SizeChips
            variants={variants}
            selected={selected}
            onSelect={v => setSelected(prev => (prev === v.id ? null : v.id))}
            size="md"
          />
        </div>
      )}

      {onAdd && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => chosen && onAdd(productId, chosen)}
          className={`mt-3 flex h-10 w-full items-center justify-center gap-1.5 rounded-[10px] text-[13px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:bg-[#E4E0DA] disabled:text-nw-text-muted ${
            added ? 'bg-forest-800' : 'bg-forest-700 hover:bg-forest-800'
          }`}
        >
          {adding ? <span>Adding…</span> : added ? <><Icon name="check" className="h-4 w-4" /> Added</> : 'Add to cart'}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cart card (assistant-side)
// ---------------------------------------------------------------------------

export function CartCard({
  cart,
  onQuantity,
  onRemove,
  busy,
}: {
  cart: Cart;
  onQuantity?: (line: CartLine, quantity: number) => void;
  onRemove?: (line: CartLine) => void;
  busy?: boolean;
}) {
  return (
    <div className="mt-2 rounded-2xl border border-nw-border bg-white p-3 shadow-[0_1px_2px_rgb(0_0_0/.04),0_10px_30px_-12px_rgb(0_0_0/.10)]">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-nw-text">Your cart</span>
        <span className="rounded-full bg-[#F3F0EC] px-2 py-0.5 text-[11px] font-medium text-nw-text-secondary">
          {cart.lines.length} item{cart.lines.length === 1 ? '' : 's'}
        </span>
      </div>

      {cart.lines.length === 0 ? (
        <p className="mt-2 text-[12px] text-nw-text-secondary">Your cart is empty.</p>
      ) : (
        <ul className="mt-2 space-y-2.5">
          {cart.lines.map((line) => (
            <li key={line.id} className="flex items-center gap-2.5">
              {line.image ? (
                <img src={line.image} alt={line.productTitle} className="h-10 w-9 shrink-0 rounded-lg object-cover" />
              ) : (
                <div className="h-10 w-9 shrink-0 rounded-lg bg-[#F3F0EC]" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-medium text-nw-text">{line.productTitle}</div>
                <div className="text-[11px] text-nw-text-secondary">
                  {line.size} · {formatMoney(line.unitPrice)}
                </div>
              </div>
              <div className="flex items-center gap-1 rounded-lg border border-nw-border">
                <button
                  type="button"
                  aria-label={`Decrease ${line.productTitle}`}
                  disabled={busy || line.quantity <= 1}
                  onClick={() => onQuantity?.(line, Math.max(1, line.quantity - 1))}
                  className="px-1.5 py-1 text-nw-text-secondary hover:text-forest-700 disabled:opacity-40"
                >
                  <Icon name="minus" className="h-3 w-3" />
                </button>
                <span className="min-w-[18px] text-center text-[12px] font-semibold tabular-nums text-nw-text">
                  {line.quantity}
                </span>
                <button
                  type="button"
                  aria-label={`Increase ${line.productTitle}`}
                  disabled={busy}
                  onClick={() => onQuantity?.(line, line.quantity + 1)}
                  className="px-1.5 py-1 text-nw-text-secondary hover:text-forest-700 disabled:opacity-40"
                >
                  <Icon name="plus" className="h-3 w-3" />
                </button>
              </div>
              <span className="w-[58px] text-right text-[12px] font-semibold tabular-nums text-nw-text">
                {formatMoney(line.unitPrice * line.quantity)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-nw-border pt-3">
        <span className="text-[12px] font-medium text-nw-text-secondary">Subtotal</span>
        <span className="text-[15px] font-semibold tabular-nums text-nw-text">
          {formatMoney(cart.total, cart.currency)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Checkout card
// ---------------------------------------------------------------------------

export function CheckoutCard({
  cart,
  onApprove,
  onKeepShopping,
  redirecting,
}: {
  cart: Cart;
  onApprove: () => void;
  onKeepShopping: () => void;
  redirecting?: boolean;
}) {
  return (
    <div className="mt-2 rounded-2xl border border-nw-border bg-white p-4 shadow-[0_1px_2px_rgb(0_0_0/.04),0_10px_30px_-12px_rgb(0_0_0/.10)]">
      <div className="text-[14px] font-semibold text-nw-text">Ready to check out?</div>

      <ul className="mt-3 space-y-2">
        {cart.lines.map((line) => (
          <li key={line.id} className="flex items-center gap-2.5">
            {line.image ? (
              <img src={line.image} alt={line.productTitle} className="h-11 w-9 shrink-0 rounded-lg object-cover" />
            ) : (
              <div className="h-11 w-9 shrink-0 rounded-lg bg-[#F3F0EC]" />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-medium text-nw-text">{line.productTitle}</div>
              <div className="text-[11px] text-nw-text-secondary">
                {line.size} · Qty {line.quantity}
              </div>
            </div>
            <span className="text-[12px] font-semibold tabular-nums text-nw-text">
              {formatMoney(line.unitPrice * line.quantity)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-baseline justify-between border-t border-nw-border pt-3">
        <span className="text-[12px] font-medium text-nw-text-secondary">Total</span>
        <span className="text-[28px] font-semibold leading-none tabular-nums text-nw-text">
          {formatMoney(cart.total, cart.currency)}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-nw-text-secondary">
        <Icon name="lock" className="h-3.5 w-3.5" />
        <span>Payment by Stripe · test mode, no real charge</span>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onApprove}
          disabled={redirecting}
          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-[10px] bg-forest-700 text-sm font-semibold text-white transition-colors hover:bg-forest-800 disabled:opacity-70"
        >
          {redirecting && (
            <span
              data-testid="checkout-spinner"
              className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white"
            />
          )}
          {redirecting ? 'Redirecting to secure checkout…' : 'Approve & checkout'}
        </button>
        <button
          type="button"
          onClick={onKeepShopping}
          disabled={redirecting}
          className="h-11 flex-1 rounded-[10px] border border-nw-border bg-white text-sm font-semibold text-nw-text-secondary transition-colors hover:border-forest-400 hover:text-forest-700 disabled:opacity-60"
        >
          Keep shopping
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Price-change dialog
// ---------------------------------------------------------------------------

export function PriceChangeDialog({
  changes,
  onDismiss,
  onRetry,
}: {
  changes: PriceChange[];
  onDismiss: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 backdrop-fade" role="dialog" aria-modal="true" aria-label="Price changed">
      <div className="w-full max-w-md rounded-2xl border border-nw-border bg-white p-5 shadow-[0_1px_2px_rgb(0_0_0/.04),0_10px_30px_-12px_rgb(0_0_0/.10)]">
        <div className="font-serif text-lg font-semibold text-nw-text">Prices changed</div>
        <p className="mt-1 text-[13px] text-nw-text-secondary">
          The store updated some items while you were shopping. Review the change before checking out.
        </p>

        <ul className="mt-3 space-y-2">
          {changes.map((c, i) => (
            <li key={`${c.title}-${c.size}-${i}`} className="rounded-xl border border-nw-border bg-[#FBF9F6] p-3">
              <div className="text-[13px] font-semibold text-nw-text">
                {c.title} · {c.size}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px]">
                <span className="tabular-nums text-nw-text-muted line-through">{formatMoney(c.oldPrice)}</span>
                <span className="tabular-nums font-semibold text-nw-price-sale">{formatMoney(c.newPrice)}</span>
                {c.outOfStock ? (
                  <span className="rounded-full bg-[#F3F0EC] px-2 py-0.5 text-[11px] font-medium text-nw-text-muted">
                    Now out of stock
                  </span>
                ) : c.oldStock !== c.newStock ? (
                  <span className="text-nw-text-secondary">
                    {c.oldStock} → {c.newStock} in stock
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="h-11 flex-1 rounded-[10px] bg-forest-700 text-sm font-semibold text-white transition-colors hover:bg-forest-800"
          >
            Update my cart
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="h-11 flex-1 rounded-[10px] border border-nw-border bg-white text-sm font-semibold text-nw-text-secondary transition-colors hover:border-forest-400 hover:text-forest-700"
          >
            Keep shopping
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cart drawer
// ---------------------------------------------------------------------------

export function CartDrawer({
  cart,
  open,
  onClose,
  onQuantity,
  onRemove,
  onCheckout,
  busy,
}: {
  cart: Cart | null;
  open: boolean;
  onClose: () => void;
  onQuantity: (line: CartLine, quantity: number) => void;
  onRemove: (line: CartLine) => void;
  onCheckout: () => void;
  busy?: boolean;
}) {
  if (!open) return null;
  const lines = cart?.lines ?? [];
  const total = cart?.total ?? 0;

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/30 backdrop-fade" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Shopping cart"
        className="absolute right-0 top-0 flex h-full w-full max-w-[420px] flex-col border-l border-nw-border bg-white shadow-[0_1px_2px_rgb(0_0_0/.04),0_10px_30px_-12px_rgb(0_0_0/.10)] slide-in-right"
      >
        <div className="flex h-16 items-center justify-between border-b border-nw-border px-5">
          <div className="font-serif text-lg font-semibold text-nw-text">Your cart</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close cart"
            className="rounded-lg p-1.5 text-nw-text-secondary transition-colors hover:bg-[#F3F0EC] hover:text-nw-text"
          >
            <Icon name="close" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {lines.length === 0 ? (
            <p className="py-12 text-center text-[13px] text-nw-text-secondary">
              Your cart is empty. Ask the assistant to find something.
            </p>
          ) : (
            <ul className="space-y-3">
              {lines.map((line) => (
                <li key={line.id} className="flex gap-3">
                  {line.image ? (
                    <img src={line.image} alt={line.productTitle} className="h-20 w-16 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <div className="h-20 w-16 shrink-0 rounded-xl bg-[#F3F0EC]" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-nw-text">{line.productTitle}</div>
                    <div className="mt-0.5 text-[12px] text-nw-text-secondary">
                      {line.size} · {formatMoney(line.unitPrice)}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex items-center gap-1 rounded-lg border border-nw-border">
                        <button
                          type="button"
                          aria-label={`Decrease ${line.productTitle}`}
                          disabled={busy || line.quantity <= 1}
                          onClick={() => onQuantity(line, Math.max(1, line.quantity - 1))}
                          className="px-2 py-1.5 text-nw-text-secondary hover:text-forest-700 disabled:opacity-40"
                        >
                          <Icon name="minus" className="h-3 w-3" />
                        </button>
                        <span className="min-w-[20px] text-center text-[12px] font-semibold tabular-nums text-nw-text">
                          {line.quantity}
                        </span>
                        <button
                          type="button"
                          aria-label={`Increase ${line.productTitle}`}
                          disabled={busy}
                          onClick={() => onQuantity(line, line.quantity + 1)}
                          className="px-2 py-1.5 text-nw-text-secondary hover:text-forest-700 disabled:opacity-40"
                        >
                          <Icon name="plus" className="h-3 w-3" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemove(line)}
                        aria-label={`Remove ${line.productTitle}`}
                        className="rounded-lg p-1.5 text-nw-text-muted transition-colors hover:bg-[#FDECEC] hover:text-nw-price-sale"
                      >
                        <Icon name="trash" className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="text-[13px] font-semibold tabular-nums text-nw-text">
                    {formatMoney(line.unitPrice * line.quantity)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-nw-border px-5 py-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] font-medium text-nw-text-secondary">Total</span>
            <span className="text-[22px] font-semibold tabular-nums text-nw-text">{formatMoney(total, cart?.currency)}</span>
          </div>
          <button
            type="button"
            onClick={onCheckout}
            disabled={lines.length === 0 || busy}
            className="mt-3 flex h-11 w-full items-center justify-center rounded-[10px] bg-forest-700 text-sm font-semibold text-white transition-colors hover:bg-forest-800 disabled:cursor-not-allowed disabled:bg-[#E4E0DA] disabled:text-nw-text-muted"
          >
            Approve & checkout
          </button>
          <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-nw-text-secondary">
            <Icon name="lock" className="h-3.5 w-3.5" />
            <span>Payment by Stripe · test mode, no real charge</span>
          </div>
        </div>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Storefront grid
// ---------------------------------------------------------------------------

function GridProductCard({
  product,
  highlighted,
  onAdd,
  addingVariantId,
  cart,
}: {
  product: Product;
  highlighted: boolean;
  onAdd: (productId: string, variant: ProductVariant) => void;
  addingVariantId: string | null;
  cart: Cart | null;
}) {
  const variants = product.variants;
  const best = variants.find((v) => v.stock > 0) ?? variants[0];
  const inStockCount = variants.filter((v) => v.stock > 0).length;
  const [selected, setSelected] = useState<string | null>(null);
  const chosen = variants.find((v) => v.id === selected) ?? null;
  const added = sizeInCart(cart, product.title, chosen?.size);
  const adding = !!chosen && addingVariantId === chosen.id;

  return (
    <article
      data-testid={`product-card-${product.title}`}
      className={`group flex flex-col rounded-2xl border bg-white p-3 transition-shadow ${
        highlighted
          ? 'border-forest-400 shadow-[0_0_0_3px_rgb(61_107_58/.12),0_1px_2px_rgb(0_0_0/.04),0_10px_30px_-12px_rgb(0_0_0/.10)]'
          : 'border-nw-border shadow-[0_1px_2px_rgb(0_0_0/.04),0_10px_30px_-12px_rgb(0_0_0/.10)]'
      }`}
    >
      <div className="relative mb-3 overflow-hidden rounded-xl bg-[#F3F0EC]">
        {product.image ? (
          <img
            src={product.image}
            alt={product.imageAlt}
            className="aspect-[4/5] w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex aspect-[4/5] w-full items-center justify-center text-nw-text-muted">
            <span className="font-serif text-2xl">N</span>
          </div>
        )}
        {inStockCount === 0 && (
          <span className="absolute right-2 top-2 rounded-full bg-[#1F1B16]/80 px-2.5 py-1 text-[10px] font-medium text-white">
            Sold out
          </span>
        )}
        {inStockCount > 0 && inStockCount <= 2 && (
          <span className="absolute right-2 top-2 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-medium text-nw-low-stock">
            Few left
          </span>
        )}
      </div>

      <h3 className="text-[13px] font-semibold text-nw-text">{product.title}</h3>
      <div className="mt-0.5 flex items-center gap-2">
        <span className="text-[15px] font-semibold tabular-nums text-nw-text">
          {formatMoney(best?.price)}
        </span>
        <StockChip stock={best?.stock ?? 0} />
      </div>

      <div className="mt-2.5">
        <SizeChips
          variants={variants}
          selected={selected}
          onSelect={v => setSelected(prev => (prev === v.id ? null : v.id))}
        />
      </div>

      <button
        type="button"
        disabled={!chosen || chosen.stock <= 0 || adding}
        onClick={() => chosen && onAdd(product.id, chosen)}
        className={`mt-3 flex h-10 w-full items-center justify-center gap-1.5 rounded-[10px] border text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:border-nw-border disabled:bg-[#F5F2EE] disabled:text-nw-text-muted ${
          added
            ? 'border-forest-800 bg-forest-800 text-white'
            : 'border-forest-700 text-forest-700 hover:bg-forest-700 hover:text-white'
        }`}
      >
        {adding ? 'Adding…' : added ? <><Icon name="check" className="h-4 w-4" /> Added</> : chosen ? `Add ${chosen.size} to cart` : 'Select a size'}
      </button>
    </article>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-nw-border bg-white p-3">
      <div className="mb-3 aspect-[4/5] w-full animate-pulse rounded-xl bg-[#F0EDE8]" />
      <div className="h-3 w-2/3 animate-pulse rounded bg-[#F0EDE8]" />
      <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-[#F0EDE8]" />
      <div className="mt-3 flex gap-1.5">
        <div className="h-6 w-8 animate-pulse rounded-lg bg-[#F0EDE8]" />
        <div className="h-6 w-8 animate-pulse rounded-lg bg-[#F0EDE8]" />
        <div className="h-6 w-8 animate-pulse rounded-lg bg-[#F0EDE8]" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assistant panel
// ---------------------------------------------------------------------------

function AssistantPanel({
  messages,
  loading,
  input,
  onInput,
  onSend,
  onAddToCart,
  addingVariantId,
  onQuantity,
  onRemove,
  onApproveCheckout,
  onKeepShopping,
  redirecting,
  cart,
  showSuggestions,
  activity,
  onClose,
  variant,
}: {
  messages: Message[];
  loading: boolean;
  input: string;
  onInput: (v: string) => void;
  onSend: (text: string) => void;
  onAddToCart: (productId: string, variant: ProductVariant) => void;
  addingVariantId: string | null;
  onQuantity: (line: CartLine, quantity: number) => void;
  onRemove: (line: CartLine) => void;
  onApproveCheckout: () => void;
  onKeepShopping: () => void;
  redirecting: boolean;
  cart: Cart | null;
  showSuggestions: boolean;
  activity: ToolActivity | null;
  onClose?: () => void;
  variant: 'docked' | 'sheet';
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  return (
    <div
      className={`flex flex-col overflow-hidden bg-white ${
        variant === 'docked'
          ? 'h-full w-full border-l border-nw-border'
          : 'slide-in-up max-h-[80vh] w-full rounded-t-2xl border-t border-nw-border'
      }`}
    >
      {/* Panel header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-nw-border px-4 py-3">
        <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-forest-700 text-sm font-bold text-white">
          N
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-[#22C55E]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-nw-text">Shopping assistant</div>
          <div className="text-[11px] text-nw-text-secondary">Online · searches the live catalogue</div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close assistant"
            className="rounded-lg p-1.5 text-nw-text-secondary transition-colors hover:bg-[#F3F0EC] hover:text-nw-text"
          >
            <Icon name="close" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-cream px-4 py-4">
        {messages.map((m, i) => (
          <div key={i} className={`mb-3 flex ${m.role === 'customer' ? 'justify-end' : 'justify-start'}`}>
            <div className={`${m.role === 'customer' ? 'max-w-[85%]' : 'w-full'}`}>
              <div
                className={`px-3.5 py-2.5 text-[13px] leading-relaxed ${
                  m.role === 'customer'
                    ? 'rounded-2xl rounded-br-md bg-forest-700 text-white'
                    : 'rounded-2xl rounded-bl-md border border-nw-border bg-white text-nw-text'
                }`}
              >
                {m.content}
              </div>

              {m.role === 'assistant' && m.toolData?.result && (
                <AssistantCard
                  toolData={m.toolData}
                  cart={cart}
                  addingVariantId={addingVariantId}
                  onAddToCart={onAddToCart}
                  onQuantity={onQuantity}
                  onRemove={onRemove}
                  onApproveCheckout={onApproveCheckout}
                  onKeepShopping={onKeepShopping}
                  redirecting={redirecting}
                />
              )}

              <div className={`mt-1 text-[10px] text-nw-text-muted ${m.role === 'customer' ? 'text-right' : ''}`}>
                {m.ts}
              </div>
            </div>
          </div>
        ))}

        {activity && (
          <div className="mb-3 flex items-center gap-1.5 text-[11px] text-nw-text-muted">
            <Icon name="sparkle" className="h-3 w-3" />
            <span>
              {activity.label}
              {activity.detail ? ` · ${activity.detail}` : ''}
            </span>
          </div>
        )}

        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-nw-border bg-white px-4 py-3">
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-nw-text-muted" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-nw-text-muted" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-nw-text-muted" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Suggestion chips */}
      {showSuggestions && (
        <div className="flex shrink-0 flex-wrap gap-1.5 border-t border-nw-border bg-white px-3 py-2.5">
          {SUGGESTION_CHIPS.map(chip => (
            <button
              key={chip}
              type="button"
              onClick={() => onSend(chip)}
              className="rounded-full bg-[#F3F0EC] px-3 py-1.5 text-[11px] font-medium text-forest-700 transition-colors hover:bg-forest-50"
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={e => {
          e.preventDefault();
          onSend(input);
        }}
        className="flex shrink-0 items-center gap-2 border-t border-nw-border bg-white p-3"
      >
        <input
          value={input}
          onChange={e => onInput(e.target.value)}
          aria-label="Ask the shopping assistant"
          placeholder="Ask for anything: 'a warm jacket in M under $150'"
          className="h-11 min-w-0 flex-1 rounded-[10px] border border-nw-border bg-cream px-3.5 text-[13px] text-nw-text outline-none transition-colors placeholder:text-nw-text-muted focus:border-forest-400"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          aria-label="Send message"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-forest-700 text-white transition-colors hover:bg-forest-800 disabled:opacity-40"
        >
          <Icon name="send" />
        </button>
      </form>
    </div>
  );
}

function AssistantCard({
  toolData,
  cart,
  addingVariantId,
  onAddToCart,
  onQuantity,
  onRemove,
  onApproveCheckout,
  onKeepShopping,
  redirecting,
}: {
  toolData: { name: string; result: any };
  cart: Cart | null;
  addingVariantId: string | null;
  onAddToCart: (productId: string, variant: ProductVariant) => void;
  onQuantity: (line: CartLine, quantity: number) => void;
  onRemove: (line: CartLine) => void;
  onApproveCheckout: () => void;
  onKeepShopping: () => void;
  redirecting: boolean;
}) {
  const { name, result } = toolData;

  if (name === 'search_products' || name === 'get_product') {
    const items: any[] =
      name === 'search_products'
        ? searchResultProducts(result)
        : [getProductResult(result)].filter(Boolean);
    if (!items.length) {
      return (
        <div className="mt-2 rounded-2xl border border-nw-border bg-white p-3 text-[13px] text-nw-text-secondary">
          No match in the catalogue.
        </div>
      );
    }
    return (
      <div data-testid="assistant-product-cards">
        {items.map((p: any, i: number) => (
          <ProductCard
            key={p.id ?? `${p.title}-${i}`}
            product={{
              id: p.id,
              title: p.title,
              image: p.image,
              variants: p.variants,
            }}
            onAdd={onAddToCart}
            addingVariantId={addingVariantId}
            cart={cart}
          />
        ))}
      </div>
    );
  }

  if (
    name === 'view_cart' ||
    name === 'add_to_cart' ||
    name === 'update_cart' ||
    name === 'remove_from_cart'
  ) {
    const resolved = toCart(result) ?? cart;
    if (!resolved) return null;
    return (
      <div data-testid="assistant-cart-card">
        <CartCard cart={resolved} onQuantity={onQuantity} onRemove={onRemove} />
      </div>
    );
  }

  if (name === 'propose_checkout') {
    const resolved = toCart(result) ?? cart;
    if (!resolved) return null;
    return (
      <div data-testid="assistant-checkout-card">
        <CheckoutCard
          cart={resolved}
          onApprove={onApproveCheckout}
          onKeepShopping={onKeepShopping}
          redirecting={redirecting}
        />
      </div>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Storefront shell (header + two-column layout + drawer + panel)
// ---------------------------------------------------------------------------

export function StorefrontShell({
  products,
  catalogueFailed = false,
}: {
  products: Product[];
  catalogueFailed?: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        "Hi — I'm your shopping assistant. Tell me what you need (size, budget, colour) and I'll search the live catalogue, then build a cart for you.",
      ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      toolData: null,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [cart, setCart] = useState<Cart | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [filterTitles, setFilterTitles] = useState<string[] | null>(null);
  const [activity, setActivity] = useState<ToolActivity | null>(null);
  const [addingVariantId, setAddingVariantId] = useState<string | null>(null);
  const [cartBusy, setCartBusy] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [priceChanges, setPriceChanges] = useState<PriceChange[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Stripe cancel banner (?cancelled=1)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('cancelled') === '1') {
      setToast('Checkout cancelled, your cart is saved');
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  // Load the server cart on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(CART_ENDPOINT, { cache: 'no-store' });
        if (!res.ok) return;
        const parsed = toCart(await res.json());
        if (!cancelled && parsed) setCart(parsed);
      } catch {
        /* cart is optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const highlightedTitles = useMemo(() => (filterTitles ? new Set(filterTitles) : null), [filterTitles]);

  const visibleProducts = useMemo(() => {
    let list = products;
    if (highlightedTitles) {
      const filtered = products.filter(p => highlightedTitles.has(p.title));
      if (filtered.length) list = filtered;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const searched = list.filter(
        p => p.title.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q),
      );
      if (searched.length) list = searched;
    }
    return list;
  }, [products, highlightedTitles, searchQuery]);

  const cartCount = cart?.lines.reduce((sum, l) => sum + l.quantity, 0) ?? 0;

  // -------------------------------------------------------------------------
  // Chat
  // -------------------------------------------------------------------------

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setMessages(prev => [
        ...prev,
        {
          role: 'customer',
          content: trimmed,
          ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          toolData: null,
        },
      ]);
      setInput('');
      setLoading(true);
      setActivity({ label: 'Searching the catalogue' });
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversation_id: conversationId, message: trimmed }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || `Chat failed (${res.status})`);
        }
        if (data.conversation_id) setConversationId(data.conversation_id);

        const toolName = data.tool_data?.name;
        const result = data.tool_data?.result;

        if (toolName === 'search_products') {
          const titles = searchResultTitles(result);
          setFilterTitles(titles.length ? titles : null);
          const count = searchResultProducts(result).length;
          setActivity({ label: 'Searched catalogue', detail: `${count} result${count === 1 ? '' : 's'}` });
        } else if (toolName === 'get_product') {
          setActivity({ label: 'Checked stock' });
        } else if (toolName === 'add_to_cart') {
          setActivity({ label: 'Added to cart' });
        } else if (toolName === 'view_cart') {
          setActivity({ label: 'Opened cart' });
        } else if (toolName === 'propose_checkout') {
          setActivity({ label: 'Prepared checkout' });
        } else {
          setActivity(null);
        }

        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: data.reply ?? 'Sorry, something went wrong.',
            ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            toolData: data.tool_data ?? null,
          },
        ]);

        // Keep the drawer in sync with the server cart.
        const parsedCart = toCart(result);
        if (parsedCart && parsedCart.lines.length) setCart(parsedCart);
      } catch (err: any) {
        setActivity(null);
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: 'Connection error — please try again.',
            ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            toolData: null,
          },
        ]);
        setToast(err?.message ? `Assistant error: ${err.message}` : 'Assistant error — please try again.');
      } finally {
        setLoading(false);
      }
    },
    [conversationId],
  );

  // -------------------------------------------------------------------------
  // Cart operations
  // -------------------------------------------------------------------------

  const refreshCart = useCallback(async () => {
    try {
      const res = await fetch(CART_ENDPOINT, { cache: 'no-store' });
      if (!res.ok) return null;
      const parsed = toCart(await res.json());
      if (parsed) setCart(parsed);
      return parsed;
    } catch {
      return null;
    }
  }, []);

  const addToCart = useCallback(
    async (productId: string, variant: ProductVariant) => {
      setAddingVariantId(variant.id);
      try {
        const res = await fetch(CART_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ variant_id: variant.id, quantity: 1, product_id: productId }),
        });
        const data = await res.json();
        if (!res.ok) {
          setToast(data?.error ?? data?.message ?? 'Could not add that item to your cart.');
          return;
        }
        const parsed = toCart(data);
        if (parsed) setCart(parsed);
        setActivity({ label: 'Added to cart', detail: variant.size });
        setToast(`Added ${variant.size} to cart`);
      } catch {
        setToast('Could not add that item to your cart.');
      } finally {
        setAddingVariantId(null);
      }
    },
    [],
  );

  const setQuantity = useCallback(
    async (line: CartLine, quantity: number) => {
      setCartBusy(true);
      try {
        const res = await fetch(CART_ENDPOINT, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ line_id: line.id, quantity }),
        });
        const data = await res.json();
        if (!res.ok) {
          setToast(data?.error ?? data?.message ?? 'Could not update your cart.');
          return;
        }
        const parsed = toCart(data);
        if (parsed) setCart(parsed);
      } catch {
        setToast('Could not update your cart.');
      } finally {
        setCartBusy(false);
      }
    },
    [],
  );

  const removeLine = useCallback(async (line: CartLine) => {
    setCartBusy(true);
    try {
      const res = await fetch(CART_ENDPOINT, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line_id: line.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast(data?.error ?? data?.message ?? 'Could not remove that item.');
        return;
      }
      const parsed = toCart(data);
      if (parsed) setCart(parsed);
    } catch {
      setToast('Could not remove that item.');
    } finally {
      setCartBusy(false);
    }
  }, []);

  // -------------------------------------------------------------------------
  // Checkout
  // -------------------------------------------------------------------------

  const approveCheckout = useCallback(async () => {
    setRedirecting(true);
    try {
      const res = await fetch(CHECKOUT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        const changes = parseCheckoutChanges(data);
        if (changes.length) {
          setPriceChanges(changes);
          setRedirecting(false);
          return;
        }
        setToast(data?.error ?? data?.message ?? 'Checkout could not be started.');
        setRedirecting(false);
        return;
      }
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      setToast('Checkout could not be started.');
      setRedirecting(false);
    } catch {
      setToast('Checkout could not be started.');
      setRedirecting(false);
    }
  }, []);

  const keepShopping = useCallback(() => {
    setFilterTitles(null);
    setPriceChanges(null);
  }, []);

  const retryAfterPriceChange = useCallback(async () => {
    setPriceChanges(null);
    const fresh = await refreshCart();
    if (fresh) setToast('Cart updated with the latest prices');
  }, [refreshCart]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex min-h-screen flex-col bg-cream">
      {/* Cancellation / error toast */}
      {toast && (
        <div
          role="status"
          data-testid="storefront-toast"
          className="fixed left-1/2 top-20 z-[80] -translate-x-1/2 rounded-xl border border-nw-border bg-white px-4 py-2.5 text-[13px] text-nw-text shadow-[0_1px_2px_rgb(0_0_0/.04),0_10px_30px_-12px_rgb(0_0_0/.10)]"
        >
          {toast}
        </div>
      )}

      {/* Price change dialog */}
      {priceChanges && (
        <PriceChangeDialog
          changes={priceChanges}
          onDismiss={() => setPriceChanges(null)}
          onRetry={retryAfterPriceChange}
        />
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b border-nw-border bg-white/95 px-6 backdrop-blur">
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-forest-700 font-serif text-[15px] font-semibold text-white">
            N
          </div>
          <span className="hidden text-[15px] font-semibold text-nw-text sm:inline">Northwind Supply Co.</span>
        </div>

        <div className="relative min-w-0 flex-1 max-w-md">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-nw-text-muted" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            aria-label="Search products"
            placeholder="Search products"
            className="h-10 w-full rounded-[10px] border border-nw-border bg-cream pl-9 pr-3 text-[13px] text-nw-text outline-none transition-colors placeholder:text-nw-text-muted focus:border-forest-400"
          />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-3">
          <span className="hidden rounded-full bg-nw-test-bg px-2.5 py-1 text-[11px] font-semibold text-nw-test sm:inline">
            Test mode
          </span>
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            aria-label={`Cart, ${cartCount} items`}
            className="relative flex h-10 items-center gap-2 rounded-[10px] border border-nw-border bg-white px-3 text-[13px] font-semibold text-nw-text transition-colors hover:border-forest-400"
          >
            <Icon name="cart" className="h-4 w-4" />
            <span className="hidden sm:inline">Cart</span>
            {cartCount > 0 && (
              <span
                data-testid="cart-count-badge"
                className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-forest-700 px-1.5 text-[11px] font-semibold text-white"
              >
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Body: storefront (left) + docked assistant (right) */}
      <div className="flex flex-1 overflow-hidden">
        <main className="min-w-0 flex-1 overflow-y-auto px-6 py-8 lg:px-12">
          {/* Hero strip */}
          <section className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-serif text-[28px] font-semibold leading-tight text-nw-text">
                Gear for cold mornings
              </h1>
              <p className="mt-1 text-[14px] text-nw-text-secondary">
                Layered essentials for the trail and the commute.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="hidden rounded-[10px] bg-terracotta-500 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-terracotta-600 lg:hidden"
            >
              Ask the assistant
            </button>
          </section>

          {/* Grid filter bar */}
          {filterTitles && (
            <div
              data-testid="grid-filter-bar"
              className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-forest-200 bg-forest-50 px-4 py-3"
            >
              <span className="text-[13px] font-medium text-forest-800">{picksLabel(visibleProducts.length)}</span>
              <button
                type="button"
                onClick={() => {
                  setFilterTitles(null);
                  setSearchQuery('');
                }}
                className="rounded-lg border border-forest-300 bg-white px-2.5 py-1 text-[12px] font-semibold text-forest-700 transition-colors hover:bg-forest-100"
              >
                Clear
              </button>
            </div>
          )}

          {/* Product grid */}
          {visibleProducts.length === 0 ? (
            <div className="rounded-2xl border border-nw-border bg-white px-6 py-16 text-center">
              {catalogueFailed ? (
                <>
                  <p className="font-serif text-lg font-semibold text-nw-text">
                    We couldn&rsquo;t reach the store.
                  </p>
                  <p className="mt-1 text-[13px] text-nw-text-secondary">
                    The live catalogue didn&rsquo;t load. Please refresh, or ask the assistant in a moment.
                  </p>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="mt-4 h-10 rounded-[10px] bg-forest-700 px-5 text-[13px] font-semibold text-white transition-colors hover:bg-forest-800"
                  >
                    Try again
                  </button>
                </>
              ) : (
                <>
                  <p className="font-serif text-lg font-semibold text-nw-text">
                    {searchQuery ? `No match for “${searchQuery}”.` : 'No products match yet.'}
                  </p>
                  <p className="mt-1 text-[13px] text-nw-text-secondary">
                    Try a different word, or ask the assistant for a suggestion.
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-3">
              {visibleProducts.map(p => (
                <GridProductCard
                  key={p.id}
                  product={p}
                  highlighted={!!highlightedTitles?.has(p.title)}
                  onAdd={addToCart}
                  addingVariantId={addingVariantId}
                  cart={cart}
                />
              ))}
            </div>
          )}
        </main>

        {/* Docked assistant panel (desktop) */}
        <aside className="hidden w-[38%] min-w-[360px] max-w-[560px] lg:block">
          <AssistantPanel
            variant="docked"
            messages={messages}
            loading={loading}
            input={input}
            onInput={setInput}
            onSend={send}
            onAddToCart={addToCart}
            addingVariantId={addingVariantId}
            onQuantity={setQuantity}
            onRemove={removeLine}
            onApproveCheckout={approveCheckout}
            onKeepShopping={keepShopping}
            redirecting={redirecting}
            cart={cart}
            showSuggestions={messages.length <= 1}
            activity={activity}
          />
        </aside>
      </div>

      {/* Mobile bottom sheet */}
      {sheetOpen && (
        <div className="fixed inset-0 z-[65] lg:hidden">
          <div className="absolute inset-0 bg-black/30 backdrop-fade" onClick={() => setSheetOpen(false)} aria-hidden="true" />
          <div className="absolute inset-x-0 bottom-0">
            <AssistantPanel
              variant="sheet"
              messages={messages}
              loading={loading}
              input={input}
              onInput={setInput}
              onSend={send}
              onAddToCart={addToCart}
              addingVariantId={addingVariantId}
              onQuantity={setQuantity}
              onRemove={removeLine}
              onApproveCheckout={approveCheckout}
              onKeepShopping={keepShopping}
              redirecting={redirecting}
              cart={cart}
              showSuggestions={messages.length <= 1}
              activity={activity}
              onClose={() => setSheetOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Floating assistant button (mobile) */}
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        aria-label="Ask the assistant"
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-forest-700 px-5 py-3 text-[13px] font-semibold text-white shadow-[0_1px_2px_rgb(0_0_0/.04),0_10px_30px_-12px_rgb(0_0_0/.10)] transition-colors hover:bg-forest-800 lg:hidden"
      >
        <Icon name="sparkle" className="h-4 w-4" />
        Ask the assistant
      </button>

      {/* Cart drawer */}
      <CartDrawer
        cart={cart}
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        onQuantity={setQuantity}
        onRemove={removeLine}
        onCheckout={approveCheckout}
        busy={cartBusy || redirecting}
      />

      {/* Skeleton cards are used by the Suspense fallback in app/page.tsx */}
      <div className="hidden" aria-hidden="true">
        <SkeletonCard />
      </div>
    </div>
  );
}

export default StorefrontShell;
