export type OrderStatus =
  | 'listening'
  | 'draft'
  | 'sent_to_kitchen'
  | 'confirmed'
  | 'payment_link_sent'
  | 'paid'
  | 'ready'
  | 'rejected';

export interface MenuSize {
  size: string;
  price: number;
}

export interface MenuOption {
  name: string;
  price: number;
}

export interface MenuItem {
  id: string;
  name: string;
  category: string;
  description: string | null;
  sizes: MenuSize[];
  options: MenuOption[];
  available: boolean;
  popular: boolean;
  created_at: string;
}

export interface OrderItemOption {
  name: string;
  price: number;
}

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string;
  name: string;
  size: string;
  unit_price: number;
  qty: number;
  options: OrderItemOption[];
  line_total: number;
  unavailable: boolean;
  created_at: string;
}

export interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  status: OrderStatus;
  total_amount: number;
  currency: string;
  stripe_session_id: string | null;
  stripe_url: string | null;
  reject_reason: string | null;
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
  paid_at: string | null;
  ready_at: string | null;
}

export interface OrderWithItems extends Order {
  items: OrderItem[];
}

export interface CafeEvent {
  id: string;
  order_id: string;
  event: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

