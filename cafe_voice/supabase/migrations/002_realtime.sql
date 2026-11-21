-- Migration 002: Add bookings table to the supabase_realtime publication
-- so guests and hosts get live updates through Supabase Realtime.

ALTER PUBLICATION supabase_realtime ADD TABLE bookings;
