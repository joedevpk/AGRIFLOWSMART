import { describe, expect, it } from 'vitest';
import { buildCartItems, clampQuantity, computeTotals, isValidQuantity, issueFor, lineSubtotal, MAX_LINE_QUANTITY, mergeStoredItems, normalizeStoredCart, round2 } from './cart';
import type { LiveProduct, StoredCartItem } from '@/types';

const ID = '11111111-1111-4111-8111-111111111111';
const PRODUCER = '22222222-2222-4222-8222-222222222222';
const snapshot = { name: 'Maïs', image: null, unit: 'kg', unit_price: 1, currency: 'USD', producer_id: PRODUCER, producer_name: 'Prod' };
const stored = (quantity: number): StoredCartItem => ({ product_id: ID, quantity, added_at: '2026-10-02T10:00:00Z', snapshot });
const live = (over: Partial<LiveProduct> = {}): LiveProduct => ({ id: ID, user_id: PRODUCER, name: 'Maïs', image: null, unit: 'kg', price: 1, currency: 'USD', quantity: 100, status: 'available', availability_date: null, producer_name: 'Prod', ...over });

describe('calcul de prix', () => {
  it('arrondi monétaire à 2 décimales', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.005)).toBe(1.01);
    expect(lineSubtotal(0.5, 200)).toBe(100);
    expect(lineSubtotal(1.99, 3)).toBe(5.97);
  });
  it('quantités : bornes et valeurs invalides', () => {
    expect(clampQuantity(NaN, 10)).toBe(1);
    expect(clampQuantity(-5, 10)).toBe(1);
    expect(clampQuantity(0, 10)).toBe(1);
    expect(clampQuantity(999, 10)).toBe(10);
    expect(clampQuantity(5.9, 10)).toBe(5);
    expect(clampQuantity(3, 0)).toBe(1);
    expect(isValidQuantity(2)).toBe(true);
    for (const bad of [0, -1, 1.5, '3', null, NaN, MAX_LINE_QUANTITY + 1]) expect(isValidQuantity(bad)).toBe(false);
  });
});

describe('validation du panier', () => {
  it('chaque anomalie est détectée', () => {
    expect(issueFor(stored(5), undefined, null)).toBeNull();                       // pas encore vérifié
    expect(issueFor(stored(5), null, null)).toBe('removed');
    expect(issueFor(stored(5), live({ user_id: 'moi' }), 'moi')).toBe('own_product');
    expect(issueFor(stored(5), live({ status: 'sold_out' }), null)).toBe('unavailable');
    expect(issueFor(stored(5), live({ price: 0 }), null)).toBe('price_missing');
    expect(issueFor(stored(5), live({ quantity: 4 }), null)).toBe('insufficient_stock');
    expect(issueFor(stored(5), live(), null)).toBeNull();
  });
  it('les lignes en anomalie sont exclues du total et bloquent la commande', () => {
    const items = buildCartItems([stored(5)], { [ID]: live({ quantity: 2 }) }, null);
    const totals = computeTotals(items);
    expect(totals.subtotal).toBe(0);
    expect(totals.hasBlockingIssue).toBe(true);
  });
  it('total valide, prix serveur prioritaire sur l\'instantané, devises mélangées bloquantes', () => {
    const ok = computeTotals(buildCartItems([stored(10)], { [ID]: live({ price: 2 }) }, null));
    expect(ok.subtotal).toBe(20);
    expect(ok.hasBlockingIssue).toBe(false);
    expect(ok.deliveryFee).toBeNull(); // jamais de frais de livraison inventés
    const ID2 = '33333333-3333-4333-8333-333333333333';
    const mixed = computeTotals(buildCartItems([stored(1), { ...stored(1), product_id: ID2 }], { [ID]: live(), [ID2]: live({ currency: 'CDF' }) }, null));
    expect(mixed.mixedCurrencies).toBe(true);
    expect(mixed.hasBlockingIssue).toBe(true);
  });
  it('le stockage local n\'est jamais cru aveuglément', () => {
    expect(normalizeStoredCart('pas un tableau')).toEqual([]);
    expect(normalizeStoredCart([{ product_id: 'pas-un-uuid', quantity: 2 }])).toEqual([]);
    expect(normalizeStoredCart([{ product_id: ID, quantity: -3, added_at: 'x', snapshot }])).toEqual([]);
    const merged = mergeStoredItems([stored(2)], [stored(3)]);
    expect(merged).toHaveLength(1);
  });
});
