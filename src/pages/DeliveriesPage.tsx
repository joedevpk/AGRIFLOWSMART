import { Link } from 'react-router-dom';
import { MapPin, Package, Truck } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardBody, EmptyState, DeliveryTimeline } from '@/components/ui';
import { LoadError, OrderSkeleton } from '@/components/orders/OrderStates';
import { DeliveryBadge, OrderStatusBadge } from '@/components/orders/StatusBadges';
import { useAuth } from '@/contexts/auth-context';
import { useOrders } from '@/hooks/useOrders';
import { formatDate, formatPrice } from '@/lib/constants';
import { orderThumb, orderTitle, shortOrderRef } from '@/lib/order-display';
import { deliveryEta, estimateDelivery, formatDeliveryAddress } from '@/services/deliveryService';

const TRACKED = ['confirmed', 'preparing', 'ready', 'in_delivery', 'delivered'] as const;

export function DeliveriesPage() {
  const { user, profile } = useAuth();
  const isProducer = profile?.role !== 'buyer';
  const { orders, loading, error, reload } = useOrders(isProducer ? 'producer' : 'buyer', user?.id);

  if (loading) {
    return (
      <DashboardLayout title="Livraisons">
        <OrderSkeleton />
      </DashboardLayout>
    );
  }
  if (error) {
    return (
      <DashboardLayout title="Livraisons">
        <LoadError title="Impossible de charger les livraisons" message={error} onRetry={() => void reload()} />
      </DashboardLayout>
    );
  }

  const tracked = orders.filter((o) => (TRACKED as readonly string[]).includes(o.status));

  return (
    <DashboardLayout title="Livraisons">
      <div className="space-y-4">
        {tracked.length === 0 ? (
          <Card>
            <CardBody>
              <EmptyState icon={<Truck className="h-8 w-8" />} title="Aucune livraison en cours." description="Vos livraisons apparaîtront ici dès qu'une commande est confirmée." />
            </CardBody>
          </Card>
        ) : (
          tracked.map((o) => {
            const eta = deliveryEta(o.delivery);
            const address = formatDeliveryAddress(o.delivery, o);
            return (
              <Card key={o.id}>
                <Link to={`/orders/${o.id}`} className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                  <CardBody>
                    <div className="flex items-center gap-4">
                      <img src={orderThumb(o)} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" loading="lazy" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-charcoal">{shortOrderRef(o)} · {orderTitle(o)}</p>
                        <p className="text-sm text-charcoal/50">
                          {isProducer ? 'Vers' : 'De'} : {isProducer ? o.buyer_profile?.full_name : o.producer_profile?.full_name}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-charcoal/50">
                          {address && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden="true" /> {address}</span>}
                          <span className="flex items-center gap-1"><Package className="h-3 w-3" aria-hidden="true" /> {eta ? `Prévu / livré : ${formatDate(eta)}` : estimateDelivery().label}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 text-right">
                        <p className="text-sm font-bold tabular-nums text-charcoal">{formatPrice(o.total_amount, o.currency)}</p>
                        <OrderStatusBadge status={o.status} />
                        <DeliveryBadge delivery={o.delivery} />
                      </div>
                    </div>
                    <div className="mt-4 border-t border-black/[0.06] pt-4">
                      <DeliveryTimeline status={o.status} destinationCity={o.delivery?.city ?? o.delivery_city} />
                    </div>
                  </CardBody>
                </Link>
              </Card>
            );
          })
        )}
      </div>
    </DashboardLayout>
  );
}
