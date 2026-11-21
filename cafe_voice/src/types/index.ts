export interface Booking {
  id: string;
  guest_name: string;
  guest_phone: string;
  party_size: number;
  starts_at: string;
  ends_at: string;
  table_id: string;
  status: 'pending' | 'approved' | 'declined';
  notes: string | null;
  source: string;
  reference: string;
  created_at: string;
  decided_at: string | null;
  decision_note: string | null;
  dining_tables?: { label: string; seats: number; area: string } | null;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}
