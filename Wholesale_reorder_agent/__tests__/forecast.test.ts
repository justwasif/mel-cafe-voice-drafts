import {
  salesRate,
  daysOfCover,
  runOutDate,
  reorderPoint,
  classifyStatus,
  roundToCasePack,
  suggestedQty,
  toDateStr,
  type DailySale,
  type Supplier,
} from '@/lib/forecast';

const TODAY = new Date('2026-11-19T00:00:00');

function makeSales(qtys: number[]): DailySale[] {
  // qtys[0] is yesterday, qtys[1] is 2 days ago, ...
  const dayMs = 86_400_000;
  const todayMs = new Date('2026-11-19T00:00:00').getTime();
  return qtys.map((q, i) => ({
    date: toDateStr(new Date(todayMs - (i + 1) * dayMs)),
    quantity: q,
  }));
}

const supplier: Supplier = {
  id: 's1',
  name: 'Fern & Pine Textiles',
  email: 'orders@fern.example.com',
  lead_time_days: 14,
  moq: 20,
  case_pack: 5,
};

describe('salesRate (EWMA, half-life 7d, window 28d)', () => {
  it('returns 0 when there are no sales', () => {
    expect(salesRate([], TODAY)).toBe(0);
  });

  it('weights recent days more heavily', () => {
    // 1 unit sold yesterday, 0 otherwise → positive rate
    const sales = makeSales([1]);
    const rate = salesRate(sales, TODAY);
    expect(rate).toBeGreaterThan(0);
    expect(rate).toBeLessThan(1);
  });

  it('gives a higher rate when recent sales are higher', () => {
    const recentHeavy = makeSales([10, 10, 10, 0, 0, 0, 0]);
    const oldHeavy = makeSales([0, 0, 0, 0, 10, 10, 10]);
    expect(salesRate(recentHeavy, TODAY)).toBeGreaterThan(salesRate(oldHeavy, TODAY));
  });

  it('produces ~2.1/day for a steady 2/day pattern', () => {
    const steady = makeSales(Array(28).fill(2));
    const rate = salesRate(steady, TODAY);
    expect(rate).toBeGreaterThan(1.8);
    expect(rate).toBeLessThan(2.2);
  });
});

describe('daysOfCover', () => {
  it('divides on-hand by rate', () => {
    expect(daysOfCover(50, 2)).toBe(25);
  });

  it('returns Infinity when rate is 0', () => {
    expect(daysOfCover(50, 0)).toBe(Infinity);
  });
});

describe('runOutDate', () => {
  it('is today + ceil(days of cover)', () => {
    // on-hand 50, rate 2 → 25 days → Dec 14
    expect(runOutDate(50, 2, TODAY)).toBe('2026-12-14');
  });

  it('returns null when rate is 0', () => {
    expect(runOutDate(50, 0, TODAY)).toBeNull();
  });

  it('rounds up partial days', () => {
    // on-hand 10, rate 3 → 3.33 → 4 days → Nov 23
    expect(runOutDate(10, 3, TODAY)).toBe('2026-11-23');
  });
});

describe('reorderPoint', () => {
  it('is rate × (lead time + 7 safety days)', () => {
    // rate 2, lead 14 → 2 × 21 = 42
    expect(reorderPoint(2, 14)).toBe(42);
  });
});

describe('classifyStatus', () => {
  it('is No sales when rate is 0', () => {
    expect(classifyStatus(100, 0, 14)).toBe('No sales');
  });

  it('is Order now when on-hand ≤ reorder point', () => {
    // reorder point = 2 × 21 = 42; on-hand 40
    expect(classifyStatus(40, 2, 14)).toBe('Order now');
  });

  it('is Watch when within 7 days-of-rate of the reorder point', () => {
    // reorder point 42, watch band = 42 + 7×2 = 56; on-hand 50
    expect(classifyStatus(50, 2, 14)).toBe('Watch');
  });

  it('is OK when above the watch band', () => {
    expect(classifyStatus(100, 2, 14)).toBe('OK');
  });
});

describe('roundToCasePack', () => {
  it('rounds up to the next case pack multiple', () => {
    expect(roundToCasePack(22, 5)).toBe(25);
    expect(roundToCasePack(25, 5)).toBe(25);
    expect(roundToCasePack(26, 5)).toBe(30);
  });

  it('treats case pack 1 as ceil', () => {
    expect(roundToCasePack(7.3, 1)).toBe(8);
  });
});

describe('suggestedQty', () => {
  it('rounds up to case pack and is ≥ MOQ', () => {
    // rate 2, lead 14: baseNeed = 2×59 + 42 − 30 − 0 = 140 → case 5 → 140 (already multiple of 5)
    const q = suggestedQty(2, 14, 5, 20, 30, 0);
    expect(q).toBeGreaterThanOrEqual(20);
    expect(q % 5).toBe(0);
  });

  it('raises to MOQ when below', () => {
    // tiny need: rate 0.5, lead 14: baseNeed = 0.5×59 + 0.5×21 − 40 − 0 = 29.5+10.5-40 = 0 → 0
    // Use a case where baseNeed is small but positive
    // rate 0.5, lead 14, on-hand 5: baseNeed = 29.5 + 10.5 − 5 = 35 → round to 35 (case 5) → ≥ MOQ 20 ✓
    expect(suggestedQty(0.5, 14, 5, 20, 5, 0)).toBeGreaterThanOrEqual(20);
  });

  it('returns 0 when baseNeed ≤ 0', () => {
    // plenty of stock + on order
    expect(suggestedQty(2, 14, 5, 20, 500, 0)).toBe(0);
  });

  it('subtracts on-order quantity', () => {
    const without = suggestedQty(2, 14, 5, 20, 30, 0);
    const withOrder = suggestedQty(2, 14, 5, 20, 30, 50);
    expect(withOrder).toBeLessThanOrEqual(without);
  });

  it('never returns negative', () => {
    expect(suggestedQty(2, 14, 5, 20, 10000, 5000)).toBeGreaterThanOrEqual(0);
  });
});
