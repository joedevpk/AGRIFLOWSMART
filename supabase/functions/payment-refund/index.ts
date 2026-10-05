// Edge Function : payment-refund
//
// CinetPay ne documente pas d'API de remboursement automatique généralisée pour
// le Mobile Money en RDC au moment de cette implémentation (section 26 du
// cahier des charges : ne jamais prétendre qu'un remboursement automatique
// existe s'il n'est pas réellement intégré). Cette fonction est donc le POINT
// D'ENTRÉE UNIQUE pour le cycle de remboursement : aujourd'hui elle enregistre
// la décision admin via `admin_process_refund` (RLS : is_admin() uniquement) ;
// si CinetPay expose un jour une API de remboursement pour le compte marchand,
// l'appel réel s'ajoute ICI, entre la vérification admin et la mise à jour de
// `refunds.status`, sans changer le contrat de cette fonction pour le frontend.

import { supabaseAsUser } from '../_shared/supabaseAdmin.ts';
import { CORS_HEADERS, errorResponse, jsonResponse, logEvent } from '../_shared/http.ts';

interface RequestBody {
  refund_id?: string;
  new_status?: 'processing' | 'completed' | 'failed';
  provider_reference?: string;
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
  if (!body.refund_id || !body.new_status) {
    return errorResponse('INVALID_REQUEST', 'refund_id et new_status sont requis.');
  }

  const userClient = supabaseAsUser(authHeader);

  // `admin_process_refund` revérifie elle-même is_admin() côté serveur : cet
  // appel échoue proprement (FORBIDDEN) pour tout appelant non-admin, même si
  // le JWT est valide.
  const { data, error } = await userClient.rpc('admin_process_refund', {
    p_refund_id: body.refund_id,
    p_new_status: body.new_status,
    p_provider_reference: body.provider_reference ?? null,
  });

  if (error) {
    logEvent('error', 'payment-refund', 'admin_process_refund a échoué', { refundId: String(body.refund_id) });
    return errorResponse('UNAVAILABLE', 'Service momentanément indisponible.', 503);
  }
  if (!data?.ok) {
    return jsonResponse({ ok: false, code: data?.code ?? 'UNKNOWN' }, 400);
  }

  return jsonResponse({ ok: true });
});
