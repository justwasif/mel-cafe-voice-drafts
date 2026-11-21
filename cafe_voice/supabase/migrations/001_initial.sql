-- Lantern & Thyme — Voice Host
-- Migration 001: schema, RPCs, RLS, seed

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Restaurant info
CREATE TABLE IF NOT EXISTS restaurant_info (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL DEFAULT 'Lantern & Thyme',
  address text NOT NULL DEFAULT '42 Ember Lane, Oldtown',
  phone text NOT NULL DEFAULT '(555) 019-2834',
  hours jsonb NOT NULL DEFAULT '{
    "monday": {"open": "11:00", "close": "22:00"},
    "tuesday": {"open": "11:00", "close": "22:00"},
    "wednesday": {"open": "11:00", "close": "22:00"},
    "thursday": {"open": "11:00", "close": "23:00"},
    "friday": {"open": "11:00", "close": "23:00"},
    "saturday": {"open": "10:00", "close": "23:00"},
    "sunday": {"open": "10:00", "close": "21:00"}
  }'::jsonb,
  policies text NOT NULL DEFAULT 'Maximum party size is 8. We hold tables for 15 minutes past the reservation time. Standard seating is 90 minutes. For parties larger than 8, please call us directly.',
  menu_highlights jsonb NOT NULL DEFAULT '[
    {"name": "Roasted Beet & Goat Cheese Salad", "dietary": ["vegetarian", "gluten-free"]},
    {"name": "Herb-Crusted Salmon", "dietary": ["gluten-free"]},
    {"name": "Wild Mushroom Risotto", "dietary": ["vegetarian"]},
    {"name": "Pan-Seared Duck Breast", "dietary": []},
    {"name": "Grilled Vegetable Platter", "dietary": ["vegan", "gluten-free"]},
    {"name": "Lantern Burger", "dietary": []},
    {"name": "Thyme & Lemon Chicken", "dietary": ["gluten-free"]},
    {"name": "Chocolate Lavender Tart", "dietary": ["vegetarian"]}
  ]'::jsonb,
  timezone text NOT NULL DEFAULT 'America/New_York'
);

INSERT INTO restaurant_info (id) VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- Dining tables
CREATE TABLE IF NOT EXISTS dining_tables (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  label text NOT NULL UNIQUE,
  seats int NOT NULL CHECK (seats IN (2,4,6,8)),
  area text NOT NULL CHECK (area IN ('window','patio','bar','main'))
);

INSERT INTO dining_tables (label, seats, area) VALUES
  ('T1 · Window', 2, 'window'),
  ('T2 · Window', 2, 'window'),
  ('T3 · Patio', 4, 'patio'),
  ('T4 · Patio', 4, 'patio'),
  ('T5 · Main', 4, 'main'),
  ('T6 · Main', 4, 'main'),
  ('T7 · Main', 4, 'main'),
  ('T8 · Bar', 4, 'bar'),
  ('T9 · Main', 6, 'main'),
  ('T10 · Patio', 6, 'patio'),
  ('T11 · Main', 6, 'main'),
  ('T12 · Window', 8, 'window')
ON CONFLICT (label) DO NOTHING;

-- Bookings
CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  guest_name text NOT NULL,
  guest_phone text NOT NULL,
  party_size int NOT NULL CHECK (party_size > 0 AND party_size <= 8),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  table_id uuid NOT NULL REFERENCES dining_tables(id),
  status text NOT NULL CHECK (status IN ('pending','approved','declined')) DEFAULT 'pending',
  notes text,
  source text NOT NULL DEFAULT 'voice',
  reference text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decision_note text
);

-- Exclusion constraint: pending or approved bookings cannot overlap on the same table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'no_overlap_bookings' AND conrelid = 'bookings'::regclass
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT no_overlap_bookings
      EXCLUDE USING gist (
        table_id WITH =,
        tstzrange(starts_at, ends_at) WITH &&
      )
      WHERE (status IN ('pending', 'approved'));
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_starts_at ON bookings(starts_at);
CREATE INDEX IF NOT EXISTS idx_bookings_table_id ON bookings(table_id);
CREATE INDEX IF NOT EXISTS idx_bookings_reference ON bookings(reference);

-- RLS
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Anonymous users cannot read or write bookings directly
DROP POLICY IF EXISTS bookings_anon_no_access ON bookings;
CREATE POLICY bookings_anon_no_access ON bookings
  FOR ALL TO anon USING (false) WITH CHECK (false);

-- Authenticated host users can read all bookings (host role checked in app)
DROP POLICY IF EXISTS bookings_auth_read ON bookings;
CREATE POLICY bookings_auth_read ON bookings
  FOR SELECT TO authenticated USING (true);

-- Authenticated host users can update bookings (approve/decline)
DROP POLICY IF EXISTS bookings_auth_update ON bookings;
CREATE POLICY bookings_auth_update ON bookings
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Service role bypasses RLS by default; we rely on the app using service role for inserts.

-- RPC: find_open_tables
CREATE OR REPLACE FUNCTION find_open_tables(
  p_party_size int,
  p_starts_at timestamptz
)
RETURNS TABLE(table_id uuid, label text, seats int, area text) AS $$
DECLARE
  v_dow text;
  v_time text;
  v_info restaurant_info%ROWTYPE;
  v_day_hours jsonb;
  v_open time;
  v_close time;
BEGIN
  SELECT * INTO v_info FROM restaurant_info LIMIT 1;
  v_dow := lower(to_char(p_starts_at, 'day'));
  v_dow := trim(v_dow);
  v_time := to_char(p_starts_at AT TIME ZONE v_info.timezone, 'HH24:MI');
  v_day_hours := v_info.hours->v_dow;

  IF v_day_hours IS NULL OR v_day_hours->>'open' IS NULL THEN
    RETURN;
  END IF;

  v_open := (v_day_hours->>'open')::time;
  v_close := (v_day_hours->>'close')::time;

  IF (v_time::time) < v_open OR (v_time::time) >= v_close THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT dt.id, dt.label, dt.seats, dt.area
  FROM dining_tables dt
  WHERE dt.seats >= p_party_size
    AND NOT EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.table_id = dt.id
        AND b.status IN ('pending', 'approved')
        AND tstzrange(b.starts_at, b.ends_at) && tstzrange(p_starts_at, p_starts_at + interval '90 minutes')
    )
  ORDER BY dt.seats ASC, dt.label ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: create_pending_booking
CREATE OR REPLACE FUNCTION create_pending_booking(
  p_guest_name text,
  p_guest_phone text,
  p_party_size int,
  p_starts_at timestamptz,
  p_table_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS TABLE(booking_id uuid, reference text) AS $$
DECLARE
  v_ref text;
  v_booking_id uuid;
  v_overlap int;
BEGIN
  -- Re-check availability inside transaction
  SELECT COUNT(*) INTO v_overlap
  FROM bookings b
  WHERE b.table_id = p_table_id
    AND b.status IN ('pending', 'approved')
    AND tstzrange(b.starts_at, b.ends_at) && tstzrange(p_starts_at, p_starts_at + interval '90 minutes');

  IF v_overlap > 0 THEN
    RAISE EXCEPTION 'Table is no longer available for this time slot';
  END IF;

  v_ref := 'LT-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));

  INSERT INTO bookings (
    guest_name, guest_phone, party_size, starts_at, ends_at,
    table_id, status, notes, source, reference
  ) VALUES (
    p_guest_name, p_guest_phone, p_party_size, p_starts_at,
    p_starts_at + interval '90 minutes', p_table_id, 'pending',
    p_notes, 'voice', v_ref
  )
  RETURNING bookings.id INTO v_booking_id;

  RETURN QUERY SELECT v_booking_id, v_ref;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
