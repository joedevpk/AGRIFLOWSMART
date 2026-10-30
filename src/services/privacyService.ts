import { downloadTextFile } from '@/lib/native/files';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/logger';
import { failure, success, type ServiceResult } from '@/services/serviceResult';
import type { Profile } from '@/types';

/**
 * Services « Mes données et ma confidentialité ».
 * Tout passe par le client Supabase authentifié : les règles d'accès (RLS) s'appliquent, un utilisateur
 * ne peut donc jamais lire ni modifier les données d'un autre. Aucune suppression n'est faite ici :
 * la suppression de compte est une DEMANDE, examinée manuellement (voir la migration 20260928210000).
 */

export type DeletionStatus = 'requested' | 'processing';

export interface DeletionRequest {
  id: string;
  status: DeletionStatus;
  created_at: string;
  active_orders_count: number;
}

const OPEN_STATUSES = ['requested', 'processing'];

export async function getOpenDeletionRequest(userId: string): Promise<ServiceResult<DeletionRequest | null>> {
  try {
    const { data, error } = await supabase
      .from('account_deletion_requests')
      .select('id, status, created_at, active_orders_count')
      .eq('user_id', userId)
      .in('status', OPEN_STATUSES)
      .maybeSingle();
    if (error) { reportError('privacyService.getOpenDeletionRequest', error.message); return failure('UNAVAILABLE', 'Impossible de vérifier l\'état de votre demande pour le moment.'); }
    return success((data as DeletionRequest | null) ?? null);
  } catch (err) {
    reportError('privacyService.getOpenDeletionRequest', err);
    return failure('NETWORK', 'Impossible de vérifier l\'état de votre demande pour le moment.');
  }
}

/** Nombre de commandes non terminées (acheteur ou producteur) : affiché avant la confirmation. */
export async function countActiveOrders(userId: string): Promise<ServiceResult<number>> {
  try {
    const { count, error } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .or(`buyer_id.eq.${userId},producer_id.eq.${userId}`)
      .not('status', 'in', '(completed,cancelled)');
    if (error) { reportError('privacyService.countActiveOrders', error.message); return failure('UNAVAILABLE', 'Impossible de compter vos commandes en cours.'); }
    return success(count ?? 0);
  } catch (err) {
    reportError('privacyService.countActiveOrders', err);
    return failure('NETWORK', 'Impossible de compter vos commandes en cours.');
  }
}

const DELETION_MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: 'Votre session a expiré. Reconnectez-vous puis réessayez.',
  ALREADY_REQUESTED: 'Une demande de suppression est déjà en cours pour votre compte.',
  REASON_TOO_LONG: 'Le motif est trop long (500 caractères maximum).',
  NOT_CANCELLABLE: 'Cette demande ne peut plus être annulée : elle est déjà en cours de traitement.',
};

async function callRpc(name: string, args?: Record<string, unknown>): Promise<ServiceResult<null>> {
  try {
    const { data, error } = await supabase.rpc(name, args);
    if (error) { reportError(`privacyService.${name}`, error.message); return failure('UNAVAILABLE', 'L\'opération n\'a pas pu aboutir pour le moment. Réessayez plus tard.'); }
    const res = data as { ok?: boolean; code?: string } | null;
    if (res?.ok) return success(null);
    const code = res?.code ?? 'UNKNOWN';
    return failure(code, DELETION_MESSAGES[code] ?? 'L\'opération n\'a pas pu aboutir.');
  } catch (err) {
    reportError(`privacyService.${name}`, err);
    return failure('NETWORK', 'Connexion impossible. Vérifiez votre réseau puis réessayez.');
  }
}

export const requestAccountDeletion = (reason: string): Promise<ServiceResult<null>> => callRpc('request_account_deletion', { p_reason: reason.trim() || null });
export const cancelAccountDeletion = (): Promise<ServiceResult<null>> => callRpc('cancel_account_deletion');

/* ------------------------------------------------------------------ */
/*  Export des données (copie au format JSON)                          */
/* ------------------------------------------------------------------ */

const EXPORT_LIMIT = 5000;

type Rows = unknown[] | { error: string };

async function fetchRows(label: string, run: () => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<Rows> {
  try {
    const { data, error } = await run();
    if (error) { reportError(`privacyService.export.${label}`, error.message); return { error: 'Non disponible' }; }
    return data ?? [];
  } catch (err) {
    reportError(`privacyService.export.${label}`, err);
    return { error: 'Non disponible' };
  }
}

const idsOf = (rows: Rows): string[] => (Array.isArray(rows) ? (rows as { id?: string }[]).map((r) => r.id).filter((v): v is string => typeof v === 'string') : []);

/**
 * Rassemble les données rattachées au compte connecté. Chaque requête est filtrée sur l'utilisateur ET
 * protégée par RLS. Exclus volontairement : jetons, secrets, liens de paiement, métadonnées techniques.
 */
export async function buildDataExport(userId: string, email: string | undefined, profile: Profile | null): Promise<ServiceResult<Record<string, unknown>>> {
  try {
    const me = userId;
    const orders = await fetchRows('orders', () => supabase.from('orders').select('*').or(`buyer_id.eq.${me},producer_id.eq.${me}`).limit(EXPORT_LIMIT));
    const orderIds = idsOf(orders);
    const byOrder = <T extends string>(table: T, columns = '*') => fetchRows(table, () => (orderIds.length === 0 ? Promise.resolve({ data: [], error: null }) : supabase.from(table).select(columns).in('order_id', orderIds).limit(EXPORT_LIMIT)));

    const [products, requests, favorites, notifications, messages, reviews, plots, notes, progress, myPayments, orderItems, history, deliveries, refunds, deletion] = await Promise.all([
      fetchRows('products', () => supabase.from('products').select('*').eq('user_id', me).limit(EXPORT_LIMIT)),
      fetchRows('buyer_requests', () => supabase.from('buyer_requests').select('*').eq('user_id', me).limit(EXPORT_LIMIT)),
      fetchRows('favorites', () => supabase.from('favorites').select('*').eq('user_id', me).limit(EXPORT_LIMIT)),
      fetchRows('notifications', () => supabase.from('notifications').select('*').eq('user_id', me).limit(EXPORT_LIMIT)),
      fetchRows('messages', () => supabase.from('messages').select('*').or(`sender_id.eq.${me},receiver_id.eq.${me}`).limit(EXPORT_LIMIT)),
      fetchRows('reviews', () => supabase.from('reviews').select('*').or(`reviewer_id.eq.${me},reviewee_id.eq.${me}`).limit(EXPORT_LIMIT)),
      fetchRows('user_plots', () => supabase.from('user_plots').select('*').eq('user_id', me).limit(EXPORT_LIMIT)),
      fetchRows('plot_notes', () => supabase.from('plot_notes').select('*').eq('user_id', me).limit(EXPORT_LIMIT)),
      fetchRows('learning_progress', () => supabase.from('learning_progress').select('*').eq('user_id', me).limit(EXPORT_LIMIT)),
      fetchRows('payments', () => supabase.from('payments').select('id, order_id, amount, currency, method, status, provider, internal_reference, provider_status, operator, phone_number, created_at, paid_at, failed_at, cancelled_at, refunded_at').eq('user_id', me).limit(EXPORT_LIMIT)),
      byOrder('order_items'),
      byOrder('order_status_history'),
      byOrder('deliveries'),
      byOrder('refunds'),
      fetchRows('account_deletion_requests', () => supabase.from('account_deletion_requests').select('id, status, reason, created_at, processed_at').eq('user_id', me).limit(50)),
    ]);

    return success({
      _export: {
        application: 'AgriFlow RDC',
        generated_at: new Date().toISOString(),
        note: 'Copie des données rattachées à votre compte, limitée à ce que les règles d\'accès vous autorisent à lire. Chaque liste est plafonnée à ' + EXPORT_LIMIT + ' éléments. Les jetons de session, secrets et liens de paiement en sont exclus.',
      },
      account: { user_id: userId, email: email ?? null },
      profile,
      products,
      buyer_requests: requests,
      favorites,
      orders,
      order_items: orderItems,
      order_status_history: history,
      deliveries,
      payments: myPayments,
      refunds,
      messages,
      notifications,
      reviews,
      plots,
      plot_notes: notes,
      learning_progress: progress,
      account_deletion_requests: deletion,
    });
  } catch (err) {
    reportError('privacyService.buildDataExport', err);
    return failure('NETWORK', 'L\'export n\'a pas pu être préparé. Vérifiez votre connexion puis réessayez.');
  }
}

/** Déclenche le téléchargement d'un objet JSON côté navigateur (aucune donnée n'est envoyée à un tiers). */
/** Télécharge (Web) ou partage via le système (application native) la copie des données au format JSON. */
export async function downloadJson(filename: string, payload: unknown): Promise<void> {
  await downloadTextFile({ filename, mimeType: 'application/json', content: JSON.stringify(payload, null, 2), shareTitle: 'Mes données AgriFlow RDC' });
}
