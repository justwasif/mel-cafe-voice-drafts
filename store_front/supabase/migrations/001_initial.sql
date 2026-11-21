-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Conversations
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_email TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('customer', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Approval requests
CREATE TABLE IF NOT EXISTS approval_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference TEXT NOT NULL UNIQUE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('refund', 'discount')),
  shopify_order_id TEXT NOT NULL,
  order_name TEXT,
  customer_email TEXT,
  amount NUMERIC(12,2),
  currency TEXT,
  line_items JSONB,
  reason TEXT,
  ai_summary TEXT,
  discount_percent INT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  decision_note TEXT,
  shopify_result JSONB,
  error TEXT
);

-- At most one pending request per (shopify_order_id, type)
CREATE UNIQUE INDEX idx_one_pending_per_order_type
  ON approval_requests (shopify_order_id, type)
  WHERE status = 'pending';

-- Store policies
CREATE TABLE IF NOT EXISTS store_policies (
  key TEXT PRIMARY KEY,
  text TEXT NOT NULL
);

-- RLS
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_policies ENABLE ROW LEVEL SECURITY;

-- Deny all direct access for anon/authenticated; server uses service role
CREATE POLICY deny_all_conversations ON conversations FOR ALL TO anon, authenticated USING (false);
CREATE POLICY deny_all_messages ON messages FOR ALL TO anon, authenticated USING (false);
CREATE POLICY deny_all_approval_requests ON approval_requests FOR ALL TO anon USING (false);
CREATE POLICY deny_all_store_policies ON store_policies FOR ALL TO anon, authenticated USING (false);

-- Owner can read and update approval_requests
CREATE POLICY owner_read_approval_requests ON approval_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY owner_update_approval_requests ON approval_requests FOR UPDATE TO authenticated USING (true);
