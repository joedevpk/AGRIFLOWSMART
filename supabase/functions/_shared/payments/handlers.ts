/**
 * Gestionnaires HTTP des fonctions de paiement, indépendants de Deno, de Supabase et du prestataire (dépendances injectées).
 * Les fonctions Edge (`payment-*`) ne sont que des enveloppes minces : `Deno.serve((req) => handleX(req, realDeps))`.
 * Ce découpage permet de tester sans réseau ni base le comportement de sécurité (signature, montants relus côté serveur,
 * absence de configuration, idempotence déléguée à la base) — voir src/test/payment-handlers.test.ts.
 *
 * Invariants :
 *  - le navigateur ne fournit JAMAIS montant, devise, statut ni référence de prestataire ;
 *  - rien n'est payé sans vérification serveur auprès du prestataire puis application par `payment_apply_result` (service_role) ;
 *  - aucun secret, numéro de téléphone ni charge brute n'est écrit dans les journaux ou renvoyé au navigateur.
 */
import { ackResponse, CORS_HEADERS, errorResponse, isTransient, jsonResponse, logEvent, retryLaterResponse } from '../http.ts';
import type { EnvReader, ProviderSelection } from './types.ts';

export interface RpcResult { data: unknown; error: { message: string } | null }
export interface AdminClient { rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult> }
export interface UserClient extends AdminClient {
  auth: { getUser(): PromiseLike<{ data: { user: { id: string } | null } | null; error: unknown }> };
  from(table: string): { select(columns: string): { eq(column: string, value: string): { maybeSingle(): PromiseLike<{ data: unknown; error: unknown }> } } };
}
export interface HandlerDeps {
  env: EnvReader;
  select: (env: EnvReader) => ProviderSelection;
  admin: () => AdminClient;
  userClient: (authorization: string | null) => UserClient;
  log: typeof logEvent;
}

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});
const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v));

/** Données minimisées conservées pour le diagnostic : ni signature, ni numéro de téléphone, ni identifiant marchand. */
export function redactNotification(fields: Record<string, string>): Record<string, string> {
  const { signature: _s, cel_phone_num: _p, cpm_site_id: _i, ...rest } = fields; // eslint-disable-line @typescript-eslint/no-unused-vars
  return rest;
}

const NOT_ACTIVATED_MESSAGE = 'Le paiement en ligne n\'est pas encore activé. Choisissez le paiement à la livraison ou réessayez plus tard.';

/** Statut public du paiement en ligne : AUCUNE donnée de configuration, uniquement l'état d'activation. */
export async function handleStatus(req: Request, deps: HandlerDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST' && req.method !== 'GET') return errorResponse('METHOD_NOT_ALLOWED', 'POST ou GET uniquement.', 405);
  const { availability } = deps.select(deps.env);
  return jsonResponse({ ok: true, state: availability.state, online_enabled: availability.state === 'enabled', methods: availability.methods });
}

export async function handleInitiate(req: Request, deps: HandlerDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return errorResponse('METHOD_NOT_ALLOWED', 'POST uniquement.', 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errorResponse('NOT_AUTHENTICATED', 'Authentification requise.', 401);

  let body: Obj;
  try { body = asObj(await req.json()); } catch { return errorResponse('INVALID_REQUEST', 'Corps de requête JSON invalide.'); }

  const orderId = str(body.order_id);
  const paymentMethod = str(body.payment_method);
  const idempotencyKey = str(body.idempotency_key);
  if (!orderId || !paymentMethod || !idempotencyKey) return errorResponse('INVALID_REQUEST', 'order_id, payment_method et idempotency_key sont requis.');
  if (paymentMethod !== 'mobile_money' && paymentMethod !== 'card') return errorResponse('INVALID_PAYMENT_METHOD', 'Méthode de paiement invalide pour une initiation en ligne.');

  // Activation : AVANT toute écriture. Sans secrets (ou sans activation explicite), aucune tentative de paiement n'est créée.
  const { availability, provider } = deps.select(deps.env);
  if (availability.state !== 'enabled' || !provider) {
    deps.log('warn', 'payment-initiate', 'paiement en ligne non activé', { state: availability.state, missing: availability.missing.join(',') });
    return errorResponse('PAYMENTS_NOT_ACTIVATED', NOT_ACTIVATED_MESSAGE, 503);
  }
  if (!availability.methods[paymentMethod]) return errorResponse('METHOD_UNAVAILABLE', 'Ce moyen de paiement n\'est pas disponible pour le moment.', 400);

  const userClient = deps.userClient(authHeader);
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) return errorResponse('NOT_AUTHENTICATED', 'Session invalide ou expirée.', 401);

  // 1. Ouverture idempotente : le montant et la devise viennent de la commande en base, jamais du navigateur.
  const begin = await userClient.rpc('payment_initiate_begin', {
    p_order_id: orderId, p_payment_method: paymentMethod, p_idempotency_key: idempotencyKey, p_phone_number: str(body.phone_number) || null,
  });
  if (begin.error) {
    deps.log('error', 'payment-initiate', 'payment_initiate_begin a échoué', { orderId });
    return errorResponse('UNAVAILABLE', 'Service de paiement momentanément indisponible.', 503);
  }
  const b = asObj(begin.data);
  if (!b.ok) {
    if (b.code === 'INITIATION_IN_PROGRESS') return jsonResponse({ ok: false, code: 'INITIATION_IN_PROGRESS' }, 409);
    return jsonResponse({ ok: false, code: str(b.code) || 'UNKNOWN' }, 400);
  }
  const releaseLease = async () => {
    if (!b.payment_id) return;
    const r = await deps.admin().rpc('payment_initiation_release', { p_payment_id: b.payment_id });
    if (r.error) deps.log('warn', 'payment-initiate', 'libération du bail impossible (il expirera seul)', { paymentId: str(b.payment_id) });
  };

  // Une tentative avec URL valide existe déjà : on la renvoie sans rappeler le prestataire (idempotence).
  if (b.already_initiated && b.checkout_url) {
    return jsonResponse({ ok: true, replayed: true, internal_reference: b.internal_reference, checkout_url: b.checkout_url });
  }

  // 2. Règles du prestataire sur le montant : refus explicite plutôt qu'un arrondi silencieux (qui facturerait un autre montant).
  const amount = Number(b.amount);
  const currency = str(b.currency);
  const amountCheck = provider.validateAmount(currency, amount);
  if (!amountCheck.ok) {
    deps.log('warn', 'payment-initiate', 'montant refusé par les règles du prestataire', { reference: str(b.internal_reference), code: amountCheck.code, currency });
    await releaseLease();
    return jsonResponse({ ok: false, code: 'AMOUNT_NOT_SUPPORTED', reason: amountCheck.code, message: amountCheck.message }, 422);
  }

  const frontendUrl = deps.env('FRONTEND_URL');
  const supabaseUrl = deps.env('SUPABASE_URL');
  if (!frontendUrl || !supabaseUrl) {
    await releaseLease();
    return errorResponse('CONFIG_MISSING', 'URL frontend ou Supabase manquante dans la configuration.', 503);
  }

  const [firstName, ...rest] = str(b.buyer_name || 'Client AgriFlow').trim().split(/\s+/);
  const init = await provider.initPayment({
    transactionId: str(b.internal_reference), amount, currency,
    description: `Commande AgriFlow RDC ${str(b.order_number)}`,
    customerName: firstName || 'Client', customerSurname: rest.join(' ') || 'AgriFlow',
    customerEmail: str(b.buyer_email) || undefined, customerPhoneNumber: str(b.buyer_phone) || undefined,
    notifyUrl: `${supabaseUrl}/functions/v1/payment-webhook`,
    returnUrl: `${frontendUrl.replace(/\/$/, '')}/payment/result/${str(b.internal_reference)}`,
    channel: paymentMethod, metadata: str(b.payment_id),
  });

  if (!init.ok || !init.paymentUrl) {
    deps.log('error', 'payment-initiate', 'initiation du prestataire échouée', { reference: str(b.internal_reference), code: init.code, failure: init.failure ?? null });
    await releaseLease();
    const unavailable = init.failure === 'timeout' || init.failure === 'network' || init.failure === 'http_5xx';
    return jsonResponse({
      ok: false, code: unavailable ? 'PROVIDER_UNAVAILABLE' : 'PROVIDER_ERROR',
      message: unavailable
        ? 'Le service de paiement ne répond pas pour le moment. Aucun montant n\'a été débité. Réessayez dans quelques minutes.'
        : 'L\'initiation du paiement a échoué auprès du prestataire. Vous pouvez réessayer.',
    }, unavailable ? 503 : 502);
  }

  // 3. Enregistrement de la réponse du prestataire (service_role uniquement).
  const attach = await deps.admin().rpc('payment_provider_attach', {
    p_payment_id: b.payment_id, p_provider_transaction_id: init.paymentToken ?? null, p_checkout_url: init.paymentUrl, p_raw: init.raw,
  });
  if (attach.error) {
    // Paiement initié chez le prestataire mais pas encore reflété en base : l'URL est rendue (le webhook / la vérification rattrapent l'état).
    deps.log('error', 'payment-initiate', 'payment_provider_attach a échoué', { reference: str(b.internal_reference) });
  }
  return jsonResponse({ ok: true, replayed: false, internal_reference: b.internal_reference, checkout_url: init.paymentUrl });
}

export async function handleWebhook(req: Request, deps: HandlerDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method === 'GET') return ackResponse(); // ping de disponibilité du prestataire
  if (req.method !== 'POST') return errorResponse('METHOD_NOT_ALLOWED', 'POST uniquement.', 405);

  let fields: Record<string, string> = {};
  const contentType = req.headers.get('content-type') || '';
  try {
    if (contentType.includes('application/json')) {
      fields = Object.fromEntries(Object.entries(asObj(await req.json())).map(([k, v]) => [k, String(v)]));
    } else {
      const form = await req.formData();
      fields = Object.fromEntries(Array.from(form.entries()).map(([k, v]) => [k, String(v)]));
    }
  } catch (err) {
    deps.log('error', 'payment-webhook', 'corps illisible', { reason: (err as Error)?.name ?? 'unknown' });
    return ackResponse();
  }

  // Les notifications de paiements déjà initiés restent traitées même si les NOUVEAUX paiements sont désactivés
  // (l'interrupteur d'activation ne doit jamais faire perdre une confirmation d'argent déjà reçu).
  const { availability, provider } = deps.select(deps.env);
  if (!provider) {
    deps.log('error', 'payment-webhook', 'prestataire non configuré', { state: availability.state, missing: availability.missing.join(',') });
    return retryLaterResponse();
  }

  const reference = provider.extractReference(fields);
  if (!reference) {
    deps.log('warn', 'payment-webhook', 'référence de transaction manquante'); // jamais les champs bruts (téléphone, signature)
    return ackResponse();
  }

  // 1. Authenticité : toute notification dont la signature ne peut être prouvée est rejetée SANS aucune écriture.
  if (!(await provider.verifyNotification(fields, req.headers))) {
    deps.log('warn', 'payment-webhook', 'signature invalide — notification rejetée', { transactionId: reference });
    return ackResponse();
  }

  // 2. Vérification active : seule source de vérité du montant / statut. Le corps de la notification n'est JAMAIS cru.
  const verify = await provider.verifyTransaction(reference);
  if (!verify.ok || !verify.status) {
    deps.log('error', 'payment-webhook', 'échec de la vérification auprès du prestataire', { transactionId: reference, code: verify.code, failure: verify.failure ?? null });
    return isTransient(verify.failure) ? retryLaterResponse() : ackResponse();
  }

  // 3. Application idempotente (la base revérifie montant, devise et correspondance avec la commande).
  const applied = await deps.admin().rpc('payment_apply_result', {
    p_internal_reference: reference, p_provider_transaction_id: reference, p_provider_status: verify.status,
    p_amount: verify.amount ?? null, p_currency: verify.currency ?? null, p_operator: verify.paymentMethod ?? fields['payment_method'] ?? null,
    p_phone_number: fields['cel_phone_num'] ?? null, p_source: 'webhook', p_provider_event_id: verify.operatorId ?? reference,
    p_raw: { webhook: redactNotification(fields), verify: verify.raw },
  });
  if (applied.error) {
    deps.log('error', 'payment-webhook', 'payment_apply_result a échoué', { transactionId: reference });
    return retryLaterResponse(); // erreur base temporaire : la notification peut être rejouée (idempotente)
  }
  const r = asObj(applied.data);
  if (!r.ok) deps.log('warn', 'payment-webhook', 'résultat refusé par la base', { transactionId: reference, code: str(r.code) || 'UNKNOWN' });
  return ackResponse();
}

export async function handleVerify(req: Request, deps: HandlerDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return errorResponse('METHOD_NOT_ALLOWED', 'POST uniquement.', 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errorResponse('NOT_AUTHENTICATED', 'Authentification requise.', 401);
  let body: Obj;
  try { body = asObj(await req.json()); } catch { return errorResponse('INVALID_REQUEST', 'Corps de requête JSON invalide.'); }
  const reference = str(body.internal_reference);
  if (!reference) return errorResponse('INVALID_REQUEST', 'internal_reference requis.');

  const userClient = deps.userClient(authHeader);
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) return errorResponse('NOT_AUTHENTICATED', 'Session invalide ou expirée.', 401);

  // RLS : seul un participant de la commande (ou un admin) lit ce paiement — sinon `data` est null (référence d'un autre utilisateur = introuvable).
  const read = await userClient.from('payments').select('id, order_id, status, amount, currency, method').eq('internal_reference', reference).maybeSingle();
  if (read.error) {
    deps.log('error', 'payment-verify', 'lecture du paiement échouée');
    return errorResponse('UNAVAILABLE', 'Service momentanément indisponible.', 503);
  }
  const payment = read.data ? asObj(read.data) : null;
  if (!payment) return errorResponse('NOT_FOUND', 'Paiement introuvable.', 404);
  const known = str(payment.status);

  if (['paid', 'refunded'].includes(known)) return jsonResponse({ ok: true, status: known });

  const { provider } = deps.select(deps.env);
  if (!provider) {
    deps.log('error', 'payment-verify', 'prestataire non configuré');
    return errorResponse('CONFIG_MISSING', 'La passerelle de paiement n\'est pas configurée.', 503);
  }

  const verify = await provider.verifyTransaction(reference);
  if (!verify.ok || !verify.status) {
    // Transaction pas encore connue du prestataire ou API momentanément indisponible : état connu, sans erreur bloquante.
    return jsonResponse({ ok: true, status: known, provider_unavailable: true });
  }

  const applied = await deps.admin().rpc('payment_apply_result', {
    p_internal_reference: reference, p_provider_transaction_id: reference, p_provider_status: verify.status,
    p_amount: verify.amount ?? null, p_currency: verify.currency ?? null, p_operator: verify.paymentMethod ?? null,
    p_phone_number: null, p_source: 'verify', p_provider_event_id: verify.operatorId ?? reference, p_raw: verify.raw,
  });
  if (applied.error) {
    deps.log('error', 'payment-verify', 'payment_apply_result a échoué', { reference });
    return jsonResponse({ ok: true, status: known });
  }
  const r = asObj(applied.data);
  if (!r.ok) return jsonResponse({ ok: true, status: known, mismatch: r.code });
  return jsonResponse({ ok: true, status: r.status });
}
