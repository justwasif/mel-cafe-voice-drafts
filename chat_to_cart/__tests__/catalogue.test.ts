/**
 * Pure unit tests for lib/catalogue.ts.
 *
 * `getProducts` from `./shopify` is mocked so these tests never touch the
 * network.  They assert the catalogue helpers:
 *   - keep only the 12 Northwind products (no gift cards, drafts or hidden),
 *   - normalize variants (size / price / stock),
 *   - apply query, max-price and size filters,
 *   - resolve products and variants by id.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/shopify', () => ({
  getProducts: vi.fn(),
}));

import { getProducts } from '../lib/shopify';
import {
  NORTHWIND_PRODUCTS,
  fetchCatalogue,
  searchCatalogue,
  getProductById,
  getVariantById,
} from '../lib/catalogue';

// ── Fixtures: raw Shopify product nodes ───────────────────────────────

function rawProduct(title: string, variants: Array<{ id: string; size: string; price: string; stock: number }>) {
  return {
    id: `gid://shopify/Product/${title.replace(/\s+/g, '-')}`,
    title,
    description: `${title} — built for the trail.`,
    featuredImage: { url: `https://cdn.shopify.com/${title}.jpg`, altText: title },
    variants: {
      edges: variants.map(v => ({
        node: {
          id: v.id,
          title: v.size,
          price: v.price,
          inventoryQuantity: v.stock,
          selectedOptions: [{ name: 'Size', value: v.size }],
        },
      })),
    },
  };
}

const FIELD_JACKET = rawProduct('Field Jacket', [
  { id: 'gid://shopify/ProductVariant/fj-xs', size: 'XS', price: '149.00', stock: 5 },
  { id: 'gid://shopify/ProductVariant/fj-m', size: 'M', price: '149.00', stock: 9 },
  { id: 'gid://shopify/ProductVariant/fj-xl', size: 'XL', price: '149.00', stock: 0 },
]);

const BASE_LAYER = rawProduct('Base Layer Tee', [
  { id: 'gid://shopify/ProductVariant/blt-m', size: 'M', price: '14.00', stock: 20 },
]);

const CANVAS_SHORTS = rawProduct('Canvas Shorts', [
  { id: 'gid://shopify/ProductVariant/cs-m', size: 'M', price: '39.00', stock: 0 },
]);

// Things that must NEVER appear in the restricted catalogue.
const GIFT_CARD = {
  id: 'gid://shopify/Product/Gift-Card',
  title: 'Gift Card',
  description: 'A digital gift card.',
  featuredImage: { url: 'https://cdn.shopify.com/gc.jpg', altText: 'Gift Card' },
  variants: { edges: [{ node: { id: 'gid://shopify/ProductVariant/gc', title: 'Default', price: '50.00', inventoryQuantity: 999, selectedOptions: [] } }] },
};

const SNOWBOARD = {
  id: 'gid://shopify/Product/Snowboard',
  title: 'Snowboard',
  description: 'A default Shopify snowboard.',
  featuredImage: null,
  variants: { edges: [{ node: { id: 'gid://shopify/ProductVariant/sb', title: 'Default', price: '499.00', inventoryQuantity: 10, selectedOptions: [] } }] },
};

function mockGetProducts(products: any[]) {
  (getProducts as ReturnType<typeof vi.fn>).mockResolvedValue(products);
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('catalogue: restricted set', () => {
  beforeEach(() => vi.clearAllMocks());

  it('NORTHWIND_PRODUCTS contains exactly 12 entries', () => {
    expect(NORTHWIND_PRODUCTS).toHaveLength(12);
  });

  it('fetchCatalogue keeps only Northwind products and drops gift cards / defaults', async () => {
    mockGetProducts([FIELD_JACKET, BASE_LAYER, GIFT_CARD, SNOWBOARD]);
    const catalogue = await fetchCatalogue();
    const titles = catalogue.map(p => p.title);

    expect(titles).toContain('Field Jacket');
    expect(titles).toContain('Base Layer Tee');
    expect(titles).not.toContain('Gift Card');
    expect(titles).not.toContain('Snowboard');
  });

  it('fetchCatalogue normalizes variants to {id, size, price, stock}', async () => {
    mockGetProducts([FIELD_JACKET]);
    const [product] = await fetchCatalogue();

    expect(product.id).toBe(FIELD_JACKET.id);
    expect(product.title).toBe('Field Jacket');
    expect(product.image).toBe('https://cdn.shopify.com/Field Jacket.jpg');
    expect(product.variants).toHaveLength(3);

    const m = product.variants.find(v => v.size === 'M')!;
    expect(m.id).toBe('gid://shopify/ProductVariant/fj-m');
    expect(m.price).toBe('149.00');
    expect(m.stock).toBe(9);
  });

  it('out-of-stock variants are included (so callers can show them)', async () => {
    mockGetProducts([FIELD_JACKET]);
    const [product] = await fetchCatalogue();
    const xl = product.variants.find(v => v.size === 'XL')!;
    expect(xl.stock).toBe(0);
  });
});

describe('catalogue: searchCatalogue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('matches by query words in title', async () => {
    mockGetProducts([FIELD_JACKET, BASE_LAYER]);
    const results = await searchCatalogue({ query: 'field jacket' });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Field Jacket');
  });

  it('matches by query words in description', async () => {
    mockGetProducts([FIELD_JACKET, BASE_LAYER]);
    const results = await searchCatalogue({ query: 'trail' });
    expect(results.map(p => p.title).sort()).toEqual(['Base Layer Tee', 'Field Jacket']);
  });

  it('requires ALL query words to match', async () => {
    mockGetProducts([FIELD_JACKET, BASE_LAYER]);
    const results = await searchCatalogue({ query: 'field snowboard' });
    expect(results).toHaveLength(0);
  });

  it('filters by max_price (at least one variant ≤ price)', async () => {
    mockGetProducts([FIELD_JACKET, BASE_LAYER]);
    const results = await searchCatalogue({ query: 'trail', maxPrice: 50 });
    expect(results.map(p => p.title)).toEqual(['Base Layer Tee']);
  });

  it('filters by size (product must have that variant size)', async () => {
    mockGetProducts([FIELD_JACKET, BASE_LAYER]);
    const withXL = await searchCatalogue({ query: 'trail', size: 'XL' });
    expect(withXL.map(p => p.title)).toEqual(['Field Jacket']);

    const withS = await searchCatalogue({ query: 'trail', size: 'S' });
    expect(withS).toHaveLength(0);
  });

  it('respects the limit (default 6)', async () => {
    const allTwelve = NORTHWIND_PRODUCTS.map(t =>
      rawProduct(t, [{ id: `gid://shopify/ProductVariant/${t}-m`, size: 'M', price: '10.00', stock: 1 }]),
    );
    mockGetProducts(allTwelve);
    const results = await searchCatalogue({ query: 'trail' });
    expect(results.length).toBeLessThanOrEqual(6);
  });

  it('returns empty array when nothing matches', async () => {
    mockGetProducts([FIELD_JACKET]);
    const results = await searchCatalogue({ query: 'waterproof sandals' });
    expect(results).toEqual([]);
  });
});

describe('catalogue: lookups by id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getProductById returns the product', async () => {
    mockGetProducts([FIELD_JACKET]);
    const product = await getProductById(FIELD_JACKET.id);
    expect(product?.title).toBe('Field Jacket');
  });

  it('getProductById returns null for an unknown / non-Northwind id', async () => {
    mockGetProducts([FIELD_JACKET, GIFT_CARD]);
    expect(await getProductById('gid://shopify/Product/Nope')).toBeNull();
    expect(await getProductById(GIFT_CARD.id)).toBeNull();
  });

  it('getVariantById returns the variant and its parent product', async () => {
    mockGetProducts([FIELD_JACKET, BASE_LAYER]);
    const found = await getVariantById('gid://shopify/ProductVariant/blt-m');
    expect(found?.product.title).toBe('Base Layer Tee');
    expect(found?.variant.size).toBe('M');
    expect(found?.variant.price).toBe('14.00');
  });

  it('getVariantById returns null for an unknown variant', async () => {
    mockGetProducts([FIELD_JACKET]);
    expect(await getVariantById('gid://shopify/ProductVariant/missing')).toBeNull();
  });
});
