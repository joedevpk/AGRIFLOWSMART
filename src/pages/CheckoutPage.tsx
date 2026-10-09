import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, Lock, MapPin, ShieldCheck } from 'lucide-react';
import { Header, Footer } from '@/components/layout/Header';
import { Button, Card, CardBody, Input, Textarea } from '@/components/ui';
import { CheckoutStepper, type StepNumber } from '@/components/orders/CheckoutStepper';
import { CheckoutSkeleton, LoadError } from '@/components/orders/OrderStates';
import { CashOnDeliveryNotice } from '@/components/orders/CashOnDeliveryNotice';
import { PriceSummary } from '@/components/orders/PriceSummary';
import { toast } from '@/components/ui/toast-store';
import { useAuth } from '@/contexts/auth-context';
import { useCart } from '@/contexts/cart-context';
import type { DeliveryFormData, DeliveryFormErrors, PaymentMethod } from '@/types';
import { cartSignature, issueMessage } from '@/lib/cart';
import { UNIT_LABELS, formatPrice, formatQuantity } from '@/lib/constants';
import {
  clearDraft,
  emptyDraft,
  newCheckoutId,
  readDraft,
  writeDraft,
  type CheckoutDraft,
  type CheckoutStep,
} from '@/lib/checkout-draft';
import { hasErrors, normalizeDelivery, validateDelivery } from '@/lib/validation';
import { createOrderFromCart, type CartIssuePayload } from '@/services/orderService';
import { fetchPaymentMethodOptions, isOnlineMethod, type PaymentMethodOption } from '@/services/paymentService';
import { estimateDelivery } from '@/services/deliveryService';
import { cn } from '@/lib/utils';
import { useSeo } from '@/hooks/useSeo';
import { useConnection } from '@/contexts/sync-context';
import { ConnectionBadge } from '@/components/agri/SyncStatus';

interface SubmitProblem {
  message: string;
  issues?: CartIssuePayload[];
  retryable: boolean;
  /** Le panier doit être relu / corrigé avant de pouvoir confirmer. */
  needsCart: boolean;
}

const ISSUE_REASON_LABELS: Record<CartIssuePayload['reason'], string> = {
  removed: 'ce produit n\'existe plus',
  unavailable: 'ce produit n\'est plus disponible',
  insufficient_stock: 'stock insuffisant',
  own_product: 'vous ne pouvez pas commander votre propre production',
  price_missing: 'prix non défini',
};

export function CheckoutPage() {
  useSeo({ title: 'Finaliser la commande | AgriFlow RDC', noindex: true });
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();
  const { items, totals, count, ready, status, verified, error, refresh, clear } = useCart();
  const userId = user?.id ?? null;
  const connection = useConnection();

  const [draft, setDraft] = useState<CheckoutDraft | null>(null);
  const [errors, setErrors] = useState<DeliveryFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<SubmitProblem | null>(null);
  const [paymentOptions, setPaymentOptions] = useState<PaymentMethodOption[]>([]);
  const submittingRef = useRef(false);
  const completedRef = useRef(false);

  const signature = useMemo(() => cartSignature(items), [items]);

  // Relit prix et stocks en base à l'ouverture du checkout.
  useEffect(() => {
    if (ready) void refresh();
  }, [ready, refresh]);

  // Moyens de paiement réellement disponibles (configuration serveur, jamais supposée).
  useEffect(() => {
    let cancelled = false;
    void fetchPaymentMethodOptions(totals.currency ?? null).then((opts) => {
      if (!cancelled) setPaymentOptions(opts);
    });
    return () => {
      cancelled = true;
    };
  }, [totals.currency]);

  // Panier vide (hors commande tout juste passée) : retour au panier.
  useEffect(() => {
    if (ready && count === 0 && !completedRef.current) navigate('/cart', { replace: true });
  }, [ready, count, navigate]);

  // Reprise du brouillon (survit à un rafraîchissement de la page).
  useEffect(() => {
    if (draft || !userId || !ready || authLoading || count === 0) return;
    const stored = readDraft(userId);
    const base = stored ?? emptyDraft(signature);
    const delivery: DeliveryFormData = { ...base.delivery };
    if (!delivery.recipient_name && profile?.full_name) delivery.recipient_name = profile.full_name;
    if (!delivery.city && profile?.city) delivery.city = profile.city;
    setDraft({ ...base, delivery });
  }, [draft, userId, ready, authLoading, count, signature, profile]);

  // Le panier a changé : nouvelle tentative de commande = nouvelle clé d'idempotence.
  useEffect(() => {
    if (!draft || count === 0) return;
    if (draft.cart_signature !== signature) {
      setDraft({ ...draft, checkout_id: newCheckoutId(), cart_signature: signature });
    }
  }, [draft, signature, count]);

  useEffect(() => {
    if (draft && userId && !completedRef.current) writeDraft(userId, draft);
  }, [draft, userId]);

  const update = useCallback((patch: Partial<CheckoutDraft>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
  }, []);

  const setField = (field: keyof DeliveryFormData, value: string) => {
    setDraft((d) => (d ? { ...d, delivery: { ...d.delivery, [field]: value } } : d));
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));
  };

  const cartBlocked = totals.hasBlockingIssue || totals.mixedCurrencies || totals.subtotal <= 0;
  const stepperCurrent = (draft?.step ?? 1) as StepNumber;

  const goToStep = (step: CheckoutStep) => {
    setProblem(null);
    update({ step });
  };

  // Changement d'étape : retour en haut APRÈS le rendu de la nouvelle étape (contenu plus court = pas de saut vers le footer).
  const currentStep = draft?.step;
  useEffect(() => {
    if (currentStep) window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [currentStep]);

  const continueFromCart = () => {
    if (cartBlocked || !verified) return;
    goToStep(2);
  };

  const continueFromDelivery = () => {
    if (!draft) return;
    const found = validateDelivery(draft.delivery);
    setErrors(found);
    if (hasErrors(found)) {
      toast('error', 'Corrigez les champs signalés pour continuer.');
      return;
    }
    goToStep(3);
  };

  const submit = async () => {
    if (!draft || !draft.payment_method || submittingRef.current) return;

    const found = validateDelivery(draft.delivery);
    if (hasErrors(found)) {
      setErrors(found);
      goToStep(2);
      return;
    }
    if (cartBlocked || !verified) {
      setProblem({ message: 'Votre panier doit être vérifié avant de commander.', retryable: false, needsCart: true });
      return;
    }

    submittingRef.current = true; // protège contre le double clic avant même le re-render
    setSubmitting(true);
    setProblem(null);

    const result = await createOrderFromCart({
      checkoutId: draft.checkout_id,
      items: items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
      delivery: normalizeDelivery(draft.delivery),
      paymentMethod: draft.payment_method,
      expectedTotal: totals.total,
    });

    if (result.ok) {
      completedRef.current = true;
      if (userId) clearDraft(userId);
      clear();
      toast('success', result.data.replayed ? 'Cette commande avait déjà été enregistrée.' : 'Commande enregistrée.');
      navigate(`/checkout/confirmation/${result.data.checkout_id}`, { replace: true });
      return;
    }

    submittingRef.current = false;
    setSubmitting(false);

    if (result.code === 'INVALID_DELIVERY' && result.fields) {
      setErrors(result.fields);
      toast('error', result.message);
      goToStep(2);
      return;
    }

    if (result.code === 'PRICE_CHANGED') {
      await refresh(); // met à jour les prix affichés : l'acheteur revalide le nouveau total
      const shown = result.serverTotal !== undefined ? ` Nouveau total : ${formatPrice(result.serverTotal, totals.currency ?? 'USD')}.` : '';
      setProblem({ message: `${result.message}${shown}`, retryable: false, needsCart: false });
      return;
    }

    if (result.code === 'CART_INVALID' || result.code === 'INVALID_ITEMS' || result.code === 'MIXED_CURRENCY') {
      await refresh();
      setProblem({ message: result.message, issues: result.issues, retryable: false, needsCart: true });
      return;
    }

    setProblem({ message: result.message, retryable: result.retryable, needsCart: false });
  };

  /* ------------------------------ rendu ------------------------------ */

  const shell = (content: ReactNode) => (
    <div className="min-h-screen bg-cream transition-colors dark:bg-charcoal">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-36 sm:px-6 lg:px-8 lg:py-10 lg:pb-12">{content}</main>
      <Footer />
    </div>
  );

  if (!ready || authLoading || (count > 0 && !draft)) {
    return shell(<CheckoutSkeleton />);
  }
  if (count === 0 || !draft) {
    return shell(<CheckoutSkeleton />);
  }
  if (status === 'error' && !verified) {
    return shell(<LoadError title="Impossible de vérifier votre panier" message={error ?? undefined} onRetry={() => void refresh()} />);
  }

  const option = paymentOptions.find((o) => o.id === draft.payment_method);
  const online = isOnlineMethod(draft.payment_method);
  const unitLabelOf = (unit: string) => UNIT_LABELS[unit] || unit;

  const totalLabel = formatPrice(totals.total, totals.currency ?? 'USD');
  const step3Label = online ? 'Continuer vers le paiement' : 'Confirmer la commande';
  const mobileCta =
    draft.step === 1
      ? { label: 'Continuer vers la livraison', onClick: continueFromCart, disabled: cartBlocked || !verified, loading: status === 'loading' }
      : draft.step === 2
        ? { label: 'Continuer vers le paiement', onClick: continueFromDelivery, disabled: false, loading: false }
        : {
            label: submitting ? 'Traitement en cours…' : step3Label,
            onClick: () => void submit(),
            disabled: !draft.payment_method || submitting || cartBlocked || !verified || connection === 'offline',
            loading: submitting,
          };

  const summaryCard = (
    <Card className="lg:sticky lg:top-24">
      <CardBody className="space-y-4">
        <h2 className="text-lg font-bold text-charcoal">Votre commande</h2>
        <ul className="divide-y divide-black/[0.06]">
          {items.map((i) => (
            <li key={i.product_id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium text-charcoal">{i.name}</span>
                <span className="text-charcoal/50">{formatQuantity(i.quantity, i.unit)} × {formatPrice(i.unit_price, i.currency)}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-charcoal">{i.issue ? '—' : formatPrice(i.subtotal, i.currency)}</span>
            </li>
          ))}
        </ul>
        <PriceSummary totals={totals} />
        <p className="flex items-start gap-2 text-xs text-charcoal/50">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
          Le total final est recalculé par le serveur avec les prix en vigueur.
        </p>
      </CardBody>
    </Card>
  );

  return shell(
    <>
      <Link to="/cart" className="mb-4 inline-flex items-center gap-1.5 text-sm text-charcoal/55 hover:text-charcoal">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Retour au panier
      </Link>
      <h1 className="mb-5 text-2xl font-extrabold tracking-tight text-charcoal sm:text-3xl">Finaliser la commande</h1>
      <div className="mb-6">
        <CheckoutStepper current={stepperCurrent} onSelect={(s) => (s === 1 ? navigate('/cart') : goToStep(s))} />
      </div>

      <details className="group mb-4 rounded-2xl border border-black/[0.06] bg-offwhite lg:hidden dark:border-white/10">
        <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-charcoal [&::-webkit-details-marker]:hidden">
          <span>Voir le résumé de la commande</span>
          <span className="flex items-center gap-2 tabular-nums text-brand-700">{totalLabel}<ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" /></span>
        </summary>
        <div className="border-t border-black/[0.06] p-2 dark:border-white/10">{summaryCard}</div>
      </details>
      <p role="status" aria-live="polite" className="sr-only">{submitting ? 'Traitement de la commande en cours, veuillez patienter.' : ''}</p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          {problem && (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{problem.message}</p>
                  {problem.issues && problem.issues.length > 0 && (
                    <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
                      {problem.issues.map((i) => (
                        <li key={i.product_id}>
                          {i.name ?? 'Produit'} : {ISSUE_REASON_LABELS[i.reason]}
                          {i.reason === 'insufficient_stock' ? ` (${i.available} disponible${i.available > 1 ? 's' : ''})` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {problem.needsCart && (
                      <Button size="sm" onClick={() => navigate('/cart')}>Mettre à jour mon panier</Button>
                    )}
                    {problem.retryable && (
                      <Button size="sm" variant="outline" onClick={() => void submit()} disabled={submitting}>Réessayer</Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Étape 1 — récapitulatif du panier */}
          {draft.step === 1 && (
            <Card>
              <CardBody className="space-y-4">
                <h2 className="text-lg font-bold text-charcoal">Vérifiez votre panier</h2>
                <ul className="space-y-2">
                  {items.map((i) => {
                    const msg = issueMessage(i);
                    return (
                      <li key={i.product_id} className="rounded-xl border border-black/[0.06] bg-cream/60 px-4 py-3 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-charcoal">{i.name}</p>
                            <p className="text-charcoal/55">
                              {i.quantity} {unitLabelOf(i.unit)} × {formatPrice(i.unit_price, i.currency)}
                              {i.producer_name ? ` · ${i.producer_name}` : ''}
                            </p>
                          </div>
                          {!i.issue && <p className="shrink-0 font-bold tabular-nums text-brand-700">{formatPrice(i.subtotal, i.currency)}</p>}
                        </div>
                        {msg && <p role="alert" className="mt-2 text-rose-700">{msg}</p>}
                        {i.previous_price !== null && !i.issue && (
                          <p className="mt-2 text-xs text-accent-700">Prix modifié depuis l'ajout : {formatPrice(i.previous_price, i.currency)} → {formatPrice(i.unit_price, i.currency)}.</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {cartBlocked && (
                  <p role="alert" className="text-sm text-rose-700">
                    Certains produits ne peuvent pas être commandés. <Link to="/cart" className="font-semibold underline">Mettez votre panier à jour</Link> pour continuer.
                  </p>
                )}
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                  <Button variant="outline" onClick={() => navigate('/cart')}>Modifier le panier</Button>
                  <Button className="max-lg:hidden" onClick={continueFromCart} disabled={cartBlocked || !verified} loading={status === 'loading'}>Continuer vers la livraison</Button>
                </div>
              </CardBody>
            </Card>
          )}

          {/* Étape 2 — livraison */}
          {draft.step === 2 && (
            <Card>
              <CardBody className="space-y-5">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-bold text-charcoal"><MapPin className="h-5 w-5 text-brand-600" aria-hidden="true" /> Adresse de livraison</h2>
                  <p className="mt-1 text-sm text-charcoal/55">{estimateDelivery().hint}</p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input id="recipient_name" label="Nom du destinataire" autoComplete="name" value={draft.delivery.recipient_name} onChange={(e) => setField('recipient_name', e.target.value)} error={errors.recipient_name} maxLength={120} required />
                  <Input id="recipient_phone" label="Téléphone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+243 812 345 678" value={draft.delivery.recipient_phone} onChange={(e) => setField('recipient_phone', e.target.value)} error={errors.recipient_phone} maxLength={30} required />
                </div>
                <Input id="address" label="Adresse ou point de livraison" autoComplete="street-address" placeholder="Avenue, numéro, quartier, point de repère" value={draft.delivery.address} onChange={(e) => setField('address', e.target.value)} error={errors.address} maxLength={300} required />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input id="city" label="Ville" autoComplete="address-level2" placeholder="Kinshasa" value={draft.delivery.city} onChange={(e) => setField('city', e.target.value)} error={errors.city} maxLength={100} required />
                  <Input id="commune" label="Commune (facultatif)" value={draft.delivery.commune} onChange={(e) => setField('commune', e.target.value)} error={errors.commune} maxLength={100} />
                </div>
                <Textarea id="instructions" label="Instructions de livraison (facultatif)" rows={3} placeholder="Horaires, code d'entrée, personne à contacter…" value={draft.delivery.instructions} onChange={(e) => setField('instructions', e.target.value)} error={errors.instructions} maxLength={500} />
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                  <Button variant="outline" onClick={() => goToStep(1)}>Retour</Button>
                  <Button className="max-lg:hidden" onClick={continueFromDelivery}>Continuer vers le paiement</Button>
                </div>
              </CardBody>
            </Card>
          )}

          {/* Étape 3 — paiement + confirmation finale */}
          {draft.step === 3 && (
            <>
              <Card>
                <CardBody className="space-y-4">
                  <h2 className="flex items-center gap-2 text-lg font-bold text-charcoal"><Lock className="h-5 w-5 text-brand-600" aria-hidden="true" /> Mode de paiement</h2>
                  <div role="radiogroup" aria-label="Mode de paiement" className="space-y-2.5">
                    {paymentOptions.map((opt) => {
                      const selected = draft.payment_method === opt.id;
                      return (
                        <label
                          key={opt.id}
                          className={cn(
                            'flex min-h-[64px] cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors focus-within:ring-2 focus-within:ring-brand-500',
                            selected ? 'border-brand-500 bg-brand-50/60' : 'border-black/[0.08] bg-offwhite hover:border-brand-300',
                            !opt.selectable && 'cursor-not-allowed opacity-50',
                          )}
                        >
                          <input
                            type="radio"
                            name="payment_method"
                            value={opt.id}
                            checked={selected}
                            disabled={!opt.selectable}
                            onChange={() => update({ payment_method: opt.id as PaymentMethod })}
                            className="mt-1 h-4 w-4 accent-brand-600"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-charcoal">{opt.label}</span>
                              <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-700">{opt.badge}</span>
                            </span>
                            <span className="mt-0.5 block text-sm text-charcoal/55">{opt.description}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {draft.payment_method === 'cash_on_delivery' && <CashOnDeliveryNotice />}
                  {!draft.payment_method && <p className="text-sm text-charcoal/50">Choisissez un mode de paiement pour confirmer la commande.</p>}
                </CardBody>
              </Card>

              <Card>
                <CardBody className="space-y-3 text-sm">
                  <h2 className="text-lg font-bold text-charcoal">Livraison</h2>
                  <p className="font-medium text-charcoal">{draft.delivery.recipient_name} · {draft.delivery.recipient_phone}</p>
                  <p className="text-charcoal/65">
                    {[draft.delivery.address, draft.delivery.commune, draft.delivery.city].filter((p) => p.trim()).join(', ')}
                  </p>
                  {draft.delivery.instructions.trim() && <p className="text-charcoal/55">Instructions : {draft.delivery.instructions}</p>}
                  <button type="button" onClick={() => goToStep(2)} className="inline-flex min-h-[44px] items-center text-sm font-semibold text-brand-700 underline-offset-2 hover:underline">Modifier la livraison</button>
                </CardBody>
              </Card>

              {connection === 'offline' && (
                <p className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><ConnectionBadge compact /> Une connexion est nécessaire pour confirmer cette commande. Vos informations restent enregistrées ci-dessus.</p>
              )}
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                <Button variant="outline" onClick={() => goToStep(2)} disabled={submitting}>Retour</Button>
                <Button
                  size="lg"
                  onClick={() => void submit()}
                  disabled={!draft.payment_method || submitting || cartBlocked || !verified || connection === 'offline'}
                  loading={submitting}
                  className="max-lg:hidden sm:min-w-[260px]"
                >
                  {submitting ? 'Traitement en cours…' : (
                    <>
                      <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                      {step3Label} · {totalLabel}
                    </>
                  )}
                </Button>
              </div>
              {option && (
                <p className="text-center text-xs text-charcoal/45">
                  En confirmant, vous passez commande avec « {option.label} ». {online ? 'Vous serez redirigé vers la page de paiement sécurisée.' : 'Vous réglerez à la réception.'}
                </p>
              )}
            </>
          )}
        </div>

        <aside className="hidden lg:block">{summaryCard}</aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-black/[0.08] bg-offwhite/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:hidden dark:border-white/10 dark:bg-charcoal/95">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="min-w-0">
            <p className="text-xs text-charcoal/55">Total</p>
            <p className="text-lg font-extrabold tabular-nums text-charcoal">{totalLabel}</p>
          </div>
          <Button size="lg" className="flex-1" onClick={mobileCta.onClick} disabled={mobileCta.disabled} loading={mobileCta.loading}>{mobileCta.label}</Button>
        </div>
      </div>
    </>,
  );
}
