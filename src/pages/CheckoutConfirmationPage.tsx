import { openCheckoutPage } from '@/lib/native/browser';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Lock, Package } from 'lucide-react';
import { Header, Footer } from '@/components/layout/Header';
import { Card, CardBody, EmptyState, buttonStyles, Button } from '@/components/ui';
import { CheckoutStepper } from '@/components/orders/CheckoutStepper';
import { DemoNotice } from '@/components/orders/DemoNotice';
import { OrderDetailSkeleton, LoadError } from '@/components/orders/OrderStates';
import { OrderStatusBadge, PaymentBadge } from '@/components/orders/StatusBadges';
import { toast } from '@/components/ui/toast-store';
import { useAuth } from '@/contexts/auth-context';
import type { OrderWithDetails } from '@/types';
import { formatDate, formatPrice } from '@/lib/constants';
import { useSeo } from '@/hooks/useSeo';
import { orderQuantitySummary, orderTitle, shortOrderRef } from '@/lib/order-display';
import { isDemoPayment } from '@/lib/order-workflow';
import { formatDeliveryAddress } from '@/services/deliveryService';
import { fetchOrdersByCheckout } from '@/services/orderService';
import { initiatePayment, isOnlineMethod } from '@/services/paymentService';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function CheckoutConfirmationPage() {
  useSeo({ title: 'Commande enregistrée | AgriFlow RDC', noindex: true });
  const { checkoutId } = useParams<{ checkoutId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [orders, setOrders] = useState<OrderWithDetails[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [payingOrderId, setPayingOrderId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !checkoutId || !UUID.test(checkoutId)) {
      setOrders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await fetchOrdersByCheckout(checkoutId, user.id);
    if (result.ok) {
      setOrders(result.data);
      setError(null);
    } else {
      setError(result.message);
    }
    setLoading(false);
  }, [checkoutId, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = (orders ?? []).reduce((sum, o) => sum + o.total_amount, 0);
  const currency = orders?.[0]?.currency ?? 'USD';
  const anyDemo = (orders ?? []).some((o) => o.payments.some((p) => p.is_demo) || isDemoPayment(o.payment_status));

  // Une commande a un paiement en ligne à finaliser si elle utilise Mobile Money /
  // carte et que le paiement n'est pas encore réglé. Le montant à payer vient
  // TOUJOURS du serveur (payment-initiate → payment_initiate_begin), jamais d'ici.
  const needsOnlinePayment = (o: OrderWithDetails) =>
    isOnlineMethod(o.payment_method) && !['paid', 'refunded'].includes(o.payment_status);

  const payNow = async (order: OrderWithDetails) => {
    if (!isOnlineMethod(order.payment_method) || payingOrderId) return;
    setPayingOrderId(order.id);
    const result = await initiatePayment({
      orderId: order.id,
      paymentMethod: order.payment_method as 'mobile_money' | 'card',
    });
    if (!result.ok) {
      toast('error', result.message);
      setPayingOrderId(null);
      return;
    }
    // Page de paiement hébergée par le prestataire. Web : la page est remplacée ; application native : navigateur intégré.
    // Dans les deux cas le retour passe par /payment/result/:reference, qui VÉRIFIE le paiement côté serveur.
    try {
      const opened = await openCheckoutPage({ url: result.data.checkoutUrl, reference: result.data.internalReference, navigate });
      if (!opened) toast('error', 'L\'adresse de paiement reçue est invalide. Réessayez ou choisissez un autre moyen de paiement.');
    } catch {
      toast('error', 'Impossible d\'ouvrir la page de paiement. Aucun montant n\'a été débité. Réessayez.');
    }
    setPayingOrderId(null);
  };

  return (
    <div className="min-h-screen bg-cream transition-colors dark:bg-charcoal">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-6 pb-28 sm:px-6 lg:py-10">
        <div className="mb-6">
          <CheckoutStepper current={4} />
        </div>

        {loading ? (
          <OrderDetailSkeleton />
        ) : error ? (
          <LoadError title="Impossible de charger votre confirmation" message={error} onRetry={() => void load()} />
        ) : !orders || orders.length === 0 ? (
          <Card>
            <CardBody>
              <EmptyState
                icon={<Package className="h-8 w-8" />}
                title="Commande introuvable"
                description="Cette confirmation n'existe pas ou ne vous appartient pas. Retrouvez vos commandes dans votre espace."
                action={<Link to="/buyer/orders" className={buttonStyles({ variant: 'primary', size: 'lg' })}>Voir mes commandes</Link>}
              />
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-4">
            <Card>
              <CardBody className="flex flex-col items-center gap-2 py-8 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                  <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
                </span>
                <h1 className="text-2xl font-extrabold text-charcoal">Commande enregistrée</h1>
                <p className="max-w-md text-sm text-charcoal/60">
                  {orders.length > 1
                    ? `Votre panier contenait des produits de ${orders.length} producteurs : une commande a été créée pour chacun.`
                    : orders.some(needsOnlinePayment)
                      ? 'Il ne reste plus qu\'à régler le paiement pour que le producteur soit notifié.'
                      : 'Le producteur a été notifié. Vous serez averti dès qu\'il confirme votre commande.'}
                </p>
                <p className="mt-1 text-lg font-extrabold tabular-nums text-brand-700">Total : {formatPrice(total, currency)}</p>
              </CardBody>
            </Card>

            {anyDemo && <DemoNotice />}

            {orders.map((o) => (
              <Card key={o.id}>
                <CardBody className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-bold tabular-nums text-charcoal">{shortOrderRef(o)}</p>
                      <p className="text-xs text-charcoal/50">Passée le {formatDate(o.created_at)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <OrderStatusBadge status={o.status} />
                      <PaymentBadge order={o} />
                    </div>
                  </div>
                  <p className="text-sm text-charcoal/70">
                    {orderTitle(o)} · {orderQuantitySummary(o)}
                  </p>
                  <p className="text-sm text-charcoal/55">
                    Producteur : {o.producer_profile?.full_name ?? '—'} · Livraison : {formatDeliveryAddress(o.delivery, o) || 'à confirmer'}
                  </p>
                  <div className="flex flex-col gap-3 border-t border-black/[0.06] pt-3 sm:flex-row sm:items-center sm:justify-between">
                    <span className="font-bold tabular-nums text-brand-700">{formatPrice(o.total_amount, o.currency)}</span>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Link to={`/orders/${o.id}`} className={buttonStyles({ variant: 'outline', size: 'sm' })}>Suivre ma commande</Link>
                      {needsOnlinePayment(o) && (
                        <Button size="sm" onClick={() => void payNow(o)} loading={payingOrderId === o.id} disabled={payingOrderId !== null}>
                          <Lock className="h-4 w-4" aria-hidden="true" /> {payingOrderId === o.id ? 'Traitement du paiement…' : 'Payer maintenant'}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))}

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link to="/buyer/orders" className={buttonStyles({ variant: 'primary', size: 'lg' })}>Mes commandes</Link>
              <Link to="/marketplace" className={buttonStyles({ variant: 'outline', size: 'lg' })}>Continuer mes achats</Link>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
