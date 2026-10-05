import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { OrderQuickActions } from '@/components/orders/OrderQuickActions';
import { OrdersList } from '@/components/orders/OrdersList';
import { EmptyProducerOrders, LoadError, OrderSkeleton } from '@/components/orders/OrderStates';
import { useAuth } from '@/contexts/auth-context';
import { useOrders } from '@/hooks/useOrders';
import { useSeo } from '@/hooks/useSeo';
import { PAGE_SIZE } from '@/lib/pagination';
import { Button } from '@/components/ui';
import { PRODUCER_FILTERS } from '@/lib/order-workflow';

export function ProducerOrdersPage() {
  useSeo({ title: 'Mes commandes | AgriFlow RDC', noindex: true });
  const { user } = useAuth();
  const { orders, loading, error, reload, refresh, hasMore, loadMore, loadingMore } = useOrders('producer', user?.id, { pageSize: PAGE_SIZE.orders });

  return (
    <DashboardLayout title="Mes commandes">
      <p className="mb-4 text-sm text-charcoal/60">Retrouvez et traitez les commandes reçues de vos acheteurs.</p>
      {loading ? (
        <OrderSkeleton />
      ) : error ? (
        <LoadError title="Impossible de charger vos commandes" message={error} onRetry={() => void reload()} />
      ) : orders.length === 0 ? (
        <EmptyProducerOrders />
      ) : (
        <OrdersList
          orders={orders}
          viewer="producer"
          filters={PRODUCER_FILTERS}
          renderActions={(o) => <OrderQuickActions order={o} role="producer" onDone={refresh} />}
          emptyFiltered={<EmptyProducerOrders filtered />}
        />
      )}
      {!loading && !error && hasMore && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" loading={loadingMore} onClick={() => void loadMore()}>Voir les commandes plus anciennes</Button>
        </div>
      )}
    </DashboardLayout>
  );
}
