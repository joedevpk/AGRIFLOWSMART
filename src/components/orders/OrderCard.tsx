import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronRight, MapPin } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import type { OrderWithDetails } from '@/types';
import { formatDate, formatPrice } from '@/lib/constants';
import { orderQuantitySummary, orderThumb, orderTitle, shortOrderRef } from '@/lib/order-display';
import { DeliveryBadge, OrderStatusBadge, PaymentBadge } from './StatusBadges';

interface OrderCardProps {
  order: OrderWithDetails;
  /** Qui consulte : détermine quelle partie adverse est affichée. */
  viewer: 'buyer' | 'producer';
  /** Actions rapides (ex. « Confirmer ») affichées sous la carte, hors du lien. */
  actions?: ReactNode;
}

export function OrderCard({ order, viewer, actions }: OrderCardProps) {
  const counterpart = viewer === 'producer' ? order.buyer_profile : order.producer_profile;
  const counterpartLabel = viewer === 'producer' ? 'Acheteur' : 'Producteur';
  const city = order.delivery?.city ?? order.delivery_city;

  return (
    <Card>
      <Link
        to={`/orders/${order.id}`}
        aria-label={`Ouvrir la commande ${shortOrderRef(order)}`}
        className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <div className="flex items-start gap-4 p-4 sm:p-5">
          <img src={orderThumb(order)} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover sm:h-20 sm:w-20" loading="lazy" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-xs font-semibold tabular-nums text-charcoal/50">{shortOrderRef(order)}</p>
              <OrderStatusBadge status={order.status} />
            </div>
            <p className="mt-1 truncate font-semibold text-charcoal">{orderTitle(order)}</p>
            <p className="text-sm text-charcoal/60">
              {orderQuantitySummary(order)} · <span className="font-semibold text-brand-700">{formatPrice(order.total_amount, order.currency)}</span>
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-charcoal/50">
              <span>{counterpartLabel} : {counterpart?.full_name ?? '—'}</span>
              <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" aria-hidden="true" /> {formatDate(order.created_at)}</span>
              {city && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden="true" /> {city}</span>}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <PaymentBadge order={order} />
              <DeliveryBadge delivery={order.delivery} />
            </div>
          </div>
          <ChevronRight className="mt-1 hidden h-5 w-5 shrink-0 text-charcoal/30 sm:block" aria-hidden="true" />
        </div>
      </Link>
      {actions && <div className="flex flex-wrap gap-2 border-t border-black/[0.06] px-4 py-3 sm:px-5">{actions}</div>}
    </Card>
  );
}
