import { Link } from 'react-router-dom';
import { Banknote, CreditCard, FlaskConical } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardBody, StatCard, EmptyState } from '@/components/ui';
import { DemoNotice } from '@/components/orders/DemoNotice';
import { LoadError, OrderSkeleton } from '@/components/orders/OrderStates';
import { OrderStatusBadge, PaymentBadge } from '@/components/orders/StatusBadges';
import { useAuth } from '@/contexts/auth-context';
import { useOrders } from '@/hooks/useOrders';
import { PAYMENT_METHOD_LABELS, formatDate, formatPrice } from '@/lib/constants';
import { orderThumb, orderTitle, shortOrderRef, sumByCurrency } from '@/lib/order-display';

export function PaymentsPage() {
  const { user, profile } = useAuth();
  const isProducer = profile?.role !== 'buyer';
  const { orders, loading, error, reload } = useOrders(isProducer ? 'producer' : 'buyer', user?.id);

  if (loading) {
    return (
      <DashboardLayout title="Paiements">
        <OrderSkeleton />
      </DashboardLayout>
    );
  }
  if (error) {
    return (
      <DashboardLayout title="Paiements">
        <LoadError title="Impossible de charger les paiements" message={error} onRetry={() => void reload()} />
      </DashboardLayout>
    );
  }

  const active = orders.filter((o) => o.status !== 'cancelled');
  const real = active.filter((o) => o.payment_status === 'paid');
  const demo = active.filter((o) => o.payment_status === 'demo_paid');
  const cashPending = active.filter((o) => o.payment_method === 'cash_on_delivery' && o.payment_status === 'pending');

  return (
    <DashboardLayout title="Paiements">
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label={isProducer ? 'Encaissé (réel)' : 'Payé (réel)'} value={sumByCurrency(real)} icon={<Banknote className="h-5 w-5" />} accent="emerald" />
          <StatCard label="Paiements de démonstration" value={sumByCurrency(demo)} icon={<FlaskConical className="h-5 w-5" />} accent="amber" />
          <StatCard label="À régler à la livraison" value={cashPending.length} icon={<CreditCard className="h-5 w-5" />} accent="brand" />
        </div>

        {demo.length > 0 && <DemoNotice>Les montants « démonstration » sont simulés : aucun paiement réel n'a été effectué.</DemoNotice>}

        {orders.length === 0 ? (
          <Card>
            <CardBody>
              <EmptyState
                icon={<CreditCard className="h-8 w-8" />}
                title="Aucun paiement pour le moment."
                description={isProducer ? 'Les paiements de vos commandes apparaîtront ici.' : 'Les paiements de vos commandes apparaîtront ici après votre premier achat.'}
              />
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-3">
            {orders.map((o) => (
              <Link key={o.id} to={`/orders/${o.id}`} className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                <Card hover>
                  <CardBody className="flex items-center gap-4">
                    <img src={orderThumb(o)} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" loading="lazy" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-charcoal">{shortOrderRef(o)} · {orderTitle(o)}</p>
                      <p className="text-sm text-charcoal/50">{formatDate(o.updated_at)} · {o.payment_method ? PAYMENT_METHOD_LABELS[o.payment_method] : '—'}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 text-right">
                      <p className="text-lg font-bold tabular-nums text-charcoal">{formatPrice(o.total_amount, o.currency)}</p>
                      <PaymentBadge order={o} />
                      <OrderStatusBadge status={o.status} />
                    </div>
                  </CardBody>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
