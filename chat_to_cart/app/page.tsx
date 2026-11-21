import { Suspense } from 'react';
import { connection } from 'next/server';
import { fetchCatalogue } from '@/lib/catalogue';
import { Product, StorefrontShell } from './storefront-client';

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
  // Opt this subtree into request-time rendering before any unstable value
  // (the Shopify token cache reads `Date.now()`) is touched, so the page is
  // streamed rather than prerendered.
  await connection();

  let products: Product[] = [];
  let failed = false;
  try {
    const catalogue = await fetchCatalogue();
    products = catalogue.map(p => ({
      id: p.id,
      title: p.title,
      description: p.description,
      image: LOCAL_IMAGES[p.title] ?? p.image,
      imageAlt: p.imageAlt || p.title,
      variants: p.variants.map(v => ({
        id: v.id,
        size: v.size,
        price: v.price,
        stock: v.stock,
      })),
    }));
  } catch (e) {
    // Log so an operator can see why the catalogue is empty, but still render
    // the shell so the assistant and cart keep working.
    console.error('[northwind] catalogue fetch failed:', e);
    failed = true;
  }

  return <StorefrontShell products={products} catalogueFailed={failed} />;
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-cream text-nw-text-secondary">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-forest-700 font-serif text-lg font-semibold text-white">
            N
          </div>
          <p className="text-sm">Loading Northwind…</p>
        </div>
      </div>
    }>
      <ProductGrid />
    </Suspense>
  );
}
