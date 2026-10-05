// Edge Function : payment-initiate
//
// Reçoit uniquement { order_id, payment_method, idempotency_key, phone_number? }.
// Aucun montant, aucune devise n'est accepté depuis le client : tout est relu
// depuis la commande en base via la RPC `payment_initiate_begin` (qui applique
// aussi l'idempotence : un même `idempotency_key`/tentative en cours renvoie la
// même URL de paiement plutôt que d'en créer une nouvelle).
//
// Secrets requis (supabase secrets set) :
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (fournis par la
//   plateforme), CINETPAY_API_KEY, CINETPAY_SITE_ID, CINETPAY_SECRET_KEY,
//   CINETPAY_BASE_URL (optionnel), FRONTEND_URL.

import { supabaseAdmin, supabaseAsUser } from '../_shared/supabaseAdmin.ts';
import { cinetpayInitPayment, loadCinetpayConfig } from '../_shared/cinetpay.ts';
import { CORS_HEADERS, errorResponse, jsonResponse, logEvent } from '../_shared/http.ts';

interface RequestBody {
  order_id?: string;
  payment_method?: string;
  idempotency_key?: string;
  phone_number?: string;
}

/** Libère le bail d'initiation (RPC service_role) après un échec avant l'appel prestataire ou pendant celui-ci. */
async function releaseLease(paymentId: string | undefined): Promise<void> {
  if (!paymentId) return;
  const { error } = await supabaseAdmin().rpc('payment_initiation_release', { p_payment_id: paymentId });
  if (error) logEvent('warn', 'payment-initiate', 'libération du bail impossible (il expirera seul)', { paymentId });
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

  const orderId = body.order_id;
  const paymentMethod = body.payment_method;
  const idempotencyKey = body.idempotency_key;
  if (!orderId || !paymentMethod || !idempotencyKey) {
    return errorResponse('INVALID_REQUEST', 'order_id, payment_method et idempotency_key sont requis.');
  }
  if (paymentMethod !== 'mobile_money' && paymentMethod !== 'card') {
    return errorResponse('INVALID_PAYMENT_METHOD', 'Méthode de paiement invalide pour une initiation en ligne.');
  }

  const userClient = supabaseAsUser(authHeader);
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return errorResponse('NOT_AUTHENTICATED', 'Session invalide ou expirée.', 401);
  }

  // ---- 1. Ouverture idempotente de la tentative (source de vérité du montant/devise)
  const { data: beginData, error: beginError } = await userClient.rpc('payment_initiate_begin', {
    p_order_id: orderId,
    p_payment_method: paymentMethod,
    p_idempotency_key: idempotencyKey,
    p_phone_number: body.phone_number ?? null,
  });

  if (beginError) {
    logEvent('error', 'payment-initiate', 'payment_initiate_begin a échoué', { orderId });
    return errorResponse('UNAVAILABLE', 'Service de paiement momentanément indisponible.', 503);
  }
  if (!beginData?.ok) {
    // Une autre requête initialise déjà ce paiement (double clic / double onglet) : 409, le client réessaie ou suit la première.
    if (beginData?.code === 'INITIATION_IN_PROGRESS') return jsonResponse({ ok: false, code: 'INITIATION_IN_PROGRESS' }, 409);
    return jsonResponse({ ok: false, code: beginData?.code ?? 'UNKNOWN' }, 400);
  }

  // Une tentative avec URL de paiement valide existe déjà : on la renvoie sans
  // rappeler CinetPay (idempotence — protège du double-clic / double soumission).
  if (beginData.already_initiated && beginData.checkout_url) {
    return jsonResponse({
      ok: true,
      replayed: true,
      internal_reference: beginData.internal_reference,
      checkout_url: beginData.checkout_url,
    });
  }

  // ---- 2. Appel réel du prestataire (secrets uniquement côté serveur)
  let cinetpayConfig;
  try {
    cinetpayConfig = loadCinetpayConfig();
  } catch {
    logEvent('error', 'payment-initiate', 'configuration CinetPay manquante');
    await releaseLease(beginData.payment_id);
    return errorResponse('CONFIG_MISSING', 'La passerelle de paiement n\'est pas configurée. Contactez le support.', 503);
  }

  const frontendUrl = Deno.env.get('FRONTEND_URL');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!frontendUrl || !supabaseUrl) {
    await releaseLease(beginData.payment_id);
    return errorResponse('CONFIG_MISSING', 'URL frontend ou Supabase manquante dans la configuration.', 503);
  }

  const [firstName, ...rest] = String(beginData.buyer_name || 'Client AgriFlow').trim().split(/\s+/);
  const channels = paymentMethod === 'card' ? 'CREDIT_CARD' : 'MOBILE_MONEY';

  const initResult = await cinetpayInitPayment(cinetpayConfig, {
    transactionId: beginData.internal_reference,
    amount: Number(beginData.amount),
    currency: String(beginData.currency),
    description: `Commande AgriFlow RDC ${beginData.order_number}`,
    customerName: firstName || 'Client',
    customerSurname: rest.join(' ') || 'AgriFlow',
    customerEmail: beginData.buyer_email || undefined,
    customerPhoneNumber: beginData.buyer_phone || undefined,
    notifyUrl: `${supabaseUrl}/functions/v1/payment-webhook`,
    returnUrl: `${frontendUrl}/payment/result/${beginData.internal_reference}`,
    channels,
    metadata: String(beginData.payment_id),
  });

  if (!initResult.ok || !initResult.paymentUrl) {
    logEvent('error', 'payment-initiate', 'initiation CinetPay échouée', { reference: String(beginData.internal_reference), code: initResult.code, failure: initResult.failure ?? null });
    await releaseLease(beginData.payment_id); // libère le bail : l'utilisateur peut réessayer immédiatement
    const unavailable = initResult.failure === 'timeout' || initResult.failure === 'network' || initResult.failure === 'http_5xx';
    return jsonResponse({
      ok: false,
      code: unavailable ? 'PROVIDER_UNAVAILABLE' : 'PROVIDER_ERROR',
      message: unavailable
        ? 'Le service de paiement ne répond pas pour le moment. Aucun montant n\'a été débité. Réessayez dans quelques minutes.'
        : 'L\'initiation du paiement a échoué auprès du prestataire. Vous pouvez réessayer.',
    }, unavailable ? 503 : 502);
  }

  // ---- 3. Enregistrement de la réponse prestataire (service_role uniquement)
  const admin = supabaseAdmin();
  const { error: attachError } = await admin.rpc('payment_provider_attach', {
    p_payment_id: beginData.payment_id,
    p_provider_transaction_id: initResult.paymentToken ?? null,
    p_checkout_url: initResult.paymentUrl,
    p_raw: initResult.raw,
  });
  if (attachError) {
    logEvent('error', 'payment-initiate', 'payment_provider_attach a échoué', { reference: String(beginData.internal_reference) });
    // Le paiement CinetPay est initié côté prestataire mais pas encore reflété en
    // base : on renvoie quand même l'URL au client (le webhook/la vérification
    // active rattraperont l'état), tout en journalisant l'anomalie côté serveur.
  }

  return jsonResponse({
    ok: true,
    replayed: false,
    internal_reference: beginData.internal_reference,
    checkout_url: initResult.paymentUrl,
  });
});
