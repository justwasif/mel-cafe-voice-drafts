import { supabaseAdmin } from './supabase';

// The restaurant operates in America/New_York. Date/time strings from the
// model (e.g. "2026-11-21" + "19:00") represent local wall-clock time in
// that timezone, NOT the server's timezone. We must convert correctly.
const RESTAURANT_TZ = 'America/New_York';

// Convert a "YYYY-MM-DD" + "HH:MM" (restaurant-local) pair to an ISO string.
function toIsoFromRestaurantLocal(date: string, time: string): string | null {
  // Build a date string with explicit timezone offset.
  // new Date("2026-11-21T19:00:00-05:00") is unambiguous.
  // We compute the offset for that date in the restaurant tz.
  const dt = new Date(`${date}T${time}:00`);
  if (isNaN(dt.getTime())) return null;

  // Use Intl to get the offset for the restaurant tz on that date
  const tzDate = new Date(dt.toLocaleString('en-US', { timeZone: RESTAURANT_TZ }));
  const utcDate = new Date(dt.toLocaleString('en-US', { timeZone: 'UTC' }));
  const offsetMin = Math.round((tzDate.getTime() - utcDate.getTime()) / 60000);
  const sign = offsetMin >= 0 ? '+' : '-';
  const absOff = Math.abs(offsetMin);
  const offStr = `${sign}${String(Math.floor(absOff / 60)).padStart(2, '0')}:${String(absOff % 60).padStart(2, '0')}`;

  const withTz = new Date(`${date}T${time}:00${offStr}`);
  return withTz.toISOString();
}

export async function getRestaurantInfo(topic: string) {
  const { data, error } = await supabaseAdmin
    .from('restaurant_info')
    .select('*')
    .limit(1)
    .single();

  if (error || !data) {
    return { error: 'Could not fetch restaurant info' };
  }

  const t = topic.toLowerCase();
  if (t.includes('hour') || t.includes('open') || t.includes('close')) {
    return { hours: data.hours, timezone: data.timezone };
  }
  if (t.includes('menu') || t.includes('food') || t.includes('vegan') || t.includes('vegetarian') || t.includes('gluten')) {
    return { menu_highlights: data.menu_highlights };
  }
  if (t.includes('location') || t.includes('address') || t.includes('park')) {
    return { address: data.address, phone: data.phone };
  }
  if (t.includes('polic') || t.includes('rule') || t.includes('grace') || t.includes('max')) {
    return { policies: data.policies };
  }
  return {
    name: data.name,
    address: data.address,
    phone: data.phone,
    hours: data.hours,
    policies: data.policies,
    menu_highlights: data.menu_highlights,
    timezone: data.timezone,
  };
}

export async function findOpenTables(party_size: number, date: string, time: string) {
  const iso = toIsoFromRestaurantLocal(date, time);
  if (!iso) {
    return { error: 'Invalid date or time' };
  }

  const { data, error } = await supabaseAdmin.rpc('find_open_tables', {
    p_party_size: party_size,
    p_starts_at: iso,
  });

  if (error) {
    return { error: error.message };
  }

  return { tables: data || [] };
}

export async function createPendingBooking(
  guest_name: string,
  guest_phone: string,
  party_size: number,
  date: string,
  time: string,
  notes?: string
) {
  const iso = toIsoFromRestaurantLocal(date, time);
  if (!iso) {
    return { error: 'Invalid date or time' };
  }

  // Don't create a duplicate if this guest already requested this exact slot
  const { data: existing } = await supabaseAdmin
    .from('bookings')
    .select('id, reference')
    .eq('guest_phone', guest_phone)
    .eq('starts_at', iso)
    .in('status', ['pending', 'approved'])
    .limit(1);

  if (existing && existing.length > 0) {
    return { booking: [{ booking_id: existing[0].id, reference: existing[0].reference }], already_requested: true };
  }

  // Find smallest open table
  const { data: tables, error: findError } = await supabaseAdmin.rpc('find_open_tables', {
    p_party_size: party_size,
    p_starts_at: iso,
  });

  if (findError || !tables || tables.length === 0) {
    return { error: 'No tables available for this time slot' };
  }

  const table = tables[0];

  const { data, error } = await supabaseAdmin.rpc('create_pending_booking', {
    p_guest_name: guest_name,
    p_guest_phone: guest_phone,
    p_party_size: party_size,
    p_starts_at: iso,
    p_table_id: table.table_id,
    p_notes: notes || null,
  });

  if (error) {
    return { error: error.message };
  }

  return { booking: data };
}

export async function getBookingStatus(reference: string) {
  const { data, error } = await supabaseAdmin
    .from('bookings')
    .select('*')
    .eq('reference', reference)
    .single();

  if (error || !data) {
    return { error: 'Booking not found' };
  }

  return {
    reference: data.reference,
    status: data.status,
    guest_name: data.guest_name,
    party_size: data.party_size,
    starts_at: data.starts_at,
    table_id: data.table_id,
  };
}
