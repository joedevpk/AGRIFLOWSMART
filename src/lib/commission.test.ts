import { describe, expect, it } from 'vitest';
import {
  bpsToPercentLabel, commissionMinor, commissionReversedOnRefund, computeCommission, explainCommission,
  percentToBps, splitOrderAmounts, toMinor,
} from '@/lib/commission';

// Mêmes vecteurs que supabase/tests/50_commission_engine.sql (V0) : parité TS ↔ SQL.
const VECTORS: [string, number, number][] = [
  ['100', 500, 5.0], ['0', 500, 0], ['0.01', 10000, 0.01], ['99999999.99', 10000, 99999999.99],
  ['33.33', 333, 1.11], ['0.05', 1000, 0.01], ['0.04', 1250, 0.01], ['99.99', 750, 7.5], ['100', 0, 0],
];

describe('calcul de la commission', () => {
  it.each(VECTORS)('assiette %s × %i pb = %d', (base, bps, expected) => {
    expect(computeCommission(base, bps)).toBe(expected);
  });

  it('arrondit demi vers le haut sans erreur flottante (0,005 → 0,01)', () => {
    expect(commissionMinor(5n, 1000)).toBe(1n);
    expect(commissionMinor(4n, 1250)).toBe(1n);
    expect(commissionMinor(4n, 1249)).toBe(0n); // 0,00499… → 0,00
  });

  it('convertit un résultat flottant piégeux (0,55 × 500) sans dérive', () => {
    expect(toMinor(0.55 * 500)).toBe(27500n);
  });

  it('rejette montants et taux invalides', () => {
    expect(() => toMinor(-1)).toThrow(RangeError);
    expect(() => toMinor('1.234')).toThrow(RangeError);
    expect(() => toMinor(Number.NaN)).toThrow(RangeError);
    expect(() => commissionMinor(100n, 10001)).toThrow(RangeError);
    expect(() => commissionMinor(100n, -1)).toThrow(RangeError);
    expect(() => commissionMinor(100n, 7.5)).toThrow(RangeError);
    expect(() => commissionMinor(-1n, 500)).toThrow(RangeError);
  });

  it('gère les montants limites (100 % et très grand montant)', () => {
    expect(computeCommission('0.01', 10000)).toBe(0.01);
    expect(computeCommission('99999999.99', 10000)).toBe(99999999.99);
  });
});

describe('séparation commission / livraison / frais de paiement', () => {
  it('assiette = produits ; la livraison n\'entre ni dans la commission ni dans le net', () => {
    const a = splitOrderAmounts({ itemsSubtotal: 100, deliveryFee: 10, rateBps: 750 });
    expect(a).toEqual({ itemsSubtotal: 100, deliveryFee: 10, buyerTotal: 110, platformCommission: 7.5, producerNet: 92.5 });
  });

  it('le total acheteur ne contient pas la commission', () => {
    const a = splitOrderAmounts({ itemsSubtotal: '99.99', rateBps: 750 });
    expect(a.buyerTotal).toBe(99.99);
    expect(a.platformCommission).toBe(7.5);
    expect(a.producerNet).toBe(92.49);
  });

  it('sans taux validé : aucune commission ni net inventés', () => {
    const a = splitOrderAmounts({ itemsSubtotal: 100, deliveryFee: 5, rateBps: null });
    expect(a.platformCommission).toBeNull();
    expect(a.producerNet).toBeNull();
    expect(a.buyerTotal).toBe(105);
  });

  it('changer le taux ne modifie pas un calcul déjà figé (fonction pure)', () => {
    const figé = splitOrderAmounts({ itemsSubtotal: 99.99, rateBps: 750 });
    splitOrderAmounts({ itemsSubtotal: 99.99, rateBps: 1000 });
    expect(figé.platformCommission).toBe(7.5);
  });
});

describe('remboursements', () => {
  const base = { commission: 10, base: 100 };
  it('politique proportionnelle : partiel puis total', () => {
    expect(commissionReversedOnRefund({ ...base, refunded: 40, policy: 'proportional' })).toBe(4);
    expect(commissionReversedOnRefund({ ...base, refunded: 100, policy: 'proportional' })).toBe(10);
  });
  it('politique « garder la commission » : rien n\'est annulé', () => {
    expect(commissionReversedOnRefund({ ...base, refunded: 100, policy: 'keep_all' })).toBe(0);
  });
  it('politique non décidée : null (à arbitrer, jamais deviné)', () => {
    expect(commissionReversedOnRefund({ ...base, refunded: 50, policy: null })).toBeNull();
  });
  it('un remboursement supérieur aux produits ne dépasse pas la commission', () => {
    expect(commissionReversedOnRefund({ ...base, refunded: 150, policy: 'proportional' })).toBe(10);
  });
});

describe('saisie administrateur', () => {
  it('convertit un pourcentage en points de base exacts', () => {
    expect(percentToBps('7,5')).toBe(750);
    expect(percentToBps('7.5')).toBe(750);
    expect(percentToBps('0')).toBe(0);
    expect(percentToBps('100')).toBe(10000);
    expect(percentToBps('0.01')).toBe(1);
    expect(percentToBps(' 12,34 ')).toBe(1234);
  });
  it('refuse les saisies invalides', () => {
    for (const bad of ['', 'abc', '-1', '100.01', '101', '7,555', '1e2']) expect(() => percentToBps(bad)).toThrow(RangeError);
  });
  it('affiche un taux lisible', () => {
    expect(bpsToPercentLabel(750)).toBe('7,5 %');
    expect(bpsToPercentLabel(500)).toBe('5 %');
    expect(bpsToPercentLabel(1)).toBe('0,01 %');
    expect(bpsToPercentLabel(1234)).toBe('12,34 %');
  });
});

describe('explication du calcul', () => {
  it('commande sans règle : le dit clairement', () => {
    expect(explainCommission({ status: 'not_configured', rateBps: null, base: 100, commission: 0, currency: 'USD' })).toMatch(/Aucune règle/);
  });
  it('commande calculée : détaille la formule', () => {
    expect(explainCommission({ status: 'computed', rateBps: 750, base: 99.99, commission: 7.5, currency: 'USD', ruleId: 'abcdef12-0000' })).toMatch(/99.99 USD × 7,5 % = 7.5 USD/);
  });
});
