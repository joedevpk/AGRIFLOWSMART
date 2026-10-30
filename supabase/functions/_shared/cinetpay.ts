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
 *   cpm_page_action, cpm_custom, cpm_designation, cpm_error_message)).
 *   (Liste complète vérifiée sur https://docs.cinetpay.com/api/1.0-en/checkout/hmac : les deux derniers champs,
 *   cpm_designation et cpm_error_message, étaient absents jusqu'à la passe CinetPay — toute notification authentique
 *   aurait alors été rejetée.)
 */

import { fetchExternal, type ExternalFailure } from './http.ts';

const DEFAULT_BASE_URL = 'https://api-checkout.cinetpay.com';

export interface CinetpayConfig {
  apiKey: string;
  siteId: string;
  secretKey: string;
  baseUrl: string;
}

export type EnvReader = (name: string) => string | undefined;

/** Noms des secrets obligatoires (jamais leurs valeurs). */
export const CINETPAY_REQUIRED_SECRETS = ['CINETPAY_API_KEY', 'CINETPAY_SITE_ID', 'CINETPAY_SECRET_KEY'] as const;

/** Valeur absente, vide ou manifestement factice (modèle copié tel quel) : jamais utilisée comme une vraie clé. */
export function isPlaceholderSecret(value: string | undefined): boolean {
  const v = (value ?? '').trim();
  if (v.length === 0) return true;
  return /^(x{3,}|\*{3,}|changeme|change_me|your[_-]|<.*>|todo|test|fake|dummy|example|placeholder)/i.test(v);
}

/** Noms des secrets manquants ou factices (jamais leurs valeurs). */
export function missingCinetpaySecrets(env: EnvReader): string[] {
  return CINETPAY_REQUIRED_SECRETS.filter((name) => isPlaceholderSecret(env(name)));
}

/** Configuration CinetPay ou `null` si un secret manque / est factice. Ne lève jamais et ne journalise rien. */
export function readCinetpayConfig(env: EnvReader): CinetpayConfig | null {
  if (missingCinetpaySecrets(env).length > 0) return null;
  return {
    apiKey: env('CINETPAY_API_KEY') as string,
    siteId: env('CINETPAY_SITE_ID') as string,
    secretKey: env('CINETPAY_SECRET_KEY') as string,
    baseUrl: (env('CINETPAY_BASE_URL') || DEFAULT_BASE_URL).replace(/\/$/, ''),
  };
}

export function loadCinetpayConfig(): CinetpayConfig {
  const config = readCinetpayConfig((name) => Deno.env.get(name));
  if (!config) throw new Error('Secrets CinetPay manquants ou factices : ' + missingCinetpaySecrets((name) => Deno.env.get(name)).join(', '));
  return config;
}

/** La documentation signale une erreur d'API quand aucun user-agent n'est envoyé : on en fixe un explicitement. */
const JSON_HEADERS = { 'Content-Type': 'application/json', 'User-Agent': 'AgriFlowRDC/1.0 (+edge-function)' };

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
    amount: input.amount, // jamais arrondi ici : le montant a été validé (entier, règles prestataire) AVANT l'appel — voir validateCinetpayAmount
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
    headers: JSON_HEADERS,
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
    headers: JSON_HEADERS,
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
  'cpm_designation',
  'cpm_error_message',
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

export type AmountCheck = { ok: true } | { ok: false; code: 'CURRENCY_UNSUPPORTED' | 'AMOUNT_INVALID' | 'AMOUNT_NOT_INTEGER' | 'AMOUNT_NOT_MULTIPLE_OF_5' | 'AMOUNT_BELOW_MIN' | 'AMOUNT_ABOVE_MAX'; message: string };

const CINETPAY_CURRENCIES = ['XOF', 'XAF', 'CDF', 'GNF', 'USD'];
/** Limites par paiement documentées pour la RDC (CDF) : https://docs.cinetpay.com/api/1.0-en/checkout/tableau — à confirmer pour votre compte. */
const CDF_MIN = 100;
const CDF_MAX = 2_000_000;

/**
 * Règles de montant de l'API de paiement CinetPay 1.0 (https://docs.cinetpay.com/api/1.0-en/checkout/initialisation) :
 * devise parmi XOF, XAF, CDF, GNF, USD ; montant multiple de 5 (restriction non appliquée à l'USD) ; entier.
 * Le montant n'est JAMAIS arrondi : un montant refusé ici est refusé à l'acheteur plutôt que facturé différemment.
 * Non confirmé par la documentation : décimales en USD (on refuse par prudence), limites USD.
 */
export function validateCinetpayAmount(currency: string, amount: number): AmountCheck {
  if (!CINETPAY_CURRENCIES.includes(currency)) return { ok: false, code: 'CURRENCY_UNSUPPORTED', message: `Devise non prise en charge par le paiement en ligne : ${currency}.` };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, code: 'AMOUNT_INVALID', message: 'Montant invalide.' };
  if (!Number.isInteger(amount)) return { ok: false, code: 'AMOUNT_NOT_INTEGER', message: 'Le paiement en ligne n\'accepte que des montants entiers.' };
  if (currency !== 'USD' && amount % 5 !== 0) return { ok: false, code: 'AMOUNT_NOT_MULTIPLE_OF_5', message: 'Le montant doit être un multiple de 5 pour le paiement en ligne.' };
  if (currency === 'CDF' && amount < CDF_MIN) return { ok: false, code: 'AMOUNT_BELOW_MIN', message: `Montant minimum du paiement en ligne : ${CDF_MIN} CDF.` };
  if (currency === 'CDF' && amount > CDF_MAX) return { ok: false, code: 'AMOUNT_ABOVE_MAX', message: `Montant maximum du paiement en ligne : ${CDF_MAX.toLocaleString('fr-FR')} CDF.` };
  return { ok: true };
}
