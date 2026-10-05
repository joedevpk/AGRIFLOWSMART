import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ORDER_WORKFLOW, ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from './constants';
import { paymentSummary } from './order-workflow';

describe('états de paiement (jamais « remboursé » sans confirmation du prestataire)', () => {
  it('commande annulée après paiement : à traiter → en cours → remboursé uniquement si completed', () => {
    expect(paymentSummary('mobile_money', 'paid', 'cancelled', null).label).toBe('Remboursement à traiter');
    expect(paymentSummary('mobile_money', 'paid', 'cancelled', 'requested').label).toBe('Remboursement à traiter');
    expect(paymentSummary('mobile_money', 'paid', 'cancelled', 'processing').label).toBe('Remboursement en cours');
    expect(paymentSummary('mobile_money', 'paid', 'cancelled', 'failed').label).toBe('Remboursement en échec');
    expect(paymentSummary('mobile_money', 'paid', 'cancelled', 'completed').label).toBe('Remboursé');
  });
  it('« Remboursé » n\'apparaît dans aucun autre cas (matrice complète)', () => {
    const orderStatuses = Object.keys(ORDER_STATUS_LABELS) as (keyof typeof ORDER_STATUS_LABELS)[];
    const paymentStatuses = Object.keys(PAYMENT_STATUS_LABELS) as (keyof typeof PAYMENT_STATUS_LABELS)[];
    for (const os of orderStatuses) for (const ps of paymentStatuses) for (const refund of [null, 'requested', 'processing', 'failed'] as const) {
      const label = paymentSummary('mobile_money', ps, os, refund).label;
      if (ps !== 'refunded') expect(label, `${ps}/${os}/${String(refund)}`).not.toBe('Remboursé');
    }
  });
  it('une commande payée et non annulée reste « payée »', () => {
    expect(paymentSummary('mobile_money', 'paid', 'confirmed', null).label).not.toMatch(/Rembours/);
  });
});

describe('machine à états : order.status et payment_status ne se mélangent pas', () => {
  it('le flux de commande ne contient aucun statut de paiement exclusif', () => {
    for (const exclusive of ['processing', 'paid', 'failed', 'expired', 'refunded', 'demo_paid']) expect(ORDER_WORKFLOW as string[]).not.toContain(exclusive);
  });

  /** Parcourt src/ (hors tests) à la recherche de comparaisons croisées. */
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name)) files.push(full);
    }
  };
  walk('src');

  it('aucun composant ne compare order.status à une valeur de paiement exclusive', () => {
    const bad = /\b(?:order|o)\.status\s*[!=]==?\s*'(processing|paid|failed|expired|refunded|demo_paid)'/;
    const offenders = files.filter((f) => bad.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
  it('aucun composant ne compare payment_status à une valeur de commande exclusive', () => {
    const bad = /payment_status\s*[!=]==?\s*'(confirmed|preparing|ready|in_delivery|delivered|completed)'/;
    const offenders = files.filter((f) => bad.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
  it('le frontend ne décide jamais de payment_status = paid (aucune écriture .update/.insert sur orders ou payments)', () => {
    const offenders = files.filter((f) => /from\('(orders|payments|refunds)'\)\s*\.(update|insert|upsert|delete)\(/.test(readFileSync(f, 'utf8').replace(/\s+/g, ' ')));
    expect(offenders).toEqual([]);
  });
});
