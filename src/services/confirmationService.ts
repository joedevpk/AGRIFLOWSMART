import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/logger';
import type { OrderAlternative, OrderEvent, OrderWithDetails } from '@/types';
import { failure, success, GENERIC_LOAD_ERROR, type ServiceResult } from './serviceResult';

export interface AlternativesResult { eligible: boolean; alternatives: OrderAlternative[] }

/** Alternatives RÉELLES (produits disponibles en base) pour une commande expirée / refusée — calcul serveur. */
export async function fetchOrderAlternatives(orderId: string): Promise<ServiceResult<AlternativesResult>> {
  try {
    const { data, error } = await supabase.rpc('order_alternatives', { p_order_id: orderId });
    if (error) {
      reportError('confirmationService.fetchOrderAlternatives', error.message);
      return failure('LOAD_FAILED', 'alt.error');
    }
    const payload = data as { ok?: boolean; eligible?: boolean; alternatives?: OrderAlternative[] } | null;
    if (!payload || payload.ok !== true) return failure('LOAD_FAILED', 'alt.error');
    return success({ eligible: payload.eligible === true, alternatives: (payload.alternatives ?? []).map((a) => ({ ...a, quantity: Number(a.quantity), price: Number(a.price) })) });
  } catch (err) {
    reportError('confirmationService.fetchOrderAlternatives', err);
    return failure('NETWORK', 'alt.error');
  }
}

/** Journal d'événements d'une commande (lecture seule, RLS : acheteur, producteur ou admin). */
export async function fetchOrderEvents(orderId: string): Promise<ServiceResult<OrderEvent[]>> {
  try {
    const { data, error } = await supabase.from('order_events').select('id, order_id, event_type, actor_id, metadata, created_at').eq('order_id', orderId).order('created_at', { ascending: true }).limit(100);
    if (error) {
      reportError('confirmationService.fetchOrderEvents', error.message);
      return failure('LOAD_FAILED', GENERIC_LOAD_ERROR);
    }
    return success((data ?? []) as OrderEvent[]);
  } catch (err) {
    reportError('confirmationService.fetchOrderEvents', err);
    return failure('NETWORK', GENERIC_LOAD_ERROR);
  }
}

export interface QueueOrder {
  id: string;
  order_number: string;
  buyer_id: string;
  producer_id: string;
  status: OrderWithDetails['status'];
  payment_status: OrderWithDetails['payment_status'];
  payment_method: OrderWithDetails['payment_method'];
  total_amount: number;
  currency: string;
  created_at: string;
  confirmation_deadline: string | null;
  confirmed_at: string | null;
  cancel_reason: OrderWithDetails['cancel_reason'];
  buyer_name: string | null;
  producer_name: string | null;
  producer_last_seen: string | null;
}

const QUEUE_COLUMNS = 'id, order_number, buyer_id, producer_id, status, payment_status, payment_method, total_amount, currency, created_at, confirmation_deadline, confirmed_at, cancel_reason';
export const QUEUE_PAGE_SIZE = 25;

/** Vue admin : commandes concernées par la confirmation (colonnes ciblées, paginées, RLS admin). */
export async function fetchConfirmationQueue(
  filter: 'pending' | 'soon' | 'expired' | 'confirmed',
  page: number,
  soonHours: number,
): Promise<ServiceResult<{ rows: QueueOrder[]; hasMore: boolean }>> {
  try {
    let query = supabase.from('orders').select(QUEUE_COLUMNS).order('confirmation_deadline', { ascending: filter !== 'expired' && filter !== 'confirmed', nullsFirst: false });
    if (filter === 'pending') query = query.eq('status', 'pending').not('confirmation_deadline', 'is', null);
    if (filter === 'soon') query = query.eq('status', 'pending').not('confirmation_deadline', 'is', null).lte('confirmation_deadline', new Date(Date.now() + soonHours * 3600_000).toISOString());
    if (filter === 'expired') query = query.eq('status', 'cancelled').eq('cancel_reason', 'confirmation_expired');
    if (filter === 'confirmed') query = query.not('confirmed_at', 'is', null).order('confirmed_at', { ascending: false });
    const from = page * QUEUE_PAGE_SIZE;
    const { data, error } = await query.range(from, from + QUEUE_PAGE_SIZE); // +1 ligne pour savoir s'il y a une page suivante
    if (error) {
      reportError('confirmationService.fetchConfirmationQueue', error.message);
      return failure('LOAD_FAILED', GENERIC_LOAD_ERROR);
    }
    const raw = (data ?? []) as Omit<QueueOrder, 'buyer_name' | 'producer_name' | 'producer_last_seen'>[];
    const hasMore = raw.length > QUEUE_PAGE_SIZE;
    const pageRows = raw.slice(0, QUEUE_PAGE_SIZE);
    const ids = Array.from(new Set(pageRows.flatMap((o) => [o.buyer_id, o.producer_id])));
    const names = new Map<string, string>();
    const seen = new Map<string, string | null>();
    if (ids.length > 0) {
      const [profiles, presence] = await Promise.all([
        supabase.from('profiles').select('user_id, full_name').in('user_id', ids),
        supabase.rpc('get_producer_presence', { p_user_ids: ids }),
      ]);
      (profiles.data ?? []).forEach((p: { user_id: string; full_name: string }) => names.set(p.user_id, p.full_name));
      ((presence.data ?? []) as { user_id: string; last_seen_at: string | null }[]).forEach((p) => seen.set(p.user_id, p.last_seen_at));
    }
    return success({
      hasMore,
      rows: pageRows.map((o) => ({
        ...o,
        total_amount: Number(o.total_amount),
        buyer_name: names.get(o.buyer_id) ?? null,
        producer_name: names.get(o.producer_id) ?? null,
        producer_last_seen: seen.get(o.producer_id) ?? null,
      })),
    });
  } catch (err) {
    reportError('confirmationService.fetchConfirmationQueue', err);
    return failure('NETWORK', GENERIC_LOAD_ERROR);
  }
}

export interface ConfirmationSettings { timeout_hours: number; reminder_after_hours: number; last_reminder_before_hours: number }

export async function fetchConfirmationSettings(): Promise<ConfirmationSettings | null> {
  const { data, error } = await supabase.rpc('get_order_confirmation_settings');
  if (error || !data) {
    if (error) reportError('confirmationService.fetchConfirmationSettings', error.message);
    return null;
  }
  const d = data as ConfirmationSettings;
  return { timeout_hours: Number(d.timeout_hours), reminder_after_hours: Number(d.reminder_after_hours), last_reminder_before_hours: Number(d.last_reminder_before_hours) };
}

export async function updateConfirmationSettings(s: ConfirmationSettings): Promise<ServiceResult<null>> {
  const { data, error } = await supabase.rpc('admin_update_order_confirmation_settings', { p_timeout: s.timeout_hours, p_reminder: s.reminder_after_hours, p_last: s.last_reminder_before_hours });
  if (error) {
    reportError('confirmationService.updateConfirmationSettings', error.message);
    return failure('UNAVAILABLE', GENERIC_LOAD_ERROR);
  }
  const payload = data as { ok?: boolean; code?: string } | null;
  return payload?.ok === true ? success(null) : failure(payload?.code ?? 'UNKNOWN', payload?.code === 'INVALID_SETTINGS' ? 'admin.queue.settingsInvalid' : GENERIC_LOAD_ERROR);
}
