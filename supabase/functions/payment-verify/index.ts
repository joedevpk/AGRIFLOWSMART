// Edge Function : payment-verify
//
// Appelée par la page /payment/result/:reference (et en polling de secours
// limité) pour interroger l'état RÉEL d'une transaction auprès de CinetPay,
// indépendamment du webhook (qui peut être retardé). N'importe qui ne peut pas
// vérifier n'importe quelle référence : seul l'acheteur de la commande (ou un
// producteur/admin concerné, via RLS sur `payments`) peut le faire.

import { supabaseAdmin, supabaseAsUser } from '../_shared/supabaseAdmin.ts';
import { cinetpayVerifyPayment, loadCinetpayConfig } from '../_shared/cinetpay.ts';
import { CORS_HEADERS, errorResponse, jsonResponse, logEvent } from '../_shared/http.ts';

interface RequestBody {
  internal_reference?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return errorResponse('METHOD_NOT_ALLOWED', 'POST uniquement.', 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errorResponse('NOT_AUTHENTICATED', 'Authentification requise.', 401);

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return errorResponse('INVALID_REQUEST', 'Corps de requête JSON invalide.');
  }
  const reference = body.internal_reference;
  if (!reference) return errorResponse('INVALID_REQUEST', 'internal_reference requis.');

  const userClient = supabaseAsUser(authHeader);
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return errorResponse('NOT_AUTHENTICATED', 'Session invalide ou expirée.', 401);
  }

  // RLS (`payments_participant_read`) garantit que seul un participant de la
  // commande (ou un admin) peut lire ce paiement — sinon `data` est `null`.
  const { data: payment, error: paymentError } = await userClient
    .from('payments')
    .select('id, order_id, status, amount, currency, method')
    .eq('internal_reference', reference)
    .maybeSingle();

  if (paymentError) {
    logEvent('error', 'payment-verify', 'lecture payment échouée');
    return errorResponse('UNAVAILABLE', 'Service momentanément indisponible.', 503);
  }
  if (!payment) return errorResponse('NOT_FOUND', 'Paiement introuvable.', 404);

  // Paiement déjà dans un état terminal : pas besoin d'interroger CinetPay à nouveau.
  if (['paid', 'refunded'].includes(payment.status)) {
    return jsonResponse({ ok: true, status: payment.status });
  }

  let config;
  try {
    config = loadCinetpayConfig();
  } catch {
    logEvent('error', 'payment-verify', 'configuration CinetPay manquante');
    return errorResponse('CONFIG_MISSING', 'La passerelle de paiement n\'est pas configurée.', 503);
  }

  const verify = await cinetpayVerifyPayment(config, reference);
  if (!verify.ok || !verify.status) {
    // La transaction n'existe peut-être pas encore côté CinetPay (paiement pas
    // encore initié) ou l'API est momentanément indisponible : on renvoie l'état
    // connu en base sans erreur bloquante pour l'UI.
    return jsonResponse({ ok: true, status: payment.status, provider_unavailable: true });
  }

  const admin = supabaseAdmin();
  const { data: applied, error: applyError } = await admin.rpc('payment_apply_result', {
    p_internal_reference: reference,
    p_provider_transaction_id: reference,
    p_provider_status: verify.status,
    p_amount: verify.amount ?? null,
    p_currency: verify.currency ?? null,
    p_operator: verify.paymentMethod ?? null,
    p_phone_number: null,
    p_source: 'verify',
    p_provider_event_id: verify.operatorId ?? reference,
    p_raw: verify.raw,
  });

  if (applyError) {
    logEvent('error', 'payment-verify', 'payment_apply_result a échoué', { reference });
    return jsonResponse({ ok: true, status: payment.status });
  }
  if (!applied?.ok) {
    return jsonResponse({ ok: true, status: payment.status, mismatch: applied?.code });
  }

  return jsonResponse({ ok: true, status: applied.status });
});
