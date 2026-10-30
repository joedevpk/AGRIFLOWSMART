/**
 * Disponibilité du paiement en ligne côté acheteur. Logique pure (aucun accès réseau) : testable et réutilisable.
 * Règle : un moyen en ligne n'est proposable que si LE SERVEUR confirme l'activation (secrets du prestataire + interrupteur explicite).
 * Sans confirmation (statut inconnu, non configuré, désactivé), aucun faux bouton de paiement n'est offert.
 */
export type PaymentAvailabilityState = 'not_configured' | 'disabled' | 'unsupported_provider' | 'enabled' | 'unknown';

export interface PaymentAvailability {
  state: PaymentAvailabilityState;
  methods: { mobile_money: boolean; card: boolean };
}

export const ONLINE_NOT_ACTIVATED_MESSAGE = 'Le paiement en ligne n\'est pas encore activé. Choisissez le paiement à la livraison.';
export const ONLINE_STATUS_UNKNOWN_MESSAGE = 'Le statut du paiement en ligne est indisponible pour le moment. Réessayez ou choisissez le paiement à la livraison.';
export const CARD_UNAVAILABLE_MESSAGE = 'La carte bancaire n\'est pas disponible pour le moment.';

export const UNKNOWN_AVAILABILITY: PaymentAvailability = { state: 'unknown', methods: { mobile_money: false, card: false } };

interface OptionLike { id: string; mode: string; selectable: boolean; unavailableReason?: string }

/** Le paiement à la livraison n'est jamais concerné ; un moyen en ligne exige la confirmation serveur. */
export function applyAvailability<T extends OptionLike>(options: T[], availability: PaymentAvailability): T[] {
  return options.map((opt) => {
    if (opt.mode !== 'online') return opt;
    const serverOk = availability.state === 'enabled' && availability.methods[opt.id as 'mobile_money' | 'card'] === true;
    if (serverOk) return opt;
    if (!opt.selectable && availability.state === 'enabled') return opt; // déjà refusé par la configuration admin ou la devise
    const reason = availability.state === 'unknown' ? ONLINE_STATUS_UNKNOWN_MESSAGE
      : availability.state === 'enabled' ? CARD_UNAVAILABLE_MESSAGE : ONLINE_NOT_ACTIVATED_MESSAGE;
    return { ...opt, selectable: false, unavailableReason: reason };
  });
}

/** Interprète la réponse de `payment-status` ; toute réponse inattendue vaut « inconnu » (rien n'est proposé en ligne). */
export function parseAvailability(data: unknown): PaymentAvailability {
  const d = (data && typeof data === 'object' ? data : {}) as { ok?: unknown; state?: unknown; methods?: { mobile_money?: unknown; card?: unknown } };
  const states: PaymentAvailabilityState[] = ['not_configured', 'disabled', 'unsupported_provider', 'enabled'];
  if (d.ok !== true || !states.includes(d.state as PaymentAvailabilityState)) return UNKNOWN_AVAILABILITY;
  const state = d.state as PaymentAvailabilityState;
  return { state, methods: { mobile_money: state === 'enabled' && d.methods?.mobile_money === true, card: state === 'enabled' && d.methods?.card === true } };
}
