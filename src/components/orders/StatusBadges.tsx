import { Badge } from '@/components/ui/Badge';
import type { OrderWithDetails } from '@/types';
import { DELIVERY_STATUS_LABELS, ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from '@/lib/constants';
import { paymentSummary } from '@/lib/order-workflow';

/** Les trois statuts distincts d'une commande : commande, paiement, livraison. */
export function OrderStatusBadge({ status }: { status: OrderWithDetails['status'] }) {
  return <Badge className={ORDER_STATUS_COLORS[status]} dot>{ORDER_STATUS_LABELS[status]}</Badge>;
}

export function PaymentBadge({ order }: { order: Pick<OrderWithDetails, 'payment_method' | 'payment_status' | 'status'> & { refunds?: OrderWithDetails['refunds'] } }) {
  const summary = paymentSummary(order.payment_method, order.payment_status, order.status, order.refunds?.[0]?.status ?? null);
  return <Badge variant={summary.tone}>{summary.label}</Badge>;
}

export function DeliveryBadge({ delivery }: { delivery: OrderWithDetails['delivery'] }) {
  if (!delivery) return <Badge variant="neutral">Livraison à confirmer</Badge>;
  const tone = delivery.status === 'delivered' ? 'success' : delivery.status === 'cancelled' ? 'neutral' : delivery.status === 'pending' ? 'neutral' : 'info';
  return <Badge variant={tone}>{DELIVERY_STATUS_LABELS[delivery.status]}</Badge>;
}
