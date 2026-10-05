import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { OrderQuickActions } from '@/components/orders/OrderQuickActions';
import { OrdersList } from '@/components/orders/OrdersList';
import { EmptyOrders, EmptyOrdersFiltered, LoadError, OrderSkeleton } from '@/components/orders/OrderStates';
import { useAuth } from '@/contexts/auth-context';
import { useOrders } from '@/hooks/useOrders';
import { useSeo } from '@/hooks/useSeo';
import { PAGE_SIZE } from '@/lib/pagination';
import { Button } from '@/components/ui';
import { BUYER_FILTERS } from '@/lib/order-workflow';

export function BuyerOrdersPage() {
  useSeo({ title: 'Mes commandes | AgriFlow RDC', noindex: true });
  const { user } = useAuth();
  const { orders, loading, error, reload, refresh, hasMore, loadMore, loadingMore } = useOrders('buyer', user?.id, { pageSize: PAGE_SIZE.orders });

  return (
    <DashboardLayout title="Mes commandes">
      <p className="mb-4 text-sm text-charcoal/60">Retrouvez et suivez toutes vos commandes.</p>
      {loading ? (
        <OrderSkeleton />
      ) : error ? (
        <LoadError title="Impossible de charger vos commandes" message={error} onRetry={() => void reload()} />
      ) : orders.length === 0 ? (
        <EmptyOrders />
      ) : (
        <OrdersList
          orders={orders}
          viewer="buyer"
          filters={BUYER_FILTERS}
          renderActions={(o) => <OrderQuickActions order={o} role="buyer" onDone={refresh} />}
          emptyFiltered={<EmptyOrdersFiltered />}
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
