import { buildCinetpay, CINETPAY_ID } from './cinetpayProvider.ts';
import type { EnvReader, ProviderSelection } from './types.ts';

/**
 * Sélection du prestataire (`PAYMENT_PROVIDER`, défaut `cinetpay`). Aucun prestataire « de simulation » n'existe ici :
 * les simulations n'existent que dans les tests (voir src/test/), jamais dans le code déployé, afin qu'aucune configuration
 * ne puisse marquer un paiement de production comme payé sans prestataire réel.
 */
export function selectProvider(env: EnvReader): ProviderSelection {
  const id = (env('PAYMENT_PROVIDER') ?? CINETPAY_ID).trim().toLowerCase() || CINETPAY_ID;
  if (id === CINETPAY_ID) return buildCinetpay(env);
  return {
    provider: null,
    availability: { state: 'unsupported_provider', provider: id, configured: false, methods: { mobile_money: false, card: false }, missing: [] },
  };
}
