/**
 * Intégration CinetPay — endpoints et paramètres tirés de la documentation
 * officielle (https://docs.cinetpay.com/api/1.0-fr/checkout/*), consultée pour
 * cette implémentation. Ne pas modifier les noms de champs sans revérifier la
 * documentation à jour : CinetPay peut faire évoluer son API.
 *
 * - Initialisation : POST {base}/v2/payment
 * - Vérification    : POST {base}/v2/payment/check
 * - Notification (webhook) : POST vers notify_url, avec un en-tête `x-token`
 *   HMAC-SHA256(secret_key, concat(cpm_site_id, cpm_trans_id, cpm_trans_date,
 *   cpm_amount, cpm_currency, signature, payment_method, cel_phone_num,
 *   cpm_phone_prefixe, cpm_language, cpm_version, cpm_payment_config,
 *   cpm_page_action, cpm_custom)).
 */

import { fetchExternal, type ExternalFailure } from './http.ts';

const DEFAULT_BASE_URL = 'https://api-checkout.cinetpay.com';

export interface CinetpayConfig {
  apiKey: string;
  siteId: string;
  secretKey: string;
  baseUrl: string;
}

export function loadCinetpayConfig(): CinetpayConfig {
  const apiKey = Deno.env.get('CINETPAY_API_KEY');
  const siteId = Deno.env.get('CINETPAY_SITE_ID');
  const secretKey = Deno.env.get('CINETPAY_SECRET_KEY');
  const baseUrl = Deno.env.get('CINETPAY_BASE_URL') || DEFAULT_BASE_URL;
  if (!apiKey || !siteId || !secretKey) {
    throw new Error('CINETPAY_API_KEY / CINETPAY_SITE_ID / CINETPAY_SECRET_KEY manquants dans les secrets Supabase.');
  }
  return { apiKey, siteId, secretKey, baseUrl };
}

export interface InitPaymentInput {
  transactionId: string;
  amount: number;
  currency: string;
  description: string;
  customerName: string;
  customerSurname: string;
  customerEmail?: string;
  customerPhoneNumber?: string;
  notifyUrl: string;
  returnUrl: string;
  channels: 'ALL' | 'MOBILE_MONEY' | 'CREDIT_CARD';
  metadata?: string;
}

export interface InitPaymentResult {
  ok: boolean;
  code: string;
  message: string;
  paymentToken?: string;
  paymentUrl?: string;
  raw: unknown;
  /** Renseigné quand l'appel n'a pas abouti techniquement (timeout, réseau, 4xx/5xx, réponse invalide). */
  failure?: ExternalFailure;
}

/** POST /v2/payment — crée le lien de paiement hébergé CinetPay. */
export async function cinetpayInitPayment(config: CinetpayConfig, input: InitPaymentInput): Promise<InitPaymentResult> {
  const body = {
    apikey: config.apiKey,
    site_id: config.siteId,
    transaction_id: input.transactionId,
    amount: Math.round(input.amount), // CinetPay attend un entier (pas de centimes) pour CDF/XOF
    currency: input.currency,
    description: input.description.slice(0, 255),
    customer_name: input.customerName,
    customer_surname: input.customerSurname,
    customer_email: input.customerEmail || undefined,
    customer_phone_number: input.customerPhoneNumber || undefined,
    notify_url: input.notifyUrl,
    return_url: input.returnUrl,
    channels: input.channels,
    metadata: input.metadata,
    lang: 'FR',
  };

  // Initiation : PAS de retry automatique (un second appel avec le même transaction_id n'est pas garanti sans effet).
  const res = await fetchExternal(`${config.baseUrl}/v2/payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, { retries: 0 });
  const raw = res.json ?? {};

  const code = String((raw as Record<string, unknown>)?.code ?? '');
  const message = String((raw as Record<string, unknown>)?.message ?? '');
  const data = (raw as Record<string, unknown>)?.data as Record<string, unknown> | undefined;

  return {
    ok: res.ok && code === '201',
    code,
    message,
    paymentToken: typeof data?.payment_token === 'string' ? data.payment_token : undefined,
    paymentUrl: typeof data?.payment_url === 'string' ? data.payment_url : undefined,
    raw,
    failure: res.failure,
  };
}

export interface VerifyPaymentResult {
  ok: boolean;
  code: string;
  message: string;
  status?: 'ACCEPTED' | 'REFUSED' | 'CANCELLED' | 'WAITING_FOR_CUSTOMER' | string;
  amount?: number;
  currency?: string;
  paymentMethod?: string;
  operatorId?: string;
  raw: unknown;
  failure?: ExternalFailure;
}

/** POST /v2/payment/check — seule source de vérité pour le statut réel d'un paiement. */
export async function cinetpayVerifyPayment(config: CinetpayConfig, transactionId: string): Promise<VerifyPaymentResult> {
  // Vérification = lecture sans effet de bord : au plus 1 nouvelle tentative sur échec temporaire (timeout / réseau / 5xx).
  const res = await fetchExternal(`${config.baseUrl}/v2/payment/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apikey: config.apiKey, site_id: config.siteId, transaction_id: transactionId }),
  }, { retries: 1 });
  const raw = res.json ?? {};
  const code = String((raw as Record<string, unknown>)?.code ?? '');
  const message = String((raw as Record<string, unknown>)?.message ?? '');
  const data = (raw as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
  const amount = data?.amount !== undefined ? Number(data.amount) : undefined;

  return {
    ok: res.ok,
    code,
    message,
    status: typeof data?.status === 'string' ? data.status : undefined,
    amount: amount !== undefined && Number.isFinite(amount) ? amount : undefined,
    currency: typeof data?.currency === 'string' ? data.currency : undefined,
    paymentMethod: typeof data?.payment_method === 'string' ? data.payment_method : undefined,
    operatorId: typeof data?.operator_id === 'string' ? data.operator_id : undefined,
    raw,
    failure: res.failure,
  };
}

/** Champs du body de notification CinetPay, dans l'ordre requis pour le calcul du HMAC. */
const HMAC_FIELD_ORDER = [
  'cpm_site_id',
  'cpm_trans_id',
  'cpm_trans_date',
  'cpm_amount',
  'cpm_currency',
  'signature',
  'payment_method',
  'cel_phone_num',
  'cpm_phone_prefixe',
  'cpm_language',
  'cpm_version',
  'cpm_payment_config',
  'cpm_page_action',
  'cpm_custom',
] as const;

async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Vérifie l'en-tête `x-token` d'une notification CinetPay. Retourne `false` si
 * le token est absent, mal formé, ou ne correspond pas — le webhook doit alors
 * rejeter la requête SANS mettre à jour la moindre donnée.
 */
export async function verifyCinetpayHmac(secretKey: string, postFields: Record<string, string>, xToken: string | null): Promise<boolean> {
  if (!xToken) return false;
  const concatenated = HMAC_FIELD_ORDER.map((f) => postFields[f] ?? '').join('');
  const expected = await hmacSha256Hex(secretKey, concatenated);
  return timingSafeEqual(expected, xToken);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
