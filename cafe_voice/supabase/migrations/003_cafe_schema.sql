-- Cafe Voice Ordering — shared schema
-- Tables are prefixed with cf_ because this Supabase project is shared
-- with other apps. Do not touch tables without the cf_ prefix.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Menu items
CREATE TABLE IF NOT EXISTS cf_menu (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('coffee','tea','bakery','breakfast','cold_drinks')),
  description text,
  sizes jsonb NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  available boolean NOT NULL DEFAULT true,
  popular boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Example sizes structure:
-- [{"size": "small", "price": 420}, {"size": "large", "price": 520}]
-- prices are in the smallest currency unit (cents) to avoid floats.

-- Example options structure:
-- [
--   {"name": "Oat milk", "price": 60},
--   {"name": "Almond milk", "price": 60},
--   {"name": "Extra shot", "price": 80}
-- ]

-- Orders
CREATE TABLE IF NOT EXISTS cf_orders (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number text UNIQUE NOT NULL,
  customer_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('listening','draft','sent_to_kitchen','confirmed','payment_link_sent','paid','ready','rejected')) DEFAULT 'listening',
  total_amount int NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  stripe_session_id text,
  stripe_url text,
  reject_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  paid_at timestamptz,
  ready_at timestamptz
);

-- Order items
CREATE TABLE IF NOT EXISTS cf_order_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id uuid NOT NULL REFERENCES cf_orders(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES cf_menu(id),
  name text NOT NULL,
  size text NOT NULL,
  unit_price int NOT NULL,
  qty int NOT NULL CHECK (qty > 0),
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  line_total int NOT NULL,
  unavailable boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Audit events
CREATE TABLE IF NOT EXISTS cf_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id uuid NOT NULL REFERENCES cf_orders(id) ON DELETE CASCADE,
  event text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cf_orders_status ON cf_orders(status);
CREATE INDEX IF NOT EXISTS idx_cf_orders_number ON cf_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_cf_order_items_order_id ON cf_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_cf_events_order_id ON cf_events(order_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE cf_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE cf_order_items;

-- RLS
ALTER TABLE cf_menu ENABLE ROW LEVEL SECURITY;
ALTER TABLE cf_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE cf_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE cf_events ENABLE ROW LEVEL SECURITY;

-- Anonymous users can read menu and create/listen to their own orders.
-- The app uses order_id as a bearer token; anonymous RLS allows creating and reading by id.
DROP POLICY IF EXISTS cf_menu_anon_read ON cf_menu;
CREATE POLICY cf_menu_anon_read ON cf_menu FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS cf_orders_anon_insert ON cf_orders;
CREATE POLICY cf_orders_anon_insert ON cf_orders FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS cf_orders_anon_select ON cf_orders;
CREATE POLICY cf_orders_anon_select ON cf_orders FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS cf_orders_anon_update ON cf_orders;
CREATE POLICY cf_orders_anon_update ON cf_orders FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS cf_order_items_anon_all ON cf_order_items;
CREATE POLICY cf_order_items_anon_all ON cf_order_items FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS cf_events_anon_select ON cf_events;
CREATE POLICY cf_events_anon_select ON cf_events FOR SELECT TO anon USING (true);

-- Authenticated staff can do everything.
DROP POLICY IF EXISTS cf_menu_staff_all ON cf_menu;
CREATE POLICY cf_menu_staff_all ON cf_menu FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS cf_orders_staff_all ON cf_orders;
CREATE POLICY cf_orders_staff_all ON cf_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF NOT EXISTS cf_order_items_staff_all ON cf_order_items;
CREATE POLICY cf_order_items_staff_all ON cf_order_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF NOT EXISTS cf_events_staff_insert ON cf_events;
CREATE POLICY cf_events_staff_insert ON cf_events FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF NOT EXISTS cf_events_staff_select ON cf_events;
CREATE POLICY cf_events_staff_select ON cf_events FOR SELECT TO authenticated USING (true);

-- Trigger to keep updated_at current
CREATE OR REPLACE FUNCTION update_cf_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_cf_orders_updated_at ON cf_orders;
CREATE TRIGGER tr_cf_orders_updated_at
BEFORE UPDATE ON cf_orders
FOR EACH ROW EXECUTE FUNCTION update_cf_orders_updated_at();

