import { PAGE_SIZE, pageRange, sliceHasMore } from '@/lib/pagination';
import { NOTIFICATION_COLUMNS } from '@/lib/columns';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/logger';
import type { Notification } from '@/types';
import { GENERIC_LOAD_ERROR, failure, success, type ServiceResult } from './serviceResult';

/**
 * Notifications. Les notifications liées aux commandes sont créées par les RPC
 * PostgreSQL (`create_order_from_cart`, `transition_order_status`, …) lors de vrais
 * événements ; le client ne fait que lire et marquer comme lues (RLS : propriétaire).
 */
export interface NotificationsPage { items: Notification[]; hasMore: boolean }

/** Une page de notifications (la plus récente d'abord) ; `size + 1` lignes demandées pour savoir s'il y a une suite. */
export async function fetchNotifications(userId: string, page = 0, size: number = PAGE_SIZE.notifications): Promise<ServiceResult<NotificationsPage>> {
  try {
    const [from, to] = pageRange(page, size);
    const { data, error } = await supabase
      .from('notifications')
      .select(NOTIFICATION_COLUMNS)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);
    if (error) {
      reportError('notificationService.fetchNotifications', error.message, { fn: 'fetchNotifications' });
      return failure('LOAD_FAILED', GENERIC_LOAD_ERROR);
    }
    const { items, hasMore } = sliceHasMore(data as Notification[] | null, size);
    return success({ items, hasMore });
  } catch (err) {
    reportError('notificationService.fetchNotifications', err);
    return failure('NETWORK', GENERIC_LOAD_ERROR);
  }
}

export async function markNotificationRead(id: string): Promise<boolean> {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  if (error) reportError('notificationService.markNotificationRead', error.message);
  return !error;
}

export async function markAllNotificationsRead(userId: string): Promise<boolean> {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false);
  if (error) reportError('notificationService.markAllNotificationsRead', error.message);
  return !error;
}
