import { describe, expect, it } from 'vitest';
import { confirmationState, formatDeadline, formatRemaining, isProducerAccepting, matchesQueueFilter, needsProducerAttention, presenceLabel, unavailableUntil } from './order-confirmation';
import { translate } from './i18n/translations';

const t = (k: string, p?: Record<string, string | number>) => translate('fr', k, p);
const NOW = Date.parse('2026-10-02T12:00:00Z');
const base = { payment_method: 'cash_on_delivery', payment_status: 'pending', cancel_reason: null } as const;

describe('confirmationState (confirmation du producteur)', () => {
  it('paiement à la livraison avec échéance : le producteur doit confirmer', () => {
    const s = confirmationState({ ...base, status: 'pending', confirmation_deadline: '2026-10-02T18:00:00Z' }, NOW);
    expect(s.kind).toBe('awaiting_producer');
    expect(s.msRemaining).toBe(6 * 3600_000);
  });
  it('urgence : ok / soon / overdue calculées depuis l\'échéance réelle', () => {
    const u = (iso: string) => confirmationState({ ...base, status: 'pending', confirmation_deadline: iso }, NOW).urgency;
    expect(u('2026-10-03T12:00:00Z')).toBe('ok');
    expect(u('2026-10-02T15:00:00Z')).toBe('soon');
    expect(u('2026-10-02T11:00:00Z')).toBe('overdue');
  });
  it('Mobile Money impayé : pas d\'échéance, donc AUCUN faux compte à rebours', () => {
    const s = confirmationState({ payment_method: 'mobile_money', payment_status: 'pending', cancel_reason: null, status: 'pending', confirmation_deadline: null }, NOW);
    expect(s).toEqual({ kind: 'awaiting_payment', deadline: null, msRemaining: null, urgency: null });
  });
  it('commande expirée / refusée / annulée par l\'acheteur / confirmée', () => {
    const c = (status: 'cancelled' | 'confirmed', reason: 'confirmation_expired' | 'producer_rejected' | 'buyer_cancelled' | null) =>
      confirmationState({ ...base, status, cancel_reason: reason, confirmation_deadline: null }, NOW).kind;
    expect(c('cancelled', 'confirmation_expired')).toBe('expired');
    expect(c('cancelled', 'producer_rejected')).toBe('rejected');
    expect(c('cancelled', 'buyer_cancelled')).toBe('none');
    expect(c('confirmed', null)).toBe('none');
  });
  it('needsProducerAttention exclut les commandes impayées en ligne', () => {
    expect(needsProducerAttention({ ...base, status: 'pending', confirmation_deadline: '2026-10-02T18:00:00Z' })).toBe(true);
    expect(needsProducerAttention({ payment_method: 'card', payment_status: 'pending', cancel_reason: null, status: 'pending', confirmation_deadline: null })).toBe(false);
  });
});

describe('disponibilité du producteur (≠ stock du produit)', () => {
  it('donnée absente : on ne prétend rien (disponible par défaut)', () => {
    expect(isProducerAccepting(undefined, NOW)).toBe(true);
    expect(isProducerAccepting({ is_available_for_orders: undefined as unknown as boolean, availability_until: null }, NOW)).toBe(true);
  });
  it('indisponible avec ou sans date de retour', () => {
    expect(isProducerAccepting({ is_available_for_orders: false, availability_until: null }, NOW)).toBe(false);
    expect(isProducerAccepting({ is_available_for_orders: false, availability_until: '2026-10-03T00:00:00Z' }, NOW)).toBe(false);
    expect(unavailableUntil({ is_available_for_orders: false, availability_until: '2026-10-03T00:00:00Z' }, NOW)).toBe('2026-10-03T00:00:00Z');
  });
  it('date de retour dépassée : de nouveau disponible (miroir de producer_accepting en SQL)', () => {
    expect(isProducerAccepting({ is_available_for_orders: false, availability_until: '2026-10-01T00:00:00Z' }, NOW)).toBe(true);
    expect(unavailableUntil({ is_available_for_orders: false, availability_until: '2026-10-01T00:00:00Z' }, NOW)).toBeNull();
  });
});

describe('formats de temps', () => {
  it('temps restant', () => {
    expect(formatRemaining(5 * 3600e3 + 12 * 60e3, t)).toBe('5 h 12 min');
    expect(formatRemaining(14 * 60e3, t)).toBe('14 min');
    expect(formatRemaining(30e3, t)).toBe("moins d'une minute");
    expect(formatRemaining(51 * 3600e3, t)).toBe('2 j 3 h');
    expect(formatRemaining(-5000, t)).toBe("moins d'une minute");
  });
  it('dernière activité : jamais inventée', () => {
    expect(presenceLabel(null, t, NOW)).toBeNull();
    expect(presenceLabel(undefined, t, NOW)).toBeNull();
    expect(presenceLabel('pas une date', t, NOW)).toBeNull();
    expect(presenceLabel('2026-10-02T10:00:00Z', t, NOW)).toBe('Actif il y a 2 h');
    expect(presenceLabel('2026-09-29T12:00:00Z', t, NOW)).toBe('Actif il y a 3 jours');
  });
  it('échéance affichée à l\'heure de Kinshasa (UTC+1)', () => {
    expect(formatDeadline('2026-09-30T17:00:00Z', 'fr')).toContain('18:00');
  });
});

describe('filtres de la vue admin « en attente de confirmation »', () => {
  const o = (over: Partial<Parameters<typeof matchesQueueFilter>[0]>) => ({ status: 'pending' as const, confirmation_deadline: '2026-10-02T14:00:00Z', cancel_reason: null, confirmed_at: null, ...over });
  it('pending / soon / expired / confirmed', () => {
    expect(matchesQueueFilter(o({}), 'pending', NOW)).toBe(true);
    expect(matchesQueueFilter(o({}), 'soon', NOW)).toBe(true);
    expect(matchesQueueFilter(o({ confirmation_deadline: '2026-10-04T14:00:00Z' }), 'soon', NOW)).toBe(false);
    expect(matchesQueueFilter(o({ status: 'cancelled', cancel_reason: 'confirmation_expired' }), 'expired', NOW)).toBe(true);
    expect(matchesQueueFilter(o({ status: 'confirmed', confirmed_at: '2026-10-02T11:00:00Z' }), 'confirmed', NOW)).toBe(true);
    expect(matchesQueueFilter(o({ status: 'cancelled', cancel_reason: 'buyer_cancelled' }), 'expired', NOW)).toBe(false);
  });
});
