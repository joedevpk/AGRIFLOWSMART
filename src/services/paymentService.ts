import { PAYMENT_RESULT_COLUMNS } from '@/lib/columns';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/logger';
import type { Payment, PaymentMethod } from '@/types';
import { callOrderRpc } from './orderService';
import { failure, success, type ServiceResult } from './serviceResult';

/**
 * Service de paiement RÉEL (CinetPay). Aucune clé privée du prestataire n'est
 * présente ici ni ailleurs dans le frontend : cette couche appelle uniquement
 * des Edge Functions Supabase (secrets côté serveur) et des RPC protégées par
 * RLS. La confirmation d'un paiement (`payments.status = 'paid'`) vient
 * TOUJOURS du serveur (webhook CinetPay vérifié → `payment_apply_result`),
 * jamais de ce module.
 *
 * Architecture : CheckoutPage → paymentService.initiatePayment → Edge Function
 * `payment-initiate` → CinetPay → (webhook) → Edge Function `payment-webhook`
 * → RPC `payment_apply_result` → mise à jour commande + paiement.
 */

export type PaymentMode = 'online' | 'cash';

export interface PaymentMethodOption {
  id: PaymentMethod;
  label: string;
  description: string;
  mode: PaymentMode;
  badge: string;
  /** Peut être choisi par l'acheteur (dépend de la configuration admin CinetPay). */
  selectable: boolean;
}

const STATIC_METHOD_META: Record<PaymentMethod, Omit<PaymentMethodOption, 'selectable'>> = {
  mobile_money: {
    id: 'mobile_money',
    label: 'Mobile Money',
    description: 'Orange Money, Airtel Money, M-Pesa — payez depuis votre téléphone via CinetPay.',
    mode: 'online',
    badge: 'Paiement sécurisé',
  },
  card: {
    id: 'card',
    label: 'Carte bancaire',
    description: 'Visa / Mastercard, selon la disponibilité pour votre devise.',
    mode: 'online',
    badge: 'Paiement sécurisé',
  },
  cash_on_delivery: {
    id: 'cash_on_delivery',
    label: 'Paiement à la livraison',
    description: 'Vous réglez en espèces à la réception. Le producteur confirme l\'encaissement.',
    mode: 'cash',
    badge: 'À la réception',
  },
};

/** Repli si la configuration serveur est indisponible : seul le paiement à la livraison est proposé. */
const FALLBACK_ENABLED: PaymentMethod[] = ['cash_on_delivery'];

/**
 * Lit la configuration réelle des moyens de paiement (activés / devises) depuis
 * la RPC `get_payment_methods` (source : table admin `payment_settings`). Ne
 * jamais supposer qu'un moyen est disponible simplement parce qu'il apparaît
 * dans ce fichier : c'est la configuration serveur qui décide.
 */
export async function fetchPaymentMethodOptions(currency: string | null): Promise<PaymentMethodOption[]> {
  try {
    const { data, error } = await supabase.rpc('get_payment_methods');
    if (error || !data) {
      reportError('paymentService.fetchPaymentMethodOptions', error?.message ?? 'no data');
      return buildOptions(FALLBACK_ENABLED, {}, currency);
    }
    const enabled = Array.isArray(data.enabled_methods) ? (data.enabled_methods as PaymentMethod[]) : FALLBACK_ENABLED;
    const currencies = (data.method_currencies ?? {}) as Record<string, string[]>;
    return buildOptions(enabled, currencies, currency);
  } catch (err) {
    reportError('paymentService.fetchPaymentMethodOptions', err);
    return buildOptions(FALLBACK_ENABLED, {}, currency);
  }
}

function buildOptions(enabled: PaymentMethod[], currencies: Record<string, string[]>, currency: string | null): PaymentMethodOption[] {
  return (Object.keys(STATIC_METHOD_META) as PaymentMethod[]).map((id) => {
    const meta = STATIC_METHOD_META[id];
    const enabledForMethod = enabled.includes(id);
    const currencyOk = id === 'cash_on_delivery' || !currency || (currencies[id] ?? []).includes(currency);
    return { ...meta, selectable: enabledForMethod && currencyOk };
  });
}

export function isOnlineMethod(method: PaymentMethod | null): boolean {
  return method === 'mobile_money' || method === 'card';
}

/* ------------------------------------------------------------------ */
/*  Initiation du paiement (Edge Function payment-initiate)            */
/* ------------------------------------------------------------------ */

export interface InitiatePaymentInput {
  orderId: string;
  paymentMethod: 'mobile_money' | 'card';
  phoneNumber?: string;
}

export interface InitiatePaymentSuccess {
  internalReference: string;
  checkoutUrl: string;
  replayed: boolean;
}

export type InitiatePaymentResult =
  | { ok: true; data: InitiatePaymentSuccess }
  | { ok: false; code: string; message: string };

const PAYMENT_ERROR_MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: 'Votre session a expiré. Reconnectez-vous pour continuer.',
  ORDER_NOT_FOUND: 'Cette commande est introuvable.',
  ORDER_CANCELLED: 'Cette commande a été annulée.',
  ALREADY_PAID: 'Cette commande est déjà payée.',
  METHOD_UNAVAILABLE: 'Ce moyen de paiement n\'est pas disponible pour le moment.',
  CURRENCY_UNAVAILABLE: 'Ce moyen de paiement n\'est pas disponible pour la devise de cette commande.',
  PROVIDER_ERROR: 'Le paiement n\'a pas pu être initié. Vous pouvez réessayer.',
  CONFIG_MISSING: 'Le paiement en ligne n\'est pas disponible pour le moment. Réessayez plus tard.',
  UNAVAILABLE: 'Service momentanément indisponible. Réessayez.',
};

function idempotencyKey(): string {
  return crypto.randomUUID();
}

/** Initie (ou reprend) un paiement en ligne : retourne l'URL de paiement hébergée CinetPay. */
export async function initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
  try {
    const { data, error } = await supabase.functions.invoke('payment-initiate', {
      body: {
        order_id: input.orderId,
        payment_method: input.paymentMethod,
        idempotency_key: idempotencyKey(),
        phone_number: input.phoneNumber,
      },
    });

    if (error) {
      reportError('paymentService.initiatePayment', error.message);
      return { ok: false, code: 'UNAVAILABLE', message: 'Préparation du paiement impossible pour le moment. Vérifiez votre connexion puis réessayez.' };
    }
    if (!data?.ok) {
      const code = data?.code ?? 'UNKNOWN';
      return { ok: false, code, message: PAYMENT_ERROR_MESSAGES[code] ?? 'Impossible de préparer le paiement pour le moment.' };
    }
    return {
      ok: true,
      data: { internalReference: data.internal_reference, checkoutUrl: data.checkout_url, replayed: Boolean(data.replayed) },
    };
  } catch (err) {
    reportError('paymentService.initiatePayment', err);
    return { ok: false, code: 'NETWORK', message: 'Préparation du paiement impossible pour le moment. Vérifiez votre connexion puis réessayez.' };
  }
}

/* ------------------------------------------------------------------ */
/*  Suivi du résultat (page /payment/result/:reference)                */
/* ------------------------------------------------------------------ */

export type PaymentResultStatus = Payment['status'];

/** Colonnes minimales du résultat de paiement (pas de metadata, d'URL de paiement ni de téléphone). */
export type PaymentResultRecord = Pick<Payment, 'id' | 'order_id' | 'status' | 'amount' | 'currency' | 'method' | 'internal_reference' | 'failure_reason' | 'created_at'>;

export async function fetchPaymentByReference(reference: string): Promise<ServiceResult<PaymentResultRecord | null>> {
  try {
    const { data, error } = await supabase.from('payments').select(PAYMENT_RESULT_COLUMNS).eq('internal_reference', reference).maybeSingle();
    if (error) {
      reportError('paymentService.fetchPaymentByReference', error.message);
      return failure('LOAD_FAILED', 'Impossible de récupérer le paiement.');
    }
    return success((data as PaymentResultRecord | null) ?? null);
  } catch (err) {
    reportError('paymentService.fetchPaymentByReference', err);
    return failure('NETWORK', 'Impossible de récupérer le paiement.');
  }
}

/** Force une vérification active auprès de CinetPay (webhook de secours). */
export async function verifyPayment(internalReference: string): Promise<ServiceResult<PaymentResultStatus>> {
  try {
    const { data, error } = await supabase.functions.invoke('payment-verify', {
      body: { internal_reference: internalReference },
    });
    if (error || !data?.ok) {
      reportError('paymentService.verifyPayment', error?.message ?? JSON.stringify(data));
      return failure('UNAVAILABLE', 'Vérification impossible pour le moment.');
    }
    return success(data.status as PaymentResultStatus);
  } catch (err) {
    reportError('paymentService.verifyPayment', err);
    return failure('NETWORK', 'Vérification impossible pour le moment.');
  }
}

/* ------------------------------------------------------------------ */
/*  Paiement à la livraison / remboursement                            */
/* ------------------------------------------------------------------ */

/** Le producteur confirme avoir encaissé le paiement à la livraison (commande livrée). */
export function confirmCashPayment(orderId: string): Promise<ServiceResult<null>> {
  return callOrderRpc('confirm_cash_payment', { p_order_id: orderId });
}

export async function requestRefund(orderId: string, reason: string): Promise<ServiceResult<null>> {
  try {
    const { data, error } = await supabase.rpc('request_refund', { p_order_id: orderId, p_reason: reason });
    if (error) {
      reportError('paymentService.requestRefund', error.message);
      return failure('UNAVAILABLE', 'Impossible d\'envoyer la demande pour le moment.');
    }
    if (data?.ok) return success(null);
    return failure(data?.code ?? 'UNKNOWN', 'Impossible d\'envoyer la demande de remboursement.');
  } catch (err) {
    reportError('paymentService.requestRefund', err);
    return failure('NETWORK', 'Impossible d\'envoyer la demande pour le moment.');
  }
}
