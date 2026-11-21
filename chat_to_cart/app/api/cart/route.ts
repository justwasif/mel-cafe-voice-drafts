import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  readCart,
  readCartById,
  readCartIdFromCookieHeader,
  mutateCart,
  clearCart,
  addLine,
  setLineQuantity,
  removeLine,
  cartSubtotal,
  cartItemCount,
  CART_COOKIE_NAME,
  type Cart,
} from '@/lib/cart';
import { getVariantById } from '@/lib/catalogue';

// ---------------------------------------------------------------------------
// Helpers: Cart → CartView (the shape the frontend's toCart() expects)
// ---------------------------------------------------------------------------

function toCartView(cart: Cart) {
  return {
    id: cart.id,
    itemCount: cartItemCount(cart.lines),
    total: cartSubtotal(cart.lines),
    currency: 'USD',
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

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/cart — read the current session cart.
 */
export async function GET(req: NextRequest) {
  const cookieHeader = req.headers.get('cookie') ?? '';
  const cartId = readCartIdFromCookieHeader(cookieHeader);
  if (!cartId) {
    return NextResponse.json({ id: '', itemCount: 0, total: 0, currency: 'USD', lines: [] });
  }
  const cart = await readCartById(cartId);
  if (!cart) {
    return NextResponse.json({ id: '', itemCount: 0, total: 0, currency: 'USD', lines: [] });
  }
  return NextResponse.json(toCartView(cart));
}

const postSchema = z.object({
  variant_id: z.string().min(1),
  quantity: z.number().int().min(1).default(1),
  product_id: z.string().optional(),
});

/**
 * POST /api/cart — add a line (or increase quantity of an existing line).
 */
export async function POST(req: NextRequest) {
  const parsed = postSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }
  const { variant_id, quantity, product_id } = parsed.data;

  // Resolve or create the cart session from the cookie.
  const cookieHeader = req.headers.get('cookie') ?? '';
  let cartId = readCartIdFromCookieHeader(cookieHeader);
  let freshCookie: string | null = null;

  if (!cartId) {
    // Mint a session, then add the line into it. Returning the empty cart
    // here dropped the shopper's first Add to cart.
    const { cart: newCart, cookieValue } = await readCart(undefined);
    cartId = newCart.id;
    freshCookie = cookieValue;
  }

  // Look up the live variant so we capture the current price + stock + image.
  const variantLookup = await getVariantById(variant_id);
  if (!variantLookup) {
    return NextResponse.json({ error: 'Variant not found.', reason: 'variant_not_found' }, { status: 404 });
  }
  const { variant, product } = variantLookup;

  if (variant.stock <= 0) {
    // Return available sizes so the UI can offer alternatives.
    const inStockSizes = product.variants
      .filter(v => v.stock > 0)
      .map(v => ({ size: v.size, stock: v.stock, variantId: v.id }));
    return NextResponse.json(
      {
        error: `"${product.title}" size ${variant.size} is out of stock.`,
        reason: 'out_of_stock',
        inStockSizes,
      },
      { status: 409 },
    );
  }

  // Clamp to available stock.
  const qty = Math.min(quantity, variant.stock);

  const updated = await mutateCart(cartId, lines => {
    return addLine(lines, {
      productId: product.id,
      variantId: variant.id,
      title: product.title,
      size: variant.size,
      price: Number(variant.price),
      quantity: qty,
      image: product.image,
    });
  });

  const res = NextResponse.json(toCartView(updated));
  if (freshCookie) {
    res.headers.set('Set-Cookie', `${CART_COOKIE_NAME}=${freshCookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${604800}`);
  }
  return res;
}

const patchSchema = z.object({
  line_id: z.string().min(1),
  quantity: z.number().int().min(1),
});

/**
 * PATCH /api/cart — update a line's quantity.
 */
export async function PATCH(req: NextRequest) {
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }
  const { line_id, quantity } = parsed.data;

  const cookieHeader = req.headers.get('cookie') ?? '';
  const cartId = readCartIdFromCookieHeader(cookieHeader);
  if (!cartId) {
    return NextResponse.json({ error: 'No active cart session.', reason: 'cart_not_found' }, { status: 404 });
  }

  try {
    const updated = await mutateCart(cartId, cart => setLineQuantity(cart, line_id, quantity));
    return NextResponse.json(toCartView(updated));
  } catch (err: any) {
    const msg = err?.message?.toLowerCase() ?? '';
    if (msg.includes('not found')) {
      return NextResponse.json({ error: 'Line not found.', reason: 'line_not_found' }, { status: 404 });
    }
    if (msg.includes('stock')) {
      return NextResponse.json({ error: 'Not enough stock.', reason: 'out_of_stock' }, { status: 409 });
    }
    return NextResponse.json({ error: msg || 'Could not update cart.' }, { status: 400 });
  }
}

const deleteSchema = z.object({
  line_id: z.string().min(1),
});

/**
 * DELETE /api/cart — remove a line.
 */
export async function DELETE(req: NextRequest) {
  const parsed = deleteSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }
  const { line_id } = parsed.data;

  const cookieHeader = req.headers.get('cookie') ?? '';
  const cartId = readCartIdFromCookieHeader(cookieHeader);
  if (!cartId) {
    return NextResponse.json({ error: 'No active cart session.', reason: 'cart_not_found' }, { status: 404 });
  }

  try {
    const updated = await mutateCart(cartId, cart => removeLine(cart, line_id));
    return NextResponse.json(toCartView(updated));
  } catch (err: any) {
    const msg = err?.message?.toLowerCase() ?? '';
    if (msg.includes('not found')) {
      return NextResponse.json({ error: 'Line not found.', reason: 'line_not_found' }, { status: 404 });
    }
    return NextResponse.json({ error: msg || 'Could not remove item.' }, { status: 400 });
  }
}
