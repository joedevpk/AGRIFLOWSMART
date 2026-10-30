import {
  cinetpayInitPayment, cinetpayVerifyPayment, missingCinetpaySecrets, readCinetpayConfig, validateCinetpayAmount,
  verifyCinetpayHmac, type CinetpayConfig,
} from '../cinetpay.ts';
import type { Availability, EnvReader, PaymentProvider } from './types.ts';

export const CINETPAY_ID = 'cinetpay';

/** Adaptateur CinetPay (API de paiement 1.0). Aucune logique de commande ni de commission ici. */
export function createCinetpayProvider(config: CinetpayConfig): PaymentProvider {
  return {
    id: CINETPAY_ID,
    validateAmount: validateCinetpayAmount,
    async initPayment(input) {
      return cinetpayInitPayment(config, {
        transactionId: input.transactionId, amount: input.amount, currency: input.currency, description: input.description,
        customerName: input.customerName, customerSurname: input.customerSurname, customerEmail: input.customerEmail,
        customerPhoneNumber: input.customerPhoneNumber, notifyUrl: input.notifyUrl, returnUrl: input.returnUrl,
        channels: input.channel === 'card' ? 'CREDIT_CARD' : 'MOBILE_MONEY', metadata: input.metadata,
      });
    },
    verifyTransaction: (reference) => cinetpayVerifyPayment(config, reference),
    verifyNotification: (fields, headers) => verifyCinetpayHmac(config.secretKey, fields, headers.get('x-token')),
    extractReference: (fields) => fields['cpm_trans_id'] || undefined,
  };
}

/** État d'activation CinetPay (pur : lit uniquement les variables d'environnement via `env`). */
export function cinetpayAvailability(env: EnvReader): Availability {
  const missing = missingCinetpaySecrets(env);
  const configured = missing.length === 0;
  const enabledFlag = (env('PAYMENTS_ONLINE_ENABLED') ?? '').trim().toLowerCase() === 'true';
  const state = !configured ? 'not_configured' : enabledFlag ? 'enabled' : 'disabled';
  // La carte exige un opt-in distinct : sa disponibilité (notamment en CDF) n'est pas confirmée par CinetPay.
  const cardOptIn = (env('CINETPAY_CARD_ENABLED') ?? '').trim().toLowerCase() === 'true';
  return {
    state, provider: CINETPAY_ID, configured, missing,
    methods: { mobile_money: state === 'enabled', card: state === 'enabled' && cardOptIn },
  };
}

export function buildCinetpay(env: EnvReader): { availability: Availability; provider: PaymentProvider | null } {
  const availability = cinetpayAvailability(env);
  const config = readCinetpayConfig(env);
  return { availability, provider: config ? createCinetpayProvider(config) : null };
}
