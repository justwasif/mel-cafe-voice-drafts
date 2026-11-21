// Data access for ro_* tables. Uses the service-role admin client (server only).
import { supabaseAdmin } from './supabase-admin';
import type { Supplier } from './forecast';

export type { Supplier };

export interface SupplierItem {
  id: string;
  supplier_id: string;
  shopify_product_id: string;
  shopify_variant_id: string;
  product_title: string;
  supplier_sku: string | null;
  unit_cost: number;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_id: string;
  status: 'draft' | 'approved' | 'rejected';
  total_units: number;
  subtotal: number;
  tax_total: number;
  total: number;
  why_note: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  pdf_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface PoLine {
  id: string;
  po_id: string;
  shopify_variant_id: string;
  supplier_sku: string | null;
  item_name: string;
  size: string;
  qty: number;
  unit_cost: number;
  line_total: number;
}

export interface OutboxEntry {
  id: string;
  po_id: string;
  to_email: string;
  subject: string;
  body: string;
  pdf_path: string;
  sent_at: string | null;
}

export interface AgentRun {
  id: string;
  status: 'running' | 'completed' | 'failed';
  summary: string | null;
  variants_checked: number | null;
  order_now_count: number | null;
  draft_pos_created: number | null;
  started_at: string;
  finished_at: string | null;
}

// ---- Suppliers ----

export async function getSuppliers(): Promise<(Supplier & { email: string })[]> {
  const { data, error } = await supabaseAdmin
    .from('ro_suppliers')
    .select('*')
    .order('name');
  if (error) throw error;
  return (data ?? []).map(s => ({
    id: s.id,
    name: s.name,
    email: s.email,
    address: s.address,
    lead_time_days: s.lead_time_days,
    moq: s.moq,
    case_pack: s.case_pack,
  }));
}

export async function getSupplierById(id: string) {
  const { data, error } = await supabaseAdmin
    .from('ro_suppliers')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as Supplier & { email: string; address: string | null };
}

// ---- Supplier items ----

export async function getSupplierItems(): Promise<SupplierItem[]> {
  const { data, error } = await supabaseAdmin
    .from('ro_supplier_items')
    .select('*');
  if (error) throw error;
  return (data ?? []) as SupplierItem[];
}

export async function getSupplierItemByVariant(variantId: string) {
  const { data, error } = await supabaseAdmin
    .from('ro_supplier_items')
    .select('*')
    .eq('shopify_variant_id', variantId)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null; // not found
    throw error;
  }
  return data as SupplierItem;
}

// ---- Sales daily ----

export async function getSalesForVariant(variantId: string) {
  const { data, error } = await supabaseAdmin
    .from('ro_sales_daily')
    .select('date, quantity')
    .eq('shopify_variant_id', variantId)
    .order('date', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(r => ({ date: r.date as string, quantity: r.quantity as number }));
}

export async function getAllSales(): Promise<Map<string, { date: string; quantity: number }[]>> {
  const map = new Map<string, { date: string; quantity: number }[]>();
  const PAGE = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabaseAdmin
      .from('ro_sales_daily')
      .select('shopify_variant_id, date, quantity')
      .order('date', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) {
      const arr = map.get(r.shopify_variant_id) ?? [];
      arr.push({ date: r.date as string, quantity: r.quantity as number });
      map.set(r.shopify_variant_id, arr);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return map;
}

// ---- Snapshots ----

export async function saveSnapshot(variantId: string, onHand: number) {
  const { error } = await supabaseAdmin.from('ro_snapshots').insert({
    shopify_variant_id: variantId,
    on_hand: onHand,
  });
  if (error) throw error;
}

export async function getLatestSnapshots(): Promise<Map<string, number>> {
  // Supabase doesn't do DISTINCT ON; fetch latest per variant in JS.
  const { data, error } = await supabaseAdmin
    .from('ro_snapshots')
    .select('shopify_variant_id, on_hand, checked_at')
    .order('checked_at', { ascending: false });
  if (error) throw error;
  const map = new Map<string, number>();
  for (const r of data ?? []) {
    if (!map.has(r.shopify_variant_id)) {
      map.set(r.shopify_variant_id, r.on_hand as number);
    }
  }
  return map;
}

export async function getSnapshotsForVariant(variantId: string) {
  const { data, error } = await supabaseAdmin
    .from('ro_snapshots')
    .select('on_hand, checked_at')
    .eq('shopify_variant_id', variantId)
    .order('checked_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(r => ({ on_hand: r.on_hand as number, checked_at: r.checked_at as string }));
}

// ---- Purchase orders ----

export async function getPurchaseOrders(): Promise<PurchaseOrder[]> {
  const { data, error } = await supabaseAdmin
    .from('ro_purchase_orders')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as PurchaseOrder[];
}

export async function getPurchaseOrderById(id: string): Promise<PurchaseOrder | null> {
  const { data, error } = await supabaseAdmin
    .from('ro_purchase_orders')
    .select('*')
    .eq('id', id)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data as PurchaseOrder;
}

export async function getDraftPoForSupplier(supplierId: string): Promise<PurchaseOrder | null> {
  const { data, error } = await supabaseAdmin
    .from('ro_purchase_orders')
    .select('*')
    .eq('supplier_id', supplierId)
    .eq('status', 'draft')
    .maybeSingle();
  if (error) throw error;
  return (data as PurchaseOrder) ?? null;
}

export async function getPoLines(poId: string): Promise<PoLine[]> {
  const { data, error } = await supabaseAdmin
    .from('ro_po_lines')
    .select('*')
    .eq('po_id', poId)
    .order('item_name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as PoLine[];
}

export async function getOnOrderQty(variantId: string): Promise<number> {
  // Sum qty across draft + approved PO lines for this variant
  const { data: lines, error } = await supabaseAdmin
    .from('ro_po_lines')
    .select('qty, po:ro_purchase_orders(status)')
    .eq('shopify_variant_id', variantId);
  if (error) throw error;
  return (lines ?? [])
    .filter((l: any) => l.po?.status === 'draft' || l.po?.status === 'approved')
    .reduce((sum: number, l: any) => sum + (l.qty as number), 0);
}

export async function createPurchaseOrder(input: {
  po_number: string;
  supplier_id: string;
  why_note: string | null;
  pdf_path: string | null;
}): Promise<PurchaseOrder> {
  const { data, error } = await supabaseAdmin
    .from('ro_purchase_orders')
    .insert({
      po_number: input.po_number,
      supplier_id: input.supplier_id,
      status: 'draft',
      why_note: input.why_note,
      pdf_path: input.pdf_path,
    })
    .select()
    .single();
  if (error) throw error;
  return data as PurchaseOrder;
}

export async function updatePurchaseOrder(id: string, patch: Partial<PurchaseOrder>) {
  const { data, error } = await supabaseAdmin
    .from('ro_purchase_orders')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as PurchaseOrder;
}

export async function replacePoLines(poId: string, lines: Array<{
  shopify_variant_id: string;
  supplier_sku: string | null;
  item_name: string;
  size: string;
  qty: number;
  unit_cost: number;
  line_total: number;
}>) {
  await supabaseAdmin.from('ro_po_lines').delete().eq('po_id', poId);
  if (lines.length === 0) return;
  const { error } = await supabaseAdmin.from('ro_po_lines').insert(
    lines.map(l => ({ po_id: poId, ...l })),
  );
  if (error) throw error;
}

export async function recalcPoTotals(poId: string) {
  const lines = await getPoLines(poId);
  const totalUnits = lines.reduce((s, l) => s + l.qty, 0);
  const subtotal = lines.reduce((s, l) => s + Number(l.line_total), 0);
  const taxTotal = 0; // sample data, no tax
  const total = subtotal + taxTotal;
  return updatePurchaseOrder(poId, {
    total_units: totalUnits,
    subtotal: round2(subtotal),
    tax_total: round2(taxTotal),
    total: round2(total),
  });
}

// ---- Next PO number ----

export async function nextPoNumber(): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('ro_purchase_orders')
    .select('po_number')
    .order('po_number', { ascending: false })
    .limit(1);
  if (error) throw error;
  const last = data?.[0]?.po_number as string | undefined;
  if (!last) return 'PO-2026-0001';
  const m = last.match(/PO-\d{4}-(\d+)/);
  const next = m ? String(Number(m[1]) + 1).padStart(4, '0') : '0001';
  return `PO-2026-${next}`;
}

// ---- Outbox ----

export async function getOutboxEntries(): Promise<OutboxEntry[]> {
  const { data, error } = await supabaseAdmin
    .from('ro_outbox')
    .select('*')
    .order('sent_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as OutboxEntry[];
}

export async function addToOutbox(input: Omit<OutboxEntry, 'id' | 'sent_at'>) {
  const { data, error } = await supabaseAdmin
    .from('ro_outbox')
    .insert({ ...input, sent_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return data as OutboxEntry;
}

// ---- Agent runs ----

export async function startRun(): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('ro_runs')
    .insert({ status: 'running' })
    .select()
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function finishRun(
  id: string,
  summary: string,
  variantsChecked: number,
  orderNowCount: number,
  draftPosCreated: number,
  status: 'completed' | 'failed' = 'completed',
) {
  const { error } = await supabaseAdmin
    .from('ro_runs')
    .update({
      status,
      summary,
      variants_checked: variantsChecked,
      order_now_count: orderNowCount,
      draft_pos_created: draftPosCreated,
      finished_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}

export async function getRuns(limit = 20): Promise<AgentRun[]> {
  const { data, error } = await supabaseAdmin
    .from('ro_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as AgentRun[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
