import { checkRefundEligibility, checkDiscountCap, formatOrderReply, buildApprovalReference } from '@/lib/logic';

describe('refund eligibility', () => {
  it('approves a paid order within 30 days with no refunds', () => {
    const order = {
      displayFinancialStatus: 'PAID',
      createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      refunds: [],
      customer: { email: 'alice@example.com' },
    };
    expect(checkRefundEligibility(order as any, 'alice@example.com').eligible).toBe(true);
  });

  it('refuses an order older than 30 days', () => {
    const order = {
      displayFinancialStatus: 'PAID',
      createdAt: new Date(Date.now() - 40 * 86400000).toISOString(),
      refunds: [],
      customer: { email: 'alice@example.com' },
    };
    const result = checkRefundEligibility(order as any, 'alice@example.com');
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/30-day/);
  });

  it('refuses an already-refunded order', () => {
    const order = {
      displayFinancialStatus: 'PAID',
      createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      refunds: [{ id: 'r1' }],
      customer: { email: 'alice@example.com' },
    };
    const result = checkRefundEligibility(order as any, 'alice@example.com');
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/already/);
  });

  it('refuses an order with wrong email', () => {
    const order = {
      displayFinancialStatus: 'PAID',
      createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      refunds: [],
      customer: { email: 'alice@example.com' },
    };
    const result = checkRefundEligibility(order as any, 'eve@example.com');
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/found/);
  });
});

describe('discount cap', () => {
  it('allows 10%', () => {
    expect(checkDiscountCap(10).ok).toBe(true);
  });
  it('blocks more than 15%', () => {
    const result = checkDiscountCap(20);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/15%/);
  });
});

describe('order reply formatting', () => {
  it('hides details when email does not match', () => {
    const reply = formatOrderReply(null, false);
    expect(reply).toMatch(/couldn't find that order/i);
  });

  it('shows tracking when fulfilled', () => {
    const order = {
      name: '#1002',
      createdAt: new Date().toISOString(),
      financialStatus: 'PAID',
      fulfillmentStatus: 'FULFILLED',
      total: '149.00 USD',
      items: [{ title: 'Trail Blazer', variant: 'M', quantity: 1 }],
      fulfillments: [{ tracking: 'TRK123456', carrier: 'FakeCarrier' }],
      refunds: [],
    };
    const reply = formatOrderReply(order, true);
    expect(reply).toContain('#1002');
    expect(reply).toContain('TRK123456');
  });
});

describe('approval reference', () => {
  it('starts with AR- and has 6 chars', () => {
    const ref = buildApprovalReference();
    expect(ref).toMatch(/^AR-[A-Z0-9]{6}$/);
  });
});
