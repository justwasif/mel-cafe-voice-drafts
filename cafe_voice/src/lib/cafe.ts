import { supabaseAdmin } from './supabase';
import type { MenuItem, Order, OrderItem, OrderWithItems } from '@/types/cafe';

export async function getMenu(): Promise<MenuItem[]> {
  const { data, error } = await supabaseAdmin
    .from('cf_menu')
    .select('*')
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []) as MenuItem[];
}

export async function findMenuItems(query: string): Promise<MenuItem[]> {
  const menu = await getMenu();
  const q = query.toLowerCase();
  return menu.filter(
    (m) =>
      m.name.toLowerCase().includes(q) ||
      (m.description && m.description.toLowerCase().includes(q)) ||
      m.category.toLowerCase().includes(q)
  );
}

export async function getMenuItemByName(name: string): Promise<MenuItem | null> {
  const menu = await getMenu();
  const q = name.toLowerCase();
  return menu.find((m) => m.name.toLowerCase() === q) || null;
}

export function getSizePrice(item: MenuItem, size: string): number | null {
  const match = item.sizes.find(
    (s) => s.size.toLowerCase() === size.toLowerCase()
  );
  return match ? match.price : null;
}

export function normalizeSize(item: MenuItem, spokenSize: string): string | null {
  const sizes = item.sizes.map((s) => s.size.toLowerCase());
  const input = spokenSize.toLowerCase();
  if (sizes.includes(input)) {
    const matched = item.sizes.find((s) => s.size.toLowerCase() === input)!;
    return matched.size;
  }
  if (sizes.includes('small') && (input === 'regular' || input === 'medium')) return item.sizes.find((s) => s.size.toLowerCase() === 'small')!.size;
  if (sizes.includes('large') && input === 'big') return item.sizes.find((s) => s.size.toLowerCase() === 'large')!.size;
  if (sizes.length === 1) return item.sizes[0].size;
  return null;
}

export function normalizeOption(item: MenuItem, spokenOption: string): MenuItem['options'][number] | null {
  const q = spokenOption.toLowerCase().replace(/\bmilk\b/g, '').trim();
  for (const opt of item.options) {
    const name = opt.name.toLowerCase();
    if (name === spokenOption.toLowerCase()) return opt;
    if (name.includes(q)) return opt;
    if (q.includes(name.replace(/\bmilk\b/g, '').trim())) return opt;
  }
  return null;
}

export function calculateLineTotal(
  unitPrice: number,
  qty: number,
  options: { price: number }[]
): number {
  return (unitPrice + options.reduce((sum, o) => sum + o.price, 0)) * qty;
}

export async function createOrder(customerName: string): Promise<Order> {
  const orderNumber = await generateOrderNumber();
  const { data, error } = await supabaseAdmin
    .from('cf_orders')
    .insert({
      order_number: orderNumber,
      customer_name: customerName,
      status: 'draft',
      total_amount: 0,
      currency: process.env.CAFE_CURRENCY || 'USD',
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as Order;
}

async function generateOrderNumber(): Promise<string> {
  const prefix = 'EO';
  const { count, error } = await supabaseAdmin
    .from('cf_orders')
    .select('*', { count: 'exact', head: true });
  if (error) throw new Error(error.message);
  const n = (count || 0) + 142;
  return `${prefix}-${String(n).padStart(4, '0')}`;
}

export async function getOrderWithItems(id: string): Promise<OrderWithItems | null> {
  const { data: order, error: orderError } = await supabaseAdmin
    .from('cf_orders')
    .select('*')
    .eq('id', id)
    .single();

  if (orderError || !order) return null;

  const { data: items, error: itemsError } = await supabaseAdmin
    .from('cf_order_items')
    .select('*')
    .eq('order_id', id)
    .order('created_at', { ascending: true });

  if (itemsError) throw new Error(itemsError.message);

  return { ...order, items: (items || []) as OrderItem[] } as OrderWithItems;
}

export async function getOrderByNumber(orderNumber: string): Promise<OrderWithItems | null> {
  const { data: order, error } = await supabaseAdmin
    .from('cf_orders')
    .select('*')
    .eq('order_number', orderNumber)
    .single();

  if (error || !order) return null;
  return getOrderWithItems(order.id);
}

export async function addOrderItem(
  orderId: string,
  menuItem: MenuItem,
  size: string,
  options: MenuItem['options'],
  qty: number
): Promise<OrderWithItems> {
  const unitPrice = getSizePrice(menuItem, size);
  if (unitPrice === null) throw new Error(`Size ${size} not found for ${menuItem.name}`);

  const lineTotal = calculateLineTotal(unitPrice, qty, options);

  const { error } = await supabaseAdmin.from('cf_order_items').insert({
    order_id: orderId,
    menu_item_id: menuItem.id,
    name: menuItem.name,
    size,
    unit_price: unitPrice,
    qty,
    options,
    line_total: lineTotal,
  });

  if (error) throw new Error(error.message);
  return await recalculateOrderTotal(orderId);
}

export async function removeOrderItem(orderId: string, itemId: string): Promise<OrderWithItems> {
  const { error } = await supabaseAdmin.from('cf_order_items').delete().eq('id', itemId);
  if (error) throw new Error(error.message);
  return await recalculateOrderTotal(orderId);
}

export async function setItemUnavailable(orderId: string, itemId: string, unavailable: boolean): Promise<OrderWithItems> {
  const { error } = await supabaseAdmin
    .from('cf_order_items')
    .update({ unavailable })
    .eq('id', itemId);

  if (error) throw new Error(error.message);
  return await recalculateOrderTotal(orderId);
}

export async function recalculateOrderTotal(orderId: string): Promise<OrderWithItems> {
  const order = await getOrderWithItems(orderId);
  if (!order) throw new Error('Order not found');

  const total = order.items
    .filter((i) => !i.unavailable)
    .reduce((sum, i) => sum + i.line_total, 0);

  const { error } = await supabaseAdmin
    .from('cf_orders')
    .update({ total_amount: total })
    .eq('id', orderId);

  if (error) throw new Error(error.message);

  return (await getOrderWithItems(orderId))!;
}

export async function updateOrderStatus(
  orderId: string,
  status: Order['status'],
  extra?: Partial<Order>
): Promise<OrderWithItems> {
  const update: Partial<Order> = { status, ...extra };
  if (status === 'confirmed') update.confirmed_at = new Date().toISOString();
  if (status === 'paid') update.paid_at = new Date().toISOString();
  if (status === 'ready') update.ready_at = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from('cf_orders')
    .update(update)
    .eq('id', orderId);

  if (error) throw new Error(error.message);
  return (await getOrderWithItems(orderId))!;
}

export async function logEvent(orderId: string, event: string, payload?: Record<string, unknown>) {
  await supabaseAdmin.from('cf_events').insert({ order_id: orderId, event, payload: payload || {} });
}

