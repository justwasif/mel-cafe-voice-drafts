// The agent run: check stock, forecast, draft POs, render PDFs.
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getProducts } from './shopify';
import {
  getSuppliers,
  getSupplierItems,
  getAllSales,
  saveSnapshot,
  createPurchaseOrder,
  getDraftPoForSupplier,
  updatePurchaseOrder,
  replacePoLines,
  recalcPoTotals,
  nextPoNumber,
  startRun,
  finishRun,
  getOnOrderQty,
  getPoLines,
} from './db';
import { forecastVariant } from './forecast';
import { writePoWhyNote } from './gemini';
import { PurchaseOrderPdf } from './po-pdf';

const NORTHWIND_PRODUCTS = [
  'Field Jacket', 'Trail Blazer', 'Base Layer Tee', 'Merino Sweater',
  'Chino Pants', 'Canvas Shorts', 'Wool Beanie', 'Leather Belt',
  'Crew Socks (3-Pack)', 'Rain Shell', 'Down Vest', 'Flannel Shirt',
];

const POS_DIR = join(process.cwd(), 'public', 'pos');

function getStoreToday(): Date {
  const tz = process.env.STORE_TIMEZONE || 'UTC';
  try {
    return new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
  } catch {
    return new Date();
  }
}

function currencySymbol(currency: string) {
  return currency === 'USD' ? '$' : `${currency} `;
}

export interface ForecastView {
  shopify_variant_id: string;
  product_title: string;
  size: string;
  on_hand: number;
  rate: number;
  days_of_cover: number;
  run_out_date: string | null;
  status: string;
  suggested_qty: number;
  supplier_id: string;
}

export interface AgentRunResult {
  runId: string;
  variantsChecked: number;
  orderNowCount: number;
  draftPosCreated: number;
  totalValue: number;
  summary: string;
  forecasts: ForecastView[];
}

export async function runAgent(): Promise<AgentRunResult> {
  const runId = await startRun();
  const currency = process.env.STORE_CURRENCY || 'USD';
  const today = getStoreToday();

  try {
    // 1. Fetch products and variants from Shopify
    const allProducts = await getProducts();
    const products = allProducts.filter((p: any) => NORTHWIND_PRODUCTS.includes(p.title));

    // 2. Load supplier mappings + sales
    const [suppliers, supplierItems, salesMap] = await Promise.all([
      getSuppliers(),
      getSupplierItems(),
      getAllSales(),
    ]);
    const supplierByVariant = new Map(supplierItems.map(si => [si.shopify_variant_id, si]));
    const supplierById = new Map(suppliers.map(s => [s.id, s]));

    // 3. Build forecasts and save snapshots
    const forecasts: ForecastView[] = [];
    for (const product of products) {
      const variants = product.variants?.edges?.map((e: any) => e.node) ?? [];
      for (const v of variants) {
        const si = supplierByVariant.get(v.id);
        if (!si) continue;
        const supplier = supplierById.get(si.supplier_id);
        if (!supplier) continue;

        const onHand = v.inventoryQuantity ?? 0;
        await saveSnapshot(v.id, onHand);

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
          shopify_variant_id: fc.shopify_variant_id,
          product_title: fc.product_title,
          size: fc.size,
          on_hand: fc.on_hand,
          rate: fc.rate,
          days_of_cover: fc.days_of_cover,
          run_out_date: fc.run_out_date,
          status: fc.status,
          suggested_qty: fc.suggested_qty,
          supplier_id: fc.supplier_id,
        });
      }
    }

    // 4. Group Order-now items by supplier, draft/update POs
    const orderNowBySupplier = new Map<string, ForecastView[]>();
    for (const fc of forecasts) {
      if (fc.status !== 'Order now') continue;
      if (fc.suggested_qty <= 0) continue;
      const arr = orderNowBySupplier.get(fc.supplier_id) ?? [];
      arr.push(fc);
      orderNowBySupplier.set(fc.supplier_id, arr);
    }

    mkdirSync(POS_DIR, { recursive: true });
    let draftPosCreated = 0;
    let totalValue = 0;

    for (const [supplierId, items] of orderNowBySupplier) {
      const supplier = supplierById.get(supplierId)!;
      const siByVariant = new Map(
        supplierItems.filter(s => s.supplier_id === supplierId).map(s => [s.shopify_variant_id, s]),
      );

      const poLines = items.map(fc => {
        const si = siByVariant.get(fc.shopify_variant_id)!;
        const lineTotal = Math.round(si.unit_cost * fc.suggested_qty * 100) / 100;
        return {
          shopify_variant_id: fc.shopify_variant_id,
          supplier_sku: si.supplier_sku,
          item_name: fc.product_title,
          size: fc.size,
          qty: fc.suggested_qty,
          unit_cost: si.unit_cost,
          line_total: lineTotal,
        };
      });

      // Find or create a draft PO for this supplier (one open draft per supplier)
      let po = await getDraftPoForSupplier(supplierId);
      if (!po) {
        const poNumber = await nextPoNumber();
        po = await createPurchaseOrder({
          po_number: poNumber,
          supplier_id: supplierId,
          why_note: null,
          pdf_path: null,
        });
        draftPosCreated++;
      }

      await replacePoLines(po.id, poLines);
      po = await recalcPoTotals(po.id);
      totalValue += Number(po.total);

      // Why note via Gemini (template fallback)
      const whyNote = await writePoWhyNote({
        supplierName: supplier.name,
        leadTimeDays: supplier.lead_time_days,
        total: Number(po.total),
        currency,
        lines: items.map(fc => ({
          item_name: fc.product_title,
          size: fc.size,
          qty: fc.suggested_qty,
          rate: fc.rate,
          run_out_date: fc.run_out_date,
          on_hand: fc.on_hand,
        })),
      });

      // Render draft PDF with watermark
      const lines = await getPoLines(po.id);
      const pdfPath = await renderPoPdf(po, supplier, lines, today, currency, whyNote, true);
      po = await updatePurchaseOrder(po.id, { why_note: whyNote, pdf_path: pdfPath });
    }

    const orderNowCount = forecasts.filter(f => f.status === 'Order now').length;
    const summary = `Checked ${forecasts.length} variants · ${orderNowCount} to reorder · ${orderNowBySupplier.size} draft POs (${currencySymbol(currency)}${totalValue.toFixed(2)})`;

    await finishRun(runId, summary, forecasts.length, orderNowCount, draftPosCreated, 'completed');

    return {
      runId,
      variantsChecked: forecasts.length,
      orderNowCount,
      draftPosCreated,
      totalValue,
      summary,
      forecasts,
    };
  } catch (e: any) {
    await finishRun(runId, `Run failed: ${e.message}`, 0, 0, 0, 'failed');
    throw e;
  }
}

export async function renderPoPdf(
  po: any,
  supplier: any,
  lines: any[],
  today: Date,
  currency: string,
  whyNote: string | null,
  isDraft: boolean,
): Promise<string> {
  const issueDate = today.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const supplierLead = supplier.lead_time_days ?? 14;
  const requiredBy = new Date(today.getTime() + supplierLead * 86_400_000)
    .toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  const element = React.createElement(PurchaseOrderPdf, {
    po: { ...po, status: isDraft ? 'draft' : po.status },
    supplier,
    lines,
    issueDate,
    requiredBy,
    currency,
    whyNote,
  });
  const buffer = await renderToBuffer(element as any);
  const relPath = `/pos/${po.po_number}.pdf`;
  const absPath = join(POS_DIR, `${po.po_number}.pdf`);
  writeFileSync(absPath, buffer);
  return relPath;
}
