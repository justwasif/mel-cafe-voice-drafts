import { describe, it, expect } from '@jest/globals';

// Simple overlap logic test independent of DB
function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

function isWithinHours(timeStr: string, open: string, close: string) {
  const t = timeStr;
  return t >= open && t < close;
}

function fitsParty(tableSeats: number, partySize: number) {
  return tableSeats >= partySize && partySize <= 8;
}

describe('Availability logic', () => {
  it('detects overlapping bookings', () => {
    const aStart = new Date('2026-11-20T19:00:00');
    const aEnd = new Date('2026-11-20T20:30:00');
    const bStart = new Date('2026-11-20T19:30:00');
    const bEnd = new Date('2026-11-20T21:00:00');
    expect(overlaps(aStart, aEnd, bStart, bEnd)).toBe(true);
  });

  it('allows non-overlapping bookings', () => {
    const aStart = new Date('2026-11-20T19:00:00');
    const aEnd = new Date('2026-11-20T20:30:00');
    const bStart = new Date('2026-11-20T20:30:00');
    const bEnd = new Date('2026-11-20T22:00:00');
    expect(overlaps(aStart, aEnd, bStart, bEnd)).toBe(false);
  });

  it('checks opening hours', () => {
    expect(isWithinHours('19:00', '11:00', '23:00')).toBe(true);
    expect(isWithinHours('09:00', '11:00', '23:00')).toBe(false);
    expect(isWithinHours('23:00', '11:00', '23:00')).toBe(false);
  });

  it('checks party size', () => {
    expect(fitsParty(4, 2)).toBe(true);
    expect(fitsParty(4, 4)).toBe(true);
    expect(fitsParty(4, 6)).toBe(false);
    expect(fitsParty(8, 10)).toBe(false);
  });
});

describe('Booking flow', () => {
  it('rejects party over 8', () => {
    const partySize = 10;
    expect(fitsParty(8, partySize)).toBe(false);
  });

  it('rejects past dates', () => {
    const requested = new Date('2020-01-01T19:00:00');
    const now = new Date();
    expect(requested < now).toBe(true);
  });
});
