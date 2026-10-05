import type { OrderItem, OrderWithDetails } from '@/types';
import { formatPrice, formatQuantity } from '@/lib/constants';
import { getProductImage } from '@/lib/image-config';

/** Aides d'affichage d'une commande à partir de ses lignes (instantané au moment de l'achat). */

export function orderTitle(order: Pick<OrderWithDetails, 'order_items'>): string {
  const [first, ...rest] = order.order_items;
  if (!first) return 'Commande';
  return rest.length === 0 ? first.product_name : `${first.product_name} et ${rest.length} autre${rest.length > 1 ? 's' : ''}`;
}

export function orderQuantitySummary(order: Pick<OrderWithDetails, 'order_items'>): string {
  const items = order.order_items;
  if (items.length === 0) return '—';
  if (items.length === 1) return formatQuantity(items[0].quantity, items[0].unit);
  return `${items.length} produits`;
}

export function itemImage(item: Pick<OrderItem, 'product_image' | 'product_name'>): string {
  return item.product_image || getProductImage(item.product_name);
}

export function orderThumb(order: Pick<OrderWithDetails, 'order_items'>): string {
  const first = order.order_items[0];
  return first ? itemImage(first) : getProductImage('');
}

export function shortOrderRef(order: Pick<OrderWithDetails, 'order_number'>): string {
  return `#${order.order_number}`;
}

/** Somme des montants par devise (jamais d'addition entre devises différentes). */
export function sumByCurrency(orders: Pick<OrderWithDetails, 'total_amount' | 'currency'>[]): string {
  const totals = new Map<string, number>();
  for (const o of orders) totals.set(o.currency, (totals.get(o.currency) ?? 0) + o.total_amount);
  if (totals.size === 0) return formatPrice(0);
  return Array.from(totals.entries())
    .map(([currency, amount]) => formatPrice(amount, currency))
    .join(' + ');
}
