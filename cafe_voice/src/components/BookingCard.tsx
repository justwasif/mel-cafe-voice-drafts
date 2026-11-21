'use client';

import { useEffect, useState, useRef } from 'react';
import { Booking } from '@/types';
import { formatDate, formatTime } from '@/lib/utils';

export function BookingCard({ booking }: { booking: Booking }) {
  const [status, setStatus] = useState(booking.status);
  const statusRef = useRef(booking.status);

  // Poll the server every 2 seconds for the booking status.
  // Uses a ref to avoid stale closures, and stops once a decision is made.
  useEffect(() => {
    if (status !== 'pending') return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/booking-status?reference=${encodeURIComponent(booking.reference)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status && data.status !== statusRef.current) {
            statusRef.current = data.status;
            setStatus(data.status);
          }
        }
      } catch {
        // ignore network errors — will retry next interval
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [booking.reference, status]);

  return (
    <div className="rounded-xl border border-emerald-900/20 bg-emerald-950/40 p-5 text-amber-50 shadow-lg">
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-lg">Your Reservation</h3>
        <span
          data-testid="booking-status"
          className={`rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide ${
            status === 'pending'
              ? 'bg-amber-600/20 text-amber-300 animate-pulse'
              : status === 'approved'
              ? 'bg-emerald-600/20 text-emerald-300'
              : 'bg-red-600/20 text-red-300'
          }`}
        >
          {status}
        </span>
      </div>
      <p className="mt-1 text-2xl font-bold tracking-tight text-amber-100">{booking.reference}</p>
      <div className="mt-3 space-y-1 text-sm text-amber-100/80">
        <p>
          <span className="text-amber-100/50">Name:</span> {booking.guest_name}
        </p>
        <p>
          <span className="text-amber-100/50">Party:</span> {booking.party_size}
        </p>
        <p>
          <span className="text-amber-100/50">When:</span> {formatDate(booking.starts_at)} at {formatTime(booking.starts_at)}
        </p>
        {booking.notes && (
          <p>
            <span className="text-amber-100/50">Notes:</span> {booking.notes}
          </p>
        )}
      </div>
    </div>
  );
}
