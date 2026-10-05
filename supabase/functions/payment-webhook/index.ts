// Edge Function : payment-webhook
//
// URL de notification CinetPay (`notify_url`). CinetPay appelle cette URL en
// POST (form-urlencoded) à chaque changement de statut d'une transaction, et en
// GET pour un simple ping de disponibilité (doit répondre 200).
//
// Étapes (voir docs.cinetpay.com/api/1.0-fr/checkout/notification + hmac) :
//   1. Vérifier l'en-tête `x-token` (HMAC SHA-256 avec la clé secrète marchand).
//   2. NE JAMAIS faire confiance au corps du webhook pour le montant/statut :
//      rappeler /v2/payment/check pour obtenir la valeur réelle.
//   3. Appliquer le résultat de façon idempotente via `payment_apply_result`
//      (service_role) — qui revérifie elle-même montant/devise/commande.
//   4. Répondre 200 pour tout résultat DÉFINITIF (accepté, refusé, signature invalide, montant incohérent…) afin
//      d'éviter des réessais inutiles ; répondre 503 uniquement pour une panne TEMPORAIRE (timeout / 5xx du
//      prestataire, erreur base) afin que le prestataire puisse renvoyer la notification. Le comportement exact
//      de réessai de CinetPay n'a pas été vérifié ici : la page de résultat et la tâche de réconciliation du cron
//      (order-confirmation-cron) rattrapent de toute façon un webhook perdu.

import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { cinetpayVerifyPayment, loadCinetpayConfig, verifyCinetpayHmac } from '../_shared/cinetpay.ts';
import { ackResponse, CORS_HEADERS, errorResponse, isTransient, logEvent, retryLaterResponse } from '../_shared/http.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  // CinetPay ping de disponibilité : GET, doit répondre 200 sans traitement.
  if (req.method === 'GET') return ackResponse();
  if (req.method !== 'POST') return errorResponse('METHOD_NOT_ALLOWED', 'POST uniquement.', 405);

  let fields: Record<string, string> = {};
  const contentType = req.headers.get('content-type') || '';
  try {
    if (contentType.includes('application/json')) {
      const json = await req.json();
      fields = Object.fromEntries(Object.entries(json).map(([k, v]) => [k, String(v)]));
    } else {
      const form = await req.formData();
      fields = Object.fromEntries(Array.from(form.entries()).map(([k, v]) => [k, String(v)]));
    }
  } catch (err) {
    logEvent('error', 'payment-webhook', 'corps illisible', { reason: (err as Error)?.name ?? 'unknown' });
    // On répond quand même 200 pour ne pas déclencher de réessais infinis sur
    // une requête que CinetPay ne renverra pas différemment.
    return ackResponse();
  }

  const transactionId = fields['cpm_trans_id'];
  if (!transactionId) {
    logEvent('warn', 'payment-webhook', 'cpm_trans_id manquant'); // jamais les champs bruts (téléphone, signature)
    return ackResponse();
  }

  let config;
  try {
    config = loadCinetpayConfig();
  } catch {
    logEvent('error', 'payment-webhook', 'configuration CinetPay manquante');
    return retryLaterResponse(); // configuration à corriger : on ne perd pas la notification
  }

  // ---- 1. HMAC : rejette silencieusement (mais journalisé) toute notification
  // dont l'authenticité ne peut être prouvée. Aucune donnée n'est mise à jour.
  const xToken = req.headers.get('x-token');
  const validHmac = await verifyCinetpayHmac(config.secretKey, fields, xToken);
  if (!validHmac) {
    logEvent('warn', 'payment-webhook', 'HMAC invalide — notification rejetée', { transactionId });
    return ackResponse();
  }

  // ---- 2. Vérification active : seule source de vérité pour le montant/statut réel.
  const verify = await cinetpayVerifyPayment(config, transactionId);
  if (!verify.ok || !verify.status) {
    logEvent('error', 'payment-webhook', 'échec de la vérification CinetPay', { transactionId, code: verify.code, failure: verify.failure ?? null });
    // Panne temporaire du prestataire : 503 (réessai possible). Refus définitif (4xx, réponse invalide) : 200.
    return isTransient(verify.failure) ? retryLaterResponse() : ackResponse();
  }

  // ---- 3. Application idempotente du résultat.
  const admin = supabaseAdmin();
  const { data, error } = await admin.rpc('payment_apply_result', {
    p_internal_reference: transactionId,
    p_provider_transaction_id: fields['cpm_trans_id'] || null,
    p_provider_status: verify.status,
    p_amount: verify.amount ?? null,
    p_currency: verify.currency ?? null,
    p_operator: verify.paymentMethod ?? fields['payment_method'] ?? null,
    p_phone_number: fields['cel_phone_num'] ?? null,
    p_source: 'webhook',
    p_provider_event_id: verify.operatorId ?? transactionId,
    p_raw: { webhook: fields, verify: verify.raw },
  });

  if (error) {
    logEvent('error', 'payment-webhook', 'payment_apply_result a échoué', { transactionId });
    return retryLaterResponse(); // erreur base temporaire : la notification doit pouvoir être rejouée (idempotente)
  }
  if (!data?.ok) {
    logEvent('warn', 'payment-webhook', 'résultat refusé par la base', { transactionId, code: String(data?.code ?? 'UNKNOWN') });
  }

  return ackResponse();
});
