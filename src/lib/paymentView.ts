/**
 * États affichés par la page de retour de paiement. Le navigateur n'établit JAMAIS qu'un paiement a réussi :
 * `status` vient exclusivement de la base (après vérification serveur auprès du prestataire).
 */
export type PaymentStatusValue = 'pending' | 'processing' | 'paid' | 'failed' | 'cancelled' | 'expired' | 'refunded' | 'demo_paid';

export type PaymentView = 'checking' | 'pending' | 'success' | 'failed' | 'cancelled' | 'refunded' | 'demo' | 'error' | 'not_found';

export const MAX_POLLS = 15;
/** Tours de vérification consécutifs en échec réseau avant d'annoncer une erreur technique (et non une simple attente). */
export const ERROR_AFTER_FAILED_CHECKS = 2;

export function viewStateFor(input: { status: PaymentStatusValue | null; notFound: boolean; failedChecks: number }): PaymentView {
  const { status, notFound, failedChecks } = input;
  if (notFound) return 'not_found';
  if (status === 'paid') return 'success';
  if (status === 'refunded') return 'refunded';
  // Un statut de démonstration n'est jamais présenté comme un paiement confirmé.
  if (status === 'demo_paid') return 'demo';
  if (status === 'failed' || status === 'expired') return 'failed';
  if (status === 'cancelled') return 'cancelled';
  // Statut inconnu ou non terminal : attente, sauf si le serveur est injoignable de façon répétée.
  if (failedChecks >= ERROR_AFTER_FAILED_CHECKS) return 'error';
  return status === null ? 'checking' : 'pending';
}

export const TERMINAL_STATUSES: PaymentStatusValue[] = ['paid', 'failed', 'cancelled', 'expired', 'refunded', 'demo_paid'];
