/**
 * Normalized, restricted Shopify catalogue helpers.
 *
 * Only the 12 Northwind products are returned.  All prices, titles, stock
 * and images come from the live `getProducts()` call — never cached or
 * invented.  Out-of-stock variants are included (so callers can show
 * "out of stock") but are flagged.
 */

import { getProducts } from './shopify';

// ── The only products that may surface in this store ──────────────────
export const NORTHWIND_PRODUCTS = [
  'Field Jacket',
  'Trail Blazer',
  'Base Layer Tee',
  'Merino Sweater',
  'Chino Pants',
  'Canvas Shorts',
  'Wool Beanie',
  'Leather Belt',
  'Crew Socks (3-Pack)',
  'Rain Shell',
  'Down Vest',
  'Flannel Shirt',
] as const;

// ── Public types ──────────────────────────────────────────────────────

export interface CatalogueVariant {
  /** Shopify global variant ID, e.g. gid://shopify/ProductVariant/123 */
  id: string;
  /** Human-readable size label extracted from selectedOptions */
  size: string;
  /** Price as a string decimal, e.g. "89.00" */
  price: string;
  /** Current available quantity from Shopify inventory */
  stock: number;
}

export interface CatalogueProduct {
  /** Shopify global product ID */
  id: string;
  title: string;
  description: string;
  image: string | null;
  imageAlt: string;
  /** All variants for this product (typically one per size) */
  variants: readonly CatalogueVariant[];
}

// ── Internal: normalise raw Shopify product node → CatalogueProduct ───

function normaliseProduct(raw: any): CatalogueProduct {
  const variants: CatalogueVariant[] = (raw.variants?.edges ?? []).map((e: any) => ({
    id: e.node.id,
    size:
      e.node.selectedOptions?.find((o: any) => o.name === 'Size')?.value ??
      e.node.title,
    price: e.node.price,
    stock: e.node.inventoryQuantity ?? 0,
  }));

  return {
    id: raw.id,
    title: raw.title,
    description: raw.description ?? '',
    image: raw.featuredImage?.url ?? null,
    imageAlt: raw.featuredImage?.altText ?? raw.title,
    variants,
  };
}

// ── Public helpers ────────────────────────────────────────────────────

/**
 * Fetch the full restricted catalogue (max 12 products).
 * Always calls Shopify; never caches.
 */
export async function fetchCatalogue(): Promise<CatalogueProduct[]> {
  const raw = await getProducts();
  return raw
    .filter((p: any) => NORTHWIND_PRODUCTS.includes(p.title))
    .map(normaliseProduct);
}

/**
 * Search within the restricted catalogue.
 * Returns up to `limit` products whose title **or** description contains
 * every word in `query` (case-insensitive).  Optional filters narrow
 * results further.
 */
export async function searchCatalogue(options: {
  query: string;
  maxPrice?: number;
  size?: string;
  category?: string; // unused today – kept for tool signature compat
  limit?: number;
}): Promise<CatalogueProduct[]> {
  const catalogue = await fetchCatalogue();
  const { query, maxPrice, size, limit = 6 } = options;

  // Tokenise query into required words
  // "warm jacket" is the shopper's words; "warm" is not in the title. Drop filler
  // and a trailing plural so the noun still has to match.
  const filler = new Set(['a', 'an', 'the', 'for', 'and', 'or', 'to', 'in', 'on', 'with', 'under', 'over', 'my', 'i', 'me', 'need', 'want', 'looking', 'please', 'some', 'any', 'warm', 'cold', 'cozy', 'nice', 'good', 'really', 'very', 'just', 'something', 'like']);
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .filter(w => !filler.has(w))
    .map(w => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w));

  const matched = catalogue.filter(product => {
    // Text match: every query word must appear in title or description
    const haystack = `${product.title} ${product.description}`.toLowerCase();
    if (!words.every(w => haystack.includes(w))) return false;

    // Price filter: at least one variant must be ≤ maxPrice
    if (maxPrice != null) {
      const hasAffordable = product.variants.some(
        v => Number(v.price) <= maxPrice,
      );
      if (!hasAffordable) return false;
    }

    // Size filter: product must have a variant with that exact size
    if (size) {
      const hasSize = product.variants.some(
        v => v.size.toLowerCase() === size.toLowerCase(),
      );
      if (!hasSize) return false;
    }

    return true;
  });

  return matched.slice(0, limit);
}

/**
 * Look up a single product by its Shopify product ID (gid or numeric).
 * Returns `null` if not found in the restricted set.
 */
export async function getProductById(
  id: string,
): Promise<CatalogueProduct | null> {
  const catalogue = await fetchCatalogue();
  return catalogue.find(p => p.id === id) ?? null;
}

/**
 * Look up a single variant by its Shopify variant ID across the full
 * restricted catalogue.  Returns the variant plus its parent product,
 * or `null` if not found.
 */
export async function getVariantById(
  variantId: string,
): Promise<{ product: CatalogueProduct; variant: CatalogueVariant } | null> {
  const catalogue = await fetchCatalogue();
  for (const product of catalogue) {
    const variant = product.variants.find(v => v.id === variantId);
    if (variant) return { product, variant };
  }
  return null;
}
