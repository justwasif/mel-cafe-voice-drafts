import { Suspense } from 'react';
import { getProducts } from '@/lib/shopify';
import { Storefront, StorefrontShell } from './storefront-client';

const NORTHWIND_PRODUCTS = [
  'Field Jacket', 'Trail Blazer', 'Base Layer Tee', 'Merino Sweater',
  'Chino Pants', 'Canvas Shorts', 'Wool Beanie', 'Leather Belt',
  'Crew Socks (3-Pack)', 'Rain Shell', 'Down Vest', 'Flannel Shirt',
];

// Local product photography (served from /public/products) — used in place of
// the Shopify CDN image so the storefront renders instantly with no external fetch.
const LOCAL_IMAGES: Record<string, string> = {
  'Field Jacket': '/products/field-jacket.jpg',
  'Trail Blazer': '/products/trail-blazer.jpg',
  'Base Layer Tee': '/products/base-layer-tee.jpg',
  'Merino Sweater': '/products/merino-sweater.jpg',
  'Chino Pants': '/products/chino-pants.jpg',
  'Canvas Shorts': '/products/canvas-shorts.jpg',
  'Wool Beanie': '/products/wool-beanie.jpg',
  'Leather Belt': '/products/leather-belt.jpg',
  'Crew Socks (3-Pack)': '/products/crew-socks.jpg',
  'Rain Shell': '/products/rain-shell.jpg',
  'Down Vest': '/products/down-vest.jpg',
  'Flannel Shirt': '/products/flannel-shirt.jpg',
};

async function ProductGrid() {
  let products: any[] = [];
  try {
    const raw = await getProducts();
    products = raw
      .filter((p: any) => NORTHWIND_PRODUCTS.includes(p.title))
      .map((p: any) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        image: LOCAL_IMAGES[p.title] ?? p.featuredImage?.url ?? null,
        imageAlt: p.featuredImage?.altText ?? p.title,
        variants: (p.variants?.edges ?? []).map((e: any) => ({
          id: e.node.id,
          size: e.node.selectedOptions?.find((o: any) => o.name === 'Size')?.value ?? e.node.title,
          price: e.node.price,
          stock: e.node.inventoryQuantity,
        })),
      }));
  } catch {
    products = [];
  }

  return <Storefront products={products} />;
}

export default function Home() {
  return (
    <StorefrontShell>
      <Suspense fallback={
        <div className="mx-auto max-w-6xl px-6 py-12">
          <h2 className="mb-6 text-2xl font-bold text-forest-800">Shop All</h2>
          <div className="py-20 text-center text-stone-400">Loading products…</div>
        </div>
      }>
        <ProductGrid />
      </Suspense>
    </StorefrontShell>
  );
}
