-- Wholesale Reorder Agent schema (ro_ prefix). Leaves existing tables untouched.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Suppliers
CREATE TABLE IF NOT EXISTS ro_suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  address TEXT,
  lead_time_days INT NOT NULL,
  moq INT NOT NULL,
  case_pack INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Which Shopify variants are supplied by whom
CREATE TABLE IF NOT EXISTS ro_supplier_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id UUID NOT NULL REFERENCES ro_suppliers(id) ON DELETE CASCADE,
  shopify_product_id TEXT NOT NULL,
  shopify_variant_id TEXT NOT NULL UNIQUE,
  product_title TEXT NOT NULL,
  supplier_sku TEXT,
  unit_cost NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Daily seeded fake sales (deterministic)
CREATE TABLE IF NOT EXISTS ro_sales_daily (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shopify_variant_id TEXT NOT NULL,
  date DATE NOT NULL,
  quantity INT NOT NULL,
  UNIQUE(shopify_variant_id, date)
);

-- Stock-check snapshots
CREATE TABLE IF NOT EXISTS ro_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shopify_variant_id TEXT NOT NULL,
  on_hand INT NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ro_snapshots_variant_checked
  ON ro_snapshots(shopify_variant_id, checked_at DESC);

-- Purchase orders
CREATE TABLE IF NOT EXISTS ro_purchase_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_number TEXT NOT NULL UNIQUE,
  supplier_id UUID NOT NULL REFERENCES ro_suppliers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','rejected')),
  total_units INT NOT NULL DEFAULT 0,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  why_note TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  rejected_reason TEXT,
  pdf_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- At most one open (draft) PO per supplier
CREATE UNIQUE INDEX IF NOT EXISTS idx_ro_pos_one_draft_per_supplier
  ON ro_purchase_orders(supplier_id) WHERE status = 'draft';

-- PO lines
CREATE TABLE IF NOT EXISTS ro_po_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_id UUID NOT NULL REFERENCES ro_purchase_orders(id) ON DELETE CASCADE,
  shopify_variant_id TEXT NOT NULL,
  supplier_sku TEXT,
  item_name TEXT NOT NULL,
  size TEXT,
  qty INT NOT NULL,
  unit_cost NUMERIC(12,2) NOT NULL,
  line_total NUMERIC(12,2) NOT NULL
);

-- Outbox: what would be emailed
CREATE TABLE IF NOT EXISTS ro_outbox (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_id UUID NOT NULL REFERENCES ro_purchase_orders(id) ON DELETE CASCADE,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  pdf_path TEXT NOT NULL,
  sent_at TIMESTAMPTZ
);

-- Agent run log
CREATE TABLE IF NOT EXISTS ro_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  summary TEXT,
  variants_checked INT,
  order_now_count INT,
  draft_pos_created INT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

-- Row Level Security: owner (authenticated) only
ALTER TABLE ro_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ro_supplier_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ro_sales_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE ro_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE ro_purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE ro_po_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE ro_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE ro_runs ENABLE ROW LEVEL SECURITY;

-- Owner (authenticated) full access
CREATE POLICY owner_all_ro_suppliers ON ro_suppliers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY owner_all_ro_supplier_items ON ro_supplier_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY owner_all_ro_sales_daily ON ro_sales_daily FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY owner_all_ro_snapshots ON ro_snapshots FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY owner_all_ro_purchase_orders ON ro_purchase_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY owner_all_ro_po_lines ON ro_po_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY owner_all_ro_outbox ON ro_outbox FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY owner_all_ro_runs ON ro_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Deny anon
CREATE POLICY deny_anon_ro_suppliers ON ro_suppliers FOR ALL TO anon USING (false);
CREATE POLICY deny_anon_ro_supplier_items ON ro_supplier_items FOR ALL TO anon USING (false);
CREATE POLICY deny_anon_ro_sales_daily ON ro_sales_daily FOR ALL TO anon USING (false);
CREATE POLICY deny_anon_ro_snapshots ON ro_snapshots FOR ALL TO anon USING (false);
CREATE POLICY deny_anon_ro_purchase_orders ON ro_purchase_orders FOR ALL TO anon USING (false);
CREATE POLICY deny_anon_ro_po_lines ON ro_po_lines FOR ALL TO anon USING (false);
CREATE POLICY deny_anon_ro_outbox ON ro_outbox FOR ALL TO anon USING (false);
CREATE POLICY deny_anon_ro_runs ON ro_runs FOR ALL TO anon USING (false);
