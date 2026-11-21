import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth';
import { getProducts } from '@/lib/shopify';
import {
  getSuppliers,
  getSupplierItems,
  getAllSales,
  getLatestSnapshots,
  getPurchaseOrders,
  getPoLines,
  getRuns,
  getOnOrderQty,
} from '@/lib/db';
import { forecastVariant } from '@/lib/forecast';


const NORTHWIND_PRODUCTS = [
  'Field Jacket', 'Trail Blazer', 'Base Layer Tee', 'Merino Sweater',
  'Chino Pants', 'Canvas Shorts', 'Wool Beanie', 'Leather Belt',
  'Crew Socks (3-Pack)', 'Rain Shell', 'Down Vest', 'Flannel Shirt',
];

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

function getStoreToday(): Date {
  const tz = process.env.STORE_TIMEZONE || 'UTC';
  try {
    return new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
  } catch {
    return new Date();
  }
}

export async function GET(_req: NextRequest) {
  const auth = await requireOwner();
  if (auth instanceof NextResponse) return auth;

  try {
    const [products, suppliers, supplierItems, salesMap, snapshotMap, pos, runs] = await Promise.all([
      getProducts().catch(() => []),
      getSuppliers(),
      getSupplierItems(),
      getAllSales(),
      getLatestSnapshots(),
      getPurchaseOrders(),
      getRuns(20),
    ]);

    const northwind = products.filter((p: any) => NORTHWIND_PRODUCTS.includes(p.title));
    const supplierByVariant = new Map(supplierItems.map(si => [si.shopify_variant_id, si]));
    const supplierById = new Map(suppliers.map(s => [s.id, s]));
    const today = getStoreToday();

    const forecasts = [];
    for (const product of northwind) {
      const variants = product.variants?.edges?.map((e: any) => e.node) ?? [];
      for (const v of variants) {
        const si = supplierByVariant.get(v.id);
        if (!si) continue;
        const supplier = supplierById.get(si.supplier_id);
        if (!supplier) continue;

        const onHand = snapshotMap.get(v.id) ?? v.inventoryQuantity ?? 0;
        const onOrder = await getOnOrderQty(v.id);
        const size = v.selectedOptions?.find((o: any) => o.name === 'Size')?.value ?? v.title;

        const fc = forecastVariant({
          shopify_variant_id: v.id,
          product_title: product.title,
          size,
          on_hand: onHand,
          sales: salesMap.get(v.id) ?? [],
          supplier: {
            id: supplier.id,
            name: supplier.name,
            email: supplier.email,
            lead_time_days: supplier.lead_time_days,
            moq: supplier.moq,
            case_pack: supplier.case_pack,
          },
          today,
          on_order: onOrder,
        });

        forecasts.push({
          ...fc,
          image: LOCAL_IMAGES[product.title] ?? product.featuredImage?.url ?? null,
          supplier_name: supplier.name,
          lead_time_days: supplier.lead_time_days,
          case_pack: supplier.case_pack,
          moq: supplier.moq,
          on_order: onOrder,
          retail_price: Number(v.price),
        });
      }
    }

    // Attach po_number to each forecast if it's in a draft PO
    const poByVariant = new Map<string, string>();
    for (const po of pos) {
      if (po.status !== 'draft') continue;
      const lines = await getPoLines(po.id);
      for (const l of lines) {
        if (!poByVariant.has(l.shopify_variant_id)) {
          poByVariant.set(l.shopify_variant_id, po.po_number);
        }
      }
    }
    for (const fc of forecasts) {
      (fc as any).po_number = poByVariant.get(fc.shopify_variant_id) ?? null;
    }

    // KPIs
    const orderNow = forecasts.filter(f => f.status === 'Order now');
    const runningOut14 = forecasts.filter(f => {
      if (!f.run_out_date) return false;
      const days = (new Date(f.run_out_date).getTime() - today.getTime()) / 86_400_000;
      return days <= 14 && days >= 0;
    });
    const draftPos = pos.filter(p => p.status === 'draft');
    const draftValue = draftPos.reduce((s, p) => s + Number(p.total), 0);
    const nextRunOut = forecasts
      .filter(f => f.run_out_date)
      .sort((a, b) => new Date(a.run_out_date!).getTime() - new Date(b.run_out_date!).getTime())[0];

    // POs with lines
    const posWithLines = await Promise.all(
      pos.map(async po => ({
        ...po,
        supplier_name: supplierById.get(po.supplier_id)?.name ?? 'Unknown',
        lines: await getPoLines(po.id),
      })),
    );

    return NextResponse.json({
      forecasts,
      kpis: {
        itemsToReorder: orderNow.length,
        runningOut14Days: runningOut14.length,
        draftPoCount: draftPos.length,
        draftPoValue: Math.round(draftValue * 100) / 100,
        nextRunOut: nextRunOut
          ? { item: `${nextRunOut.product_title} ${nextRunOut.size}`, date: nextRunOut.run_out_date }
          : null,
      },
      pos: posWithLines,
      suppliers: suppliers.map(s => ({ ...s, address: (s as any).address ?? null })),
      runs,
      today: today.toISOString(),
      currency: process.env.STORE_CURRENCY || 'USD',
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Dashboard load failed' }, { status: 500 });
  }
}
