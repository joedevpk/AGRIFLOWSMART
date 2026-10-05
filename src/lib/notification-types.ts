/**
 * Catégories de notifications, déduites du `type` réellement écrit par la base
 * (`new_order`, `order_<statut>`, `payment_*`, `refund_*`). Aucun type n'est inventé :
 * les types inconnus tombent dans « Système ».
 */
export type NotificationCategory = 'order' | 'payment' | 'delivery' | 'agrimatch' | 'agri' | 'system';

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  order: 'Commande',
  payment: 'Paiement',
  delivery: 'Livraison',
  agrimatch: 'Agri-Match',
  agri: 'Agriculture',
  system: 'Système',
};

export function notificationCategory(type: string): NotificationCategory {
  if (type === 'order_in_delivery' || type === 'order_delivered') return 'delivery';
  if (type === 'new_order' || type.startsWith('order_')) return 'order';
  if (type.startsWith('payment_') || type.startsWith('refund_')) return 'payment';
  if (type.startsWith('agrimatch') || type.startsWith('match')) return 'agrimatch';
  if (type.startsWith('agri') || type.startsWith('plot') || type.startsWith('crop')) return 'agri';
  return 'system';
}

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = ['order', 'payment', 'delivery', 'agrimatch', 'agri', 'system'];

/** Clé i18n de la catégorie (`notif.cat.*`). */
export function notificationCategoryKey(category: NotificationCategory): string {
  return `notif.cat.${category}`;
}

/** Clé i18n du bouton d'action d'une notification (le lien lui-même vient de `notifications.link`). */
export function notificationActionKey(type: string): string {
  if (type === 'new_order' || type === 'order_to_confirm' || type === 'order_reminder' || type === 'order_last_reminder') return 'notif.action.confirm';
  if (type === 'order_expired' || type === 'order_cancelled') return 'notif.action.alternatives';
  if (type === 'new_order' || type.startsWith('order_') || type.startsWith('payment_')) return 'notif.action.viewOrder';
  return 'notif.action.view';
}
