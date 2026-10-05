import type { Order, OrderWithDetails, Profile } from '@/types';

/**
 * Confirmation des commandes par le producteur — aides d'AFFICHAGE uniquement.
 *
 * La vérité (échéance, expiration, rappels, remboursement) vit côté serveur (migration
 * 20260930090000, fonctions `_order_confirmation_maintenance`, `order_alternatives`…). Le délai
 * lui-même est configurable dans `order_confirmation_settings` (admin) : AUCUNE durée n'est codée ici.
 * Ce module ne fait que lire `orders.confirmation_deadline` et calculer un temps restant RÉEL.
 */

/** Intervalle de rafraîchissement du temps restant affiché (le calcul reste exact à chaque rendu). */
export const REMAINING_REFRESH_MS = 30_000;
/** En dessous de ce seuil l'échéance est présentée comme « proche » (affichage uniquement). */
export const DEADLINE_SOON_MS = 4 * 3600_000;
/** La présence (`last_seen_at`) n'est écrite par le client qu'au plus toutes les 5 minutes. */
export const PRESENCE_MIN_INTERVAL_MS = 5 * 60_000;

export type ConfirmationKind =
  | 'awaiting_payment'   // paiement en ligne pas encore confirmé : le délai n'a pas démarré
  | 'awaiting_producer'  // payé / paiement à la livraison : le producteur doit confirmer avant l'échéance
  | 'expired'            // annulée faute de confirmation
  | 'rejected'           // refusée / annulée par le producteur
  | 'none';

export interface ConfirmationState {
  kind: ConfirmationKind;
  deadline: string | null;
  /** Millisecondes restantes (négatif = échéance dépassée, en attente du traitement serveur). */
  msRemaining: number | null;
  urgency: 'ok' | 'soon' | 'overdue' | null;
}

type OrderLike = Pick<Order, 'status' | 'payment_method' | 'payment_status' | 'confirmation_deadline' | 'cancel_reason'>;

export function confirmationState(order: OrderLike, now: number = Date.now()): ConfirmationState {
  if (order.status === 'cancelled') {
    if (order.cancel_reason === 'confirmation_expired') return { kind: 'expired', deadline: order.confirmation_deadline, msRemaining: null, urgency: null };
    if (order.cancel_reason === 'producer_rejected' || order.cancel_reason === 'producer_cancelled') {
      return { kind: 'rejected', deadline: order.confirmation_deadline, msRemaining: null, urgency: null };
    }
    return { kind: 'none', deadline: null, msRemaining: null, urgency: null };
  }
  if (order.status !== 'pending') return { kind: 'none', deadline: null, msRemaining: null, urgency: null };

  if (!order.confirmation_deadline) {
    const online = order.payment_method === 'mobile_money' || order.payment_method === 'card';
    return { kind: online ? 'awaiting_payment' : 'none', deadline: null, msRemaining: null, urgency: null };
  }
  const msRemaining = new Date(order.confirmation_deadline).getTime() - now;
  const urgency = msRemaining <= 0 ? 'overdue' : msRemaining <= DEADLINE_SOON_MS ? 'soon' : 'ok';
  return { kind: 'awaiting_producer', deadline: order.confirmation_deadline, msRemaining, urgency };
}

/** Commande que le producteur peut et doit traiter maintenant. */
export function needsProducerAttention(order: OrderLike): boolean {
  return confirmationState(order).kind === 'awaiting_producer';
}

type Translate = (key: string, params?: Record<string, string | number>) => string;

/** « 5 h 12 min », « 2 j 3 h », « 14 min », « moins d'une minute ». Calcul réel, jamais un faux compte à rebours. */
export function formatRemaining(ms: number, t: Translate): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  if (totalMinutes < 1) return t('time.lessThanMinute');
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return t('time.daysHours', { d: days, h: hours });
  if (hours > 0) return t('time.hoursMinutes', { h: hours, m: minutes });
  return t('time.minutes', { m: minutes });
}

const TIME_ZONE = 'Africa/Kinshasa';

function safeLocale(language: string): string {
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([language]).length > 0 ? language : 'fr';
  } catch {
    return 'fr';
  }
}

/** « 30 septembre à 18:00 » (heure de Kinshasa, la même que dans les notifications). */
export function formatDeadline(iso: string, language = 'fr'): string {
  return new Date(iso).toLocaleString(safeLocale(language), {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE,
  });
}

/** Libellé de dernière activité d'après `last_seen_at` — `null` si la donnée n'existe pas (jamais inventée). */
export function presenceLabel(lastSeenAt: string | null | undefined, t: Translate, now: number = Date.now()): string | null {
  if (!lastSeenAt) return null;
  const diff = now - new Date(lastSeenAt).getTime();
  if (!Number.isFinite(diff)) return null;
  const minutes = Math.max(0, Math.floor(diff / 60_000));
  if (minutes < 5) return t('presence.now');
  if (minutes < 60) return t('presence.minutes', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('presence.hours', { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 2) return t('presence.yesterday');
  if (days <= 30) return t('presence.days', { n: days });
  return t('presence.old');
}

/** Le producteur accepte-t-il de nouvelles commandes ? Miroir de la fonction SQL `producer_accepting`. */
export function isProducerAccepting(
  profile: Pick<Profile, 'is_available_for_orders' | 'availability_until'> | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!profile || profile.is_available_for_orders === undefined) return true; // donnée absente : on ne prétend rien
  if (profile.is_available_for_orders) return true;
  return !!profile.availability_until && new Date(profile.availability_until).getTime() <= now;
}

/** « Indisponible jusqu'au … » si une date de retour est connue et encore à venir. */
export function unavailableUntil(profile: Pick<Profile, 'is_available_for_orders' | 'availability_until'> | null | undefined, now: number = Date.now()): string | null {
  if (!profile || isProducerAccepting(profile, now)) return null;
  return profile.availability_until && new Date(profile.availability_until).getTime() > now ? profile.availability_until : null;
}

/** Commandes visibles dans la vue admin selon le filtre choisi. */
export type ConfirmationQueueFilter = 'pending' | 'soon' | 'expired' | 'confirmed';

export function matchesQueueFilter(order: Pick<OrderWithDetails, 'status' | 'confirmation_deadline' | 'cancel_reason' | 'confirmed_at'>, filter: ConfirmationQueueFilter, now: number = Date.now()): boolean {
  const waiting = order.status === 'pending' && !!order.confirmation_deadline;
  const remaining = order.confirmation_deadline ? new Date(order.confirmation_deadline).getTime() - now : null;
  switch (filter) {
    case 'pending': return waiting;
    case 'soon': return waiting && remaining !== null && remaining <= DEADLINE_SOON_MS;
    case 'expired': return order.status === 'cancelled' && order.cancel_reason === 'confirmation_expired';
    case 'confirmed': return order.confirmed_at !== null;
  }
}
