import { openCheckoutPage } from '@/lib/native/browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Banknote, Check, Lock, MapPin, MessageSquare, Phone, Star, Truck } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardBody, Button, Avatar } from '@/components/ui';
import { OrderTimeline } from '@/components/ui/Timeline';
import { DeliveryTimeline } from '@/components/ui/DeliveryTimeline';
import { toast } from '@/components/ui/toast-store';
import { DemoNotice } from '@/components/orders/DemoNotice';
import { ConfirmationNotice } from '@/components/orders/ConfirmationNotice';
import { LoadError, OrderDetailSkeleton } from '@/components/orders/OrderStates';
import { DeliveryBadge, OrderStatusBadge, PaymentBadge } from '@/components/orders/StatusBadges';
import { useAuth } from '@/contexts/auth-context';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/logger';
import { useConfirmAction } from '@/hooks/useConfirmAction';
import { useSeo } from '@/hooks/useSeo';
import type { CounterpartProfile, OrderStatusHistory, OrderWithDetails } from '@/types';
import { PAYMENT_METHOD_LABELS, formatDate, formatDateTime, formatPrice, formatQuantity } from '@/lib/constants';
import { itemImage, shortOrderRef } from '@/lib/order-display';
import { actionsFor, isDemoPayment, paymentSummary, type ActorRole, type TransitionAction } from '@/lib/order-workflow';
import { estimateDelivery, formatDeliveryAddress } from '@/services/deliveryService';
import { fetchOrderById, fetchOrderTimeline, transitionOrderStatus } from '@/services/orderService';
import { confirmCashPayment, initiatePayment, isOnlineMethod } from '@/services/paymentService';

function actorRoleFor(order: OrderWithDetails, userId: string | undefined, isAdmin: boolean): ActorRole | null {
  if (userId && order.producer_id === userId) return 'producer';
  if (userId && order.buyer_id === userId) return 'buyer';
  return isAdmin ? 'admin' : null;
}

function PartyRow({ label, profile }: { label: string; profile: CounterpartProfile | null }) {
  return (
    <div>
      <p className="mb-2 text-xs uppercase tracking-wide text-charcoal/40">{label}</p>
      <div className="flex items-center gap-3">
        <Avatar name={profile?.full_name || 'Utilisateur'} src={profile?.avatar_url} size="md" />
        <div className="min-w-0">
          <p className="truncate font-medium text-charcoal">{profile?.full_name || '—'}</p>
          <p className="text-sm text-charcoal/50">{profile?.city || '—'}</p>
        </div>
      </div>
    </div>
  );
}

type ActionOutcome = { ok: true } | { ok: false; message: string };

export function OrderDetailPage() {
  useSeo({ title: 'Détail de la commande | AgriFlow RDC', noindex: true });
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [order, setOrder] = useState<OrderWithDetails | null>(null);
  const [history, setHistory] = useState<OrderStatusHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const actionRef = useRef(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [hasReviewed, setHasReviewed] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [orderRes, historyRes] = await Promise.all([fetchOrderById(id), fetchOrderTimeline(id)]);
    if (!orderRes.ok) {
      setLoadError(orderRes.message);
      setLoading(false);
      return;
    }
    setLoadError(null);
    setOrder(orderRes.data);
    setHistory(historyRes.ok ? historyRes.data : []);
    if (user && orderRes.data) {
      const { data: rev } = await supabase.from('reviews').select('id').eq('order_id', id).eq('reviewer_id', user.id).maybeSingle();
      setHasReviewed(!!rev);
    }
    setLoading(false);
  }, [id, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const role = order ? actorRoleFor(order, user?.id, profile?.role === 'admin') : null;
  const isProducer = role === 'producer';
  const isBuyer = role === 'buyer';

  /** Une seule action à la fois (protège du double clic) ; le serveur valide la transition. */
  const runAction = async (fn: () => Promise<ActionOutcome>, successMessage: string) => {
    if (actionRef.current) return;
    actionRef.current = true;
    setActionLoading(true);
    const result = await fn();
    if (result.ok) toast('success', successMessage);
    else toast('error', result.message);
    actionRef.current = false;
    setActionLoading(false);
    await load(); // toujours relire : l'état affiché vient du serveur
  };

  const { request, dialog } = useConfirmAction();

  const handleTransition = (action: TransitionAction) => {
    if (!order) return;
    const go = () => runAction(() => transitionOrderStatus(order.id, action.to, action.note), 'Commande mise à jour.');
    if (action.confirm) request({ title: action.label, description: action.confirm, confirmLabel: action.label, destructive: action.variant === 'danger', run: go });
    else void go();
  };

  const handleCashPayment = () => {
    if (!order) return;
    request({
      title: 'Confirmer l\'encaissement ?',
      description: 'Confirmez uniquement si vous avez bien reçu le paiement en espèces.',
      confirmLabel: 'Oui, encaissé',
      run: () => runAction(() => confirmCashPayment(order.id), 'Encaissement confirmé.'),
    });
  };

  const [payingOnline, setPayingOnline] = useState(false);
  const handlePayNow = async () => {
    if (!order || !isOnlineMethod(order.payment_method) || payingOnline) return;
    setPayingOnline(true);
    const result = await initiatePayment({ orderId: order.id, paymentMethod: order.payment_method as 'mobile_money' | 'card' });
    if (!result.ok) {
      toast('error', result.message);
      setPayingOnline(false);
      return;
    }
    try {
      const opened = await openCheckoutPage({ url: result.data.checkoutUrl, reference: result.data.internalReference, navigate });
      if (!opened) toast('error', 'L\'adresse de paiement reçue est invalide. Réessayez ou choisissez un autre moyen de paiement.');
    } catch {
      toast('error', 'Impossible d\'ouvrir la page de paiement. Aucun montant n\'a été débité. Réessayez.');
    }
    setPayingOnline(false);
  };

  const handleReview = async () => {
    if (!order || !user || actionRef.current) return;
    actionRef.current = true;
    setActionLoading(true);
    const revieweeId = isBuyer ? order.producer_id : order.buyer_id;
    const { error } = await supabase.from('reviews').insert({
      order_id: order.id,
      reviewer_id: user.id,
      reviewee_id: revieweeId,
      rating: reviewRating,
      comment: reviewComment || null,
    });
    actionRef.current = false;
    setActionLoading(false);
    if (error) {
      reportError('OrderDetailPage.handleReview', error.message);
      toast('error', 'Impossible d\'enregistrer votre évaluation pour le moment.');
      return;
    }
    toast('success', 'Merci pour votre évaluation.');
    setHasReviewed(true);
  };

  if (loading) return <DashboardLayout title="Commande"><OrderDetailSkeleton /></DashboardLayout>;
  if (loadError) {
    return (
      <DashboardLayout title="Commande">
        <LoadError title="Impossible de charger la commande" message={loadError} onRetry={() => { setLoading(true); void load(); }} />
      </DashboardLayout>
    );
  }
  if (!order || !role) {
    return (
      <DashboardLayout title="Commande">
        <LoadError title="Commande introuvable" message="Cette commande n'existe pas ou vous n'y avez pas accès." onRetry={() => navigate('/dashboard')} />
      </DashboardLayout>
    );
  }

  const actions = actionsFor(role, order.status);
  const summary = paymentSummary(order.payment_method, order.payment_status, order.status, order.refunds[0]?.status ?? null);
  const demo = isDemoPayment(order.payment_status, order.payments.some((p) => p.is_demo));
  const canConfirmCash =
    (role === 'producer' || role === 'admin') &&
    order.payment_method === 'cash_on_delivery' &&
    order.payment_status === 'pending' &&
    (order.status === 'delivered' || order.status === 'completed');
  const canRetryOnlinePayment =
    isBuyer &&
    order.status !== 'cancelled' &&
    isOnlineMethod(order.payment_method) &&
    ['pending', 'failed', 'expired', 'cancelled'].includes(order.payment_status);
  const deliveryEstimate = estimateDelivery();
  const address = formatDeliveryAddress(order.delivery, order);
  const city = order.delivery?.city ?? order.delivery_city;
  const canReview = order.status === 'completed' && (isBuyer || isProducer);
  const lastPayment = order.payments[0];

  return (
    <DashboardLayout title={`Commande ${shortOrderRef(order)}`}>
      {dialog}
      <div className="max-w-4xl space-y-6">
        <button onClick={() => navigate(-1)} className="inline-flex min-h-[44px] items-center gap-2 text-sm text-charcoal/50 hover:text-charcoal/70">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Retour
        </button>

        {/* Les trois statuts, toujours distincts : commande, paiement, livraison */}
        <div className="flex flex-wrap items-center gap-2" aria-label="Statuts de la commande">
          <OrderStatusBadge status={order.status} />
          <PaymentBadge order={order} />
          <DeliveryBadge delivery={order.delivery} />
        </div>

        {/* Que se passe-t-il ? Pourquoi ? Que faire ? (confirmation du producteur, expiration, remboursement, alternatives) */}
        <ConfirmationNotice order={order} viewer={role} />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {/* Produits */}
            <Card>
              <CardBody className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-base font-semibold text-charcoal">Produits commandés</h2>
                  <span className="text-xs text-charcoal/45">{formatDate(order.created_at)}</span>
                </div>
                <ul className="divide-y divide-black/[0.06]">
                  {order.order_items.map((item) => (
                    <li key={item.id} className="flex items-center gap-4 py-3 first:pt-0">
                      <img src={itemImage(item)} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" loading="lazy" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-charcoal">{item.product_name}</p>
                        <p className="text-sm text-charcoal/55">
                          {formatQuantity(item.quantity, item.unit)} × {formatPrice(item.unit_price, item.currency)}
                        </p>
                      </div>
                      <p className="shrink-0 font-bold tabular-nums text-charcoal">{formatPrice(item.subtotal, item.currency)}</p>
                    </li>
                  ))}
                  {order.order_items.length === 0 && <li className="py-3 text-sm text-charcoal/50">Le détail des produits n'est pas disponible pour cette commande.</li>}
                </ul>
                <dl className="space-y-2 border-t border-black/[0.06] pt-4 text-sm">
                  <div className="flex justify-between"><dt className="text-charcoal/60">Sous-total</dt><dd className="font-medium tabular-nums">{formatPrice(order.subtotal, order.currency)}</dd></div>
                  <div className="flex justify-between">
                    <dt className="text-charcoal/60">Livraison</dt>
                    <dd className="font-medium tabular-nums">{order.delivery_fee > 0 ? formatPrice(order.delivery_fee, order.currency) : deliveryEstimate.label}</dd>
                  </div>
                  <div className="flex justify-between text-base"><dt className="font-bold text-charcoal">Total</dt><dd className="text-xl font-extrabold tabular-nums text-brand-700">{formatPrice(order.total_amount, order.currency)}</dd></div>
                </dl>
              </CardBody>
            </Card>

            {/* Suivi */}
            <Card>
              <CardBody>
                <h2 className="mb-6 text-base font-semibold text-charcoal">Suivi de la commande</h2>
                <OrderTimeline currentStatus={order.status} history={history} order={order} />
              </CardBody>
            </Card>

            {['ready', 'in_delivery', 'delivered', 'completed'].includes(order.status) && (
              <Card>
                <CardBody>
                  <h2 className="mb-5 text-base font-semibold text-charcoal">Livraison</h2>
                  <DeliveryTimeline status={order.status} destinationCity={city} />
                </CardBody>
              </Card>
            )}

            {/* Adresse */}
            <Card>
              <CardBody className="space-y-2 text-sm">
                <h2 className="mb-1 text-base font-semibold text-charcoal">Adresse de livraison</h2>
                {order.delivery?.recipient_name && <p className="font-medium text-charcoal">{order.delivery.recipient_name}</p>}
                {order.delivery?.recipient_phone && (
                  <p className="flex items-center gap-1.5 text-charcoal/65"><Phone className="h-4 w-4" aria-hidden="true" /> {order.delivery.recipient_phone}</p>
                )}
                <p className="flex items-start gap-1.5 text-charcoal/65">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {address || 'Adresse non renseignée'}
                </p>
                {order.delivery?.notes && <p className="text-charcoal/55">Instructions : {order.delivery.notes}</p>}
                <p className="text-xs text-charcoal/45">{deliveryEstimate.hint}</p>
              </CardBody>
            </Card>

            {/* Évaluation (comportement inchangé) */}
            {canReview && !hasReviewed && (
              <Card>
                <CardBody>
                  <h2 className="mb-4 text-base font-semibold text-charcoal">Évaluer la transaction</h2>
                  <div className="mb-4 flex gap-2" role="radiogroup" aria-label="Note">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button key={s} type="button" role="radio" aria-checked={s === reviewRating} aria-label={`${s} étoile${s > 1 ? 's' : ''}`} onClick={() => setReviewRating(s)} className="flex h-11 w-11 items-center justify-center rounded-lg">
                        <Star className={`h-7 w-7 ${s <= reviewRating ? 'fill-current text-amber-400' : 'text-charcoal/20'}`} />
                      </button>
                    ))}
                  </div>
                  <textarea value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} rows={3} maxLength={1000} aria-label="Commentaire" placeholder="Laissez un commentaire (optionnel)..." className="w-full resize-none rounded-xl border border-black/[0.06] px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10" />
                  <Button className="mt-4" onClick={() => void handleReview()} loading={actionLoading}>Publier l'évaluation</Button>
                </CardBody>
              </Card>
            )}
            {canReview && hasReviewed && (
              <Card><CardBody><div className="flex items-center gap-2 text-sm text-emerald-600"><Check className="h-5 w-5" aria-hidden="true" /> Transaction évaluée. Merci !</div></CardBody></Card>
            )}
          </div>

          {/* Colonne latérale */}
          <div className="space-y-4">
            <Card>
              <CardBody className="space-y-4">
                {(isProducer || role === 'admin') && <PartyRow label="Acheteur" profile={order.buyer_profile} />}
                {(isBuyer || role === 'admin') && <PartyRow label="Producteur" profile={order.producer_profile} />}
                {role !== 'admin' && (
                  <Link to="/messages"><Button variant="outline" fullWidth size="sm"><MessageSquare className="h-4 w-4" aria-hidden="true" /> Envoyer un message</Button></Link>
                )}
              </CardBody>
            </Card>

            {/* Paiement */}
            <Card>
              <CardBody className="space-y-3">
                <h2 className="text-base font-semibold text-charcoal">Paiement</h2>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-charcoal/60">{order.payment_method ? PAYMENT_METHOD_LABELS[order.payment_method] : 'Mode non défini'}</span>
                  <PaymentBadge order={order} />
                </div>
                <p className="text-lg font-extrabold tabular-nums text-brand-700">{formatPrice(order.total_amount, order.currency)}</p>
                {demo && <DemoNotice />}
                {!demo && summary.note && <p className="text-sm text-charcoal/55">{summary.note}</p>}
                {lastPayment && (lastPayment.status === 'paid' || lastPayment.status === 'demo_paid') && (
                  <p className="text-xs text-charcoal/45">Enregistré le {formatDateTime(lastPayment.updated_at)}</p>
                )}
                {canConfirmCash && (
                  <Button fullWidth onClick={handleCashPayment} loading={actionLoading}><Banknote className="h-4 w-4" aria-hidden="true" /> Confirmer l'encaissement</Button>
                )}
                {canRetryOnlinePayment && (
                  <Button fullWidth onClick={() => void handlePayNow()} loading={payingOnline}><Lock className="h-4 w-4" aria-hidden="true" /> {payingOnline ? 'Traitement du paiement…' : 'Payer maintenant'}</Button>
                )}
              </CardBody>
            </Card>

            {/* Actions de statut (transitions contrôlées côté serveur) */}
            {actions.length > 0 && (
              <Card>
                <CardBody className="space-y-2">
                  <h2 className="mb-1 text-base font-semibold text-charcoal">Actions</h2>
                  {actions.map((action) => (
                    <Button key={action.to} fullWidth variant={action.variant} onClick={() => handleTransition(action)} loading={actionLoading}>
                      {action.to === 'in_delivery' && <Truck className="h-4 w-4" aria-hidden="true" />}
                      {action.label}
                    </Button>
                  ))}
                </CardBody>
              </Card>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
