// Edge Function : order-confirmation-cron  (Passe 23)
//
// Tâche serveur planifiée (toutes les 10 min recommandé) :
//   1. appelle la RPC `run_order_confirmation_maintenance` (rappels producteur + expiration des commandes
//      non confirmées ; idempotente, rejouable sans effet) ;
//   2. envoie par E-MAIL les notifications éligibles, UNIQUEMENT si un fournisseur est réellement configuré
//      (secrets RESEND_API_KEY + EMAIL_FROM). Sinon le canal est ignoré proprement : rien n'est écrit,
//      rien n'est prétendu envoyé ;
//   3. SMS / push : aucun fournisseur n'est intégré — ces canaux sont ignorés (statut « not_configured »
//      dans la réponse, aucune ligne notification_deliveries).
//
// Sécurité : requête refusée sans l'en-tête `x-cron-secret` égal au secret CRON_SECRET (fail closed si le
// secret n'est pas défini). La clé service_role n'existe que dans les secrets de la fonction.
//
// Planification (au choix, les deux peuvent coexister) :
//   - Supabase Dashboard > Edge Functions > order-confirmation-cron > Schedule ;
//   - ou pg_cron + pg_net : select cron.schedule('agriflow-cron-http','*/10 * * * *', $$ select net.http_post(
//       url := 'https://<ref>.supabase.co/functions/v1/order-confirmation-cron',
//       headers := jsonb_build_object('x-cron-secret','<CRON_SECRET>','Content-Type','application/json')) $$);

import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { CORS_HEADERS, errorResponse, fetchExternal, jsonResponse, logEvent } from '../_shared/http.ts';
import { cinetpayVerifyPayment, loadCinetpayConfig } from '../_shared/cinetpay.ts';

interface PendingEmail {
  notification_id: string;
  user_id: string;
  email: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
}

function escapeHtml(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function sendEmailResend(apiKey: string, from: string, to: string, subject: string, html: string): Promise<{ ok: boolean; reason?: string }> {
  // Délai maximal 10 s, aucune boucle : les nouvelles tentatives sont gérées par la file (3 essais maximum, voir record_notification_delivery).
  const res = await fetchExternal('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html }),
  }, { retries: 0 });
  return res.ok ? { ok: true } : { ok: false, reason: res.failure ? `${res.failure}_${res.status}` : `http_${res.status}` };
}

/**
 * Réconciliation : un webhook CinetPay perdu laisserait un paiement `processing` alors que le client a payé.
 * On revérifie auprès du prestataire les paiements `processing` créés il y a 10 min à 48 h (20 au maximum par passage),
 * via la même RPC idempotente que le webhook. Ignoré proprement si CinetPay n'est pas configuré.
 */
async function reconcileProcessingPayments(admin: ReturnType<typeof supabaseAdmin>): Promise<{ configured: boolean; checked: number; applied: number }> {
  let config;
  try { config = loadCinetpayConfig(); } catch { return { configured: false, checked: 0, applied: 0 }; }
  const { data: stale, error } = await admin
    .from('payments')
    .select('internal_reference')
    .eq('status', 'processing')
    .lt('created_at', new Date(Date.now() - 10 * 60_000).toISOString())
    .gt('created_at', new Date(Date.now() - 48 * 3600_000).toISOString())
    .order('created_at', { ascending: true })
    .limit(20);
  if (error) { logEvent('error', 'order-confirmation-cron', 'lecture des paiements à réconcilier impossible'); return { configured: true, checked: 0, applied: 0 }; }
  let applied = 0;
  for (const p of stale ?? []) {
    const verify = await cinetpayVerifyPayment(config, p.internal_reference as string);
    if (!verify.ok || !verify.status) continue; // prestataire indisponible ou transaction inconnue : on réessaiera au prochain passage
    const { data } = await admin.rpc('payment_apply_result', {
      p_internal_reference: p.internal_reference, p_provider_transaction_id: p.internal_reference, p_provider_status: verify.status,
      p_amount: verify.amount ?? null, p_currency: verify.currency ?? null, p_operator: verify.paymentMethod ?? null, p_phone_number: null,
      p_source: 'verify', p_provider_event_id: verify.operatorId ?? p.internal_reference, p_raw: verify.raw,
    });
    if (data?.ok && !data?.duplicate && !data?.noop) applied += 1;
  }
  return { configured: true, checked: (stale ?? []).length, applied };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return errorResponse('METHOD_NOT_ALLOWED', 'POST uniquement.', 405);

  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return errorResponse('FORBIDDEN', 'Accès refusé.', 403);
  }

  const admin = supabaseAdmin();

  const { data: maintenance, error: maintenanceError } = await admin.rpc('run_order_confirmation_maintenance');
  if (maintenanceError || !maintenance?.ok) {
    logEvent('error', 'order-confirmation-cron', 'tâche de confirmation en échec', { code: String((maintenance as { code?: string } | null)?.code ?? maintenanceError?.code ?? 'UNKNOWN') });
    return errorResponse('MAINTENANCE_FAILED', 'La tâche de confirmation a échoué.', 500);
  }

  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM');
  const siteUrl = (Deno.env.get('SITE_URL') ?? '').replace(/\/$/, '');
  const emailConfigured = Boolean(apiKey && from);

  const email = { configured: emailConfigured, sent: 0, failed: 0 };
  if (emailConfigured) {
    const { data: pending, error } = await admin.rpc('notifications_pending_email', { p_since: '48 hours', p_limit: 100 });
    if (error) {
      logEvent('error', 'order-confirmation-cron', 'lecture de la file e-mail impossible');
    } else {
      for (const n of (pending ?? []) as PendingEmail[]) {
        const link = n.link && siteUrl ? `${siteUrl}${n.link}` : null;
        const html = `<div style="font-family:Arial,sans-serif;color:#20251F;max-width:520px">`
          + `<h2 style="color:#163A24;margin:0 0 12px">${escapeHtml(n.title)}</h2>`
          + (n.body ? `<p style="line-height:1.5">${escapeHtml(n.body)}</p>` : '')
          + (link ? `<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#2F6B3B;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none">Voir la commande</a></p>` : '')
          + `<p style="font-size:12px;color:#666">AgriFlow RDC</p></div>`;
        const result = await sendEmailResend(apiKey!, from!, n.email, `AgriFlow — ${n.title}`, html);
        await admin.rpc('record_notification_delivery', {
          p_notification_id: n.notification_id, p_channel: 'email', p_provider: 'resend',
          p_status: result.ok ? 'sent' : 'failed', p_failure_reason: result.ok ? null : (result.reason ?? 'unknown'),
        });
        if (result.ok) email.sent += 1; else email.failed += 1;
      }
    }
  }

  const reconciliation = await reconcileProcessingPayments(admin);

  return jsonResponse({
    ok: true,
    maintenance,
    reconciliation,
    channels: {
      in_app: 'active',
      email: emailConfigured ? email : 'not_configured',
      sms: 'not_configured',
      push: 'not_configured',
    },
  });
});
