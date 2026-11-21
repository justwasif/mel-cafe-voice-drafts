/**
 * @jest-environment jsdom
 */
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react';

// Mock fetch before importing the component
const fetchMock = jest.fn();
(global as any).fetch = fetchMock;
(global as any).IS_REACT_ACT_ENVIRONMENT = true;

import { BookingCard } from '@/components/BookingCard';

const baseBooking = {
  id: 'LT-TEST01',
  reference: 'LT-TEST01',
  guest_name: 'TestGuest',
  guest_phone: '',
  party_size: 4,
  starts_at: '2026-11-21T00:00:00+00:00',
  ends_at: '2026-11-21T01:30:00+00:00',
  table_id: 'T3 · Patio',
  status: 'pending' as const,
  notes: null,
  source: 'voice',
  created_at: new Date().toISOString(),
  decided_at: null,
  decision_note: null,
};

function getBadgeText(): string {
  const el = document.querySelector('[data-testid="booking-status"]');
  return el ? el.textContent || '' : '(no badge)';
}

describe('BookingCard live status', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    jest.useFakeTimers();
    fetchMock.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.useRealTimers();
  });

  it('flips from PENDING to APPROVED within 3 seconds after the server reports approval', async () => {
    // First poll returns pending, second returns approved
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'pending' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'approved' }) });

    act(() => {
      root.render(React.createElement(BookingCard, { booking: baseBooking }));
    });

    expect(getBadgeText()).toBe('pending');

    // t=2s: first poll (pending) — badge stays pending
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(getBadgeText()).toBe('pending');

    // t=4s: second poll returns approved — badge must flip
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(getBadgeText()).toBe('approved');

    // Polling stops after decision: no further fetches
    const callCount = fetchMock.mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(6000);
    });
    expect(fetchMock.mock.calls.length).toBe(callCount);
  }, 15000);

  it('flips within 2 seconds (single poll) when approval already happened', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status: 'approved' }) });

    act(() => {
      root.render(React.createElement(BookingCard, { booking: baseBooking }));
    });
    expect(getBadgeText()).toBe('pending');

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(getBadgeText()).toBe('approved');
  }, 15000);
});
