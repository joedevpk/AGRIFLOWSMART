/**
 * DONNÉES SIMULÉES — jamais utilisées en production, jamais importées par du code déployé.
 * Toutes les valeurs ci-dessous sont inventées pour les tests ; aucune ne correspond à un compte marchand réel.
 */
import { createHmac } from 'node:crypto';

export const SIMULATED_SECRETS = {
  CINETPAY_API_KEY: 'SIMULATED-api-key-0001',
  CINETPAY_SITE_ID: '000001',
  CINETPAY_SECRET_KEY: 'SIMULATED-secret-key-0001',
} as const;

export const SIMULATED_ENV_ENABLED: Record<string, string> = {
  ...SIMULATED_SECRETS, PAYMENTS_ONLINE_ENABLED: 'true', FRONTEND_URL: 'https://simulated.agriflow.example', SUPABASE_URL: 'https://simulated.supabase.example',
};

/** Ordre des champs du HMAC, recopié de https://docs.cinetpay.com/api/1.0-en/checkout/hmac (écrit ici indépendamment du code testé). */
export const DOC_HMAC_FIELDS = [
  'cpm_site_id', 'cpm_trans_id', 'cpm_trans_date', 'cpm_amount', 'cpm_currency', 'signature', 'payment_method', 'cel_phone_num',
  'cpm_phone_prefixe', 'cpm_language', 'cpm_version', 'cpm_payment_config', 'cpm_page_action', 'cpm_custom', 'cpm_designation', 'cpm_error_message',
] as const;

export function simulatedNotification(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    cpm_site_id: SIMULATED_SECRETS.CINETPAY_SITE_ID, cpm_trans_id: 'AGF-PAY-SIM0001', cpm_trans_date: '2026-10-10 10:00:00',
    cpm_amount: '1500', cpm_currency: 'CDF', signature: 'SIMULATED-signature', payment_method: 'OMCD', cel_phone_num: '0000000000',
    cpm_phone_prefixe: '243', cpm_language: 'fr', cpm_version: 'V1', cpm_payment_config: 'SINGLE', cpm_page_action: 'PAYMENT',
    cpm_custom: 'sim-custom', cpm_designation: 'Commande AgriFlow RDC SIM-001', cpm_error_message: 'SUCCES', ...overrides,
  };
}

/** Jeton x-token valide selon la documentation (HMAC-SHA256 de la concaténation des 16 champs). */
export function signNotification(fields: Record<string, string>, secret: string = SIMULATED_SECRETS.CINETPAY_SECRET_KEY): string {
  return createHmac('sha256', secret).update(DOC_HMAC_FIELDS.map((f) => fields[f] ?? '').join('')).digest('hex');
}

export const SIMULATED_CHECK_ACCEPTED = (amount: string, currency: string) => ({
  code: '00', message: 'SUCCES',
  data: { amount, currency, status: 'ACCEPTED', payment_method: 'OMCD', description: 'SIMULATED', metadata: null, operator_id: 'SIM-OP-0001', payment_date: '2026-10-10 10:01:00', fund_availability_date: '2026-10-12 00:00:00' },
});
export const SIMULATED_CHECK_STATUS = (status: string, amount = '1500', currency = 'CDF') => ({ code: status === 'ACCEPTED' ? '00' : '627', message: status, data: { amount, currency, status, payment_method: 'OMCD', operator_id: null } });
export const SIMULATED_INIT_CREATED = { code: '201', message: 'CREATED', description: 'Transaction created with success', data: { payment_token: 'SIM-TOKEN-0001', payment_url: 'https://checkout.simulated.example/payment/sim0001' }, api_response_id: 'sim' };
