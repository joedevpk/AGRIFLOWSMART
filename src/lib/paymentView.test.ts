import { describe, expect, it } from 'vitest';
import { ERROR_AFTER_FAILED_CHECKS, TERMINAL_STATUSES, viewStateFor, type PaymentStatusValue } from '@/lib/paymentView';

const v = (status: PaymentStatusValue | null, extra: Partial<{ notFound: boolean; failedChecks: number }> = {}) =>
  viewStateFor({ status, notFound: false, failedChecks: 0, ...extra });

describe('états de la page de retour de paiement', () => {
  it('paiement confirmé : uniquement le statut « paid » issu de la base', () => {
    expect(v('paid')).toBe('success');
    for (const s of ['pending', 'processing', 'failed', 'cancelled', 'expired', 'refunded', 'demo_paid'] as const) expect(v(s)).not.toBe('success');
    expect(v(null)).not.toBe('success');
  });
  it('un paiement de démonstration n\'est jamais présenté comme confirmé', () => {
    expect(v('demo_paid')).toBe('demo');
  });
  it('en attente de vérification : pending / processing, ou aucun statut encore connu', () => {
    expect(v('pending')).toBe('pending');
    expect(v('processing')).toBe('pending');
    expect(v(null)).toBe('checking');
  });
  it('refusé ou échoué, annulé, remboursé', () => {
    expect(v('failed')).toBe('failed');
    expect(v('expired')).toBe('failed');
    expect(v('cancelled')).toBe('cancelled');
    expect(v('refunded')).toBe('refunded');
  });
  it('erreur technique temporaire : serveur injoignable de façon répétée — distincte de l\'attente et de l\'échec', () => {
    expect(v(null, { failedChecks: ERROR_AFTER_FAILED_CHECKS - 1 })).toBe('checking');
    expect(v(null, { failedChecks: ERROR_AFTER_FAILED_CHECKS })).toBe('error');
    expect(v('pending', { failedChecks: ERROR_AFTER_FAILED_CHECKS })).toBe('error');
    expect(v('processing', { failedChecks: 5 })).toBe('error');
  });
  it('un statut terminal connu prime sur une erreur réseau ultérieure', () => {
    expect(v('paid', { failedChecks: 9 })).toBe('success');
    expect(v('failed', { failedChecks: 9 })).toBe('failed');
    expect(v('cancelled', { failedChecks: 9 })).toBe('cancelled');
  });
  it('référence introuvable', () => {
    expect(v(null, { notFound: true })).toBe('not_found');
    expect(v('paid', { notFound: true })).toBe('not_found');
  });
  it('statuts terminaux : arrêt de la vérification', () => {
    expect([...TERMINAL_STATUSES].sort()).toEqual(['cancelled', 'demo_paid', 'expired', 'failed', 'paid', 'refunded']);
  });
});
