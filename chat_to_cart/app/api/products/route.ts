import { NextResponse } from 'next/server';
import { getProducts } from '@/lib/shopify';

export async function GET() {
  try {
    const products = await getProducts();
    const mapped = products.map((p: any) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      image: p.featuredImage?.url ?? null,
      imageAlt: p.featuredImage?.altText ?? p.title,
      variants: (p.variants?.edges ?? []).map((e: any) => ({
        id: e.node.id,
        size: e.node.selectedOptions?.find((o: any) => o.name === 'Size')?.value ?? e.node.title,
        price: e.node.price,
        stock: e.node.inventoryQuantity,
      })),
    }));
    return NextResponse.json(mapped);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
