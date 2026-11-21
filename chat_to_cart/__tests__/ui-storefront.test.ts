import { describe, it, expect } from 'vitest';
import {
  formatMoney,
  priceNumber,
  stockLabel,
  picksLabel,
  searchResultTitles,
  searchResultProducts,
  getProductResult,
  toCart,
  sizeInCart,
  parseCheckoutChanges,
} from '../app/storefront-client';

describe('UI helpers', () => {
  it('formatMoney formats USD with two decimals', () => {
    expect(formatMoney(149)).toBe('$149.00');
    expect(formatMoney('14')).toBe('$14.00');
    expect(formatMoney(0)).toBe('$0.00');
  });

  it('formatMoney accepts a custom currency', () => {
    expect(formatMoney(149, 'EUR')).toBe('€149.00');
  });

  it('formatMoney returns en-dash for invalid input', () => {
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney('abc')).toBe('—');
  });

  it('priceNumber coerces strings and numbers', () => {
    expect(priceNumber('149')).toBe(149);
    expect(priceNumber(14)).toBe(14);
    expect(priceNumber(undefined)).toBe(0);
  });

  it('stockLabel returns status colours', () => {
    expect(stockLabel(10)).toMatchObject({ text: 'In stock' });
    expect(stockLabel(5)).toMatchObject({ text: 'Low stock · 5 left' });
    expect(stockLabel(0)).toMatchObject({ text: 'Out of stock' });
  });

  it('picksLabel pluralises correctly', () => {
    expect(picksLabel(1)).toBe('Showing 1 pick from your assistant');
    expect(picksLabel(4)).toBe('Showing 4 picks from your assistant');
  });

  it('searchResultProducts returns products from the assistant tool result', () => {
    const result = { ok: true, products: [{ id: '1', title: 'Field Jacket' }] };
    expect(searchResultProducts(result)).toHaveLength(1);
    expect(searchResultProducts(null)).toEqual([]);
  });

  it('searchResultTitles extracts titles', () => {
    const result = { ok: true, products: [{ title: 'Field Jacket' }, { title: 'Base Layer Tee' }] };
    expect(searchResultTitles(result)).toEqual(['Field Jacket', 'Base Layer Tee']);
  });

  it('getProductResult returns the product from a get_product result', () => {
    const product = { id: '1', title: 'Rain Shell' };
    expect(getProductResult({ ok: true, product })).toEqual(product);
    expect(getProductResult({ ok: false })).toBeNull();
  });

  it('toCart normalises a nested CartView result', () => {
    const raw = {
      ok: true,
      cart: {
        id: 'cart-1',
        itemCount: 2,
        total: 163,
        currency: 'USD',
        lines: [
          { id: 'line-1', productTitle: 'Field Jacket', size: 'M', quantity: 1, unitPrice: 149, image: null },
          { id: 'line-2', productTitle: 'Base Layer Tee', size: 'M', quantity: 1, unitPrice: 14, image: null },
        ],
      },
    };
    const cart = toCart(raw);
    expect(cart?.id).toBe('cart-1');
    expect(cart?.total).toBe(163);
    expect(cart?.lines).toHaveLength(2);
    expect(cart?.lines[0].productTitle).toBe('Field Jacket');
  });

  it('toCart normalises a flat view_cart result', () => {
    const raw = {
      ok: true,
      id: 'cart-1',
      itemCount: 1,
      total: 149,
      currency: 'USD',
      lines: [{ id: 'line-1', productTitle: 'Field Jacket', size: 'M', quantity: 1, unitPrice: 149, image: null }],
    };
    const cart = toCart(raw);
    expect(cart?.lines[0].unitPrice).toBe(149);
  });

  it('sizeInCart matches a line by title and size', () => {
    const cart = toCart({
      id: 'cart-1',
      lines: [{ id: 'line-1', productTitle: 'Field Jacket', size: 'M', quantity: 1, unitPrice: 129, image: null }],
    });
    expect(sizeInCart(cart, 'Field Jacket', 'M')).toBe(true);
    expect(sizeInCart(cart, 'Field Jacket', 'L')).toBe(false);
    expect(sizeInCart(cart, 'Base Layer Tee', 'M')).toBe(false);
    expect(sizeInCart(null, 'Field Jacket', 'M')).toBe(false);
  });

  it('toCart returns null for malformed data', () => {
    expect(toCart(null)).toBeNull();
    expect(toCart({ ok: true })).toBeNull();
  });

  it('parseCheckoutChanges reads priceChanges and stockIssues', () => {
    const payload = {
      priceChanges: [{ title: 'Field Jacket', size: 'M', oldPrice: 149, newPrice: 159 }],
      stockIssues: [{ title: 'Base Layer Tee', requested: 5, available: 2 }],
      removedLines: [{ title: 'Wool Beanie' }],
    };
    const changes = parseCheckoutChanges(payload);
    expect(changes).toHaveLength(3);
    expect(changes[0].newPrice).toBe(159);
    expect(changes[1].newStock).toBe(2);
    expect(changes[2].outOfStock).toBe(true);
  });

  it('parseCheckoutChanges reads snake_case legacy responses', () => {
    const payload = {
      changes: [{ title: 'Field Jacket', old_price: 149, new_price: 159, new_stock: 0 }],
    };
    const changes = parseCheckoutChanges(payload);
    expect(changes[0].newPrice).toBe(159);
    expect(changes[0].outOfStock).toBe(true);
  });

  it('parseCheckoutChanges returns empty when nothing changed', () => {
    expect(parseCheckoutChanges({})).toEqual([]);
  });
});
