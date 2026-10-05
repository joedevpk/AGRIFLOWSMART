import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ShieldCheck, Trash2 } from 'lucide-react';
import { Header, Footer } from '@/components/layout/Header';
import { Button, Card, CardBody, ConfirmDialog } from '@/components/ui';
import { CartLineRow } from '@/components/orders/CartLineRow';
import { PriceSummary } from '@/components/orders/PriceSummary';
import { CartSkeleton, EmptyCart, LoadError } from '@/components/orders/OrderStates';
import { CheckoutStepper } from '@/components/orders/CheckoutStepper';
import { useAuth } from '@/contexts/auth-context';
import { useCart } from '@/contexts/cart-context';
import { formatPrice } from '@/lib/constants';
import { useSeo } from '@/hooks/useSeo';

export function CartPage() {
  useSeo({ title: 'Mon panier | AgriFlow RDC', noindex: true });
  const navigate = useNavigate();
  const [confirmClear, setConfirmClear] = useState(false);
  const { user, loading: authLoading } = useAuth();
  const { items, totals, count, ready, status, verified, error, setQuantity, removeItem, clear, refresh } = useCart();

  // Relit prix, stock et disponibilité en base à chaque ouverture du panier.
  useEffect(() => {
    if (ready) void refresh();
  }, [ready, refresh]);

  const checking = count > 0 && !verified && status !== 'error';
  const canCheckout = count > 0 && verified && status !== 'loading' && !totals.hasBlockingIssue && !totals.mixedCurrencies && totals.subtotal > 0;

  const goCheckout = () => {
    if (!canCheckout) return;
    if (!user) {
      navigate('/login', { state: { from: '/checkout' } });
      return;
    }
    navigate('/checkout');
  };

  return (
    <div className="min-h-screen bg-cream transition-colors dark:bg-charcoal">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-32 sm:px-6 lg:px-8 lg:py-10 lg:pb-12">
        <Link to="/marketplace" className="mb-4 inline-flex items-center gap-1.5 text-sm text-charcoal/55 hover:text-charcoal">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Continuer mes achats
        </Link>
        <div className="mb-6 flex items-end justify-between gap-4">
          <h1 className="text-2xl font-extrabold tracking-tight text-charcoal sm:text-3xl">Mon panier</h1>
          {count > 0 && (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="inline-flex h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-charcoal/55 hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Vider le panier
            </button>
          )}
        </div>

        {!ready ? (
          <CartSkeleton />
        ) : count === 0 ? (
          <EmptyCart />
        ) : (
          <>
            <div className="mb-6">
              <CheckoutStepper current={1} />
            </div>

            {status === 'error' && (
              <div className="mb-4">
                <LoadError title="Impossible de vérifier votre panier" message={error ?? undefined} onRetry={() => void refresh()} />
              </div>
            )}

            {checking ? (
              <CartSkeleton />
            ) : (
              <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
                <section aria-label="Produits du panier" className="space-y-3">
                  {totals.mixedCurrencies && (
                    <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      Votre panier mélange plusieurs devises. Retirez les produits d'une des devises pour continuer.
                    </div>
                  )}
                  {items.map((item) => (
                    <CartLineRow
                      key={item.product_id}
                      item={item}
                      onQuantityChange={(q) => setQuantity(item.product_id, q)}
                      onRemove={() => removeItem(item.product_id)}
                    />
                  ))}
                </section>

                <aside className="hidden lg:block">
                  <Card className="sticky top-24">
                    <CardBody className="space-y-5">
                      <h2 className="text-lg font-bold text-charcoal">Récapitulatif</h2>
                      <PriceSummary totals={totals} />
                      <Button fullWidth size="lg" onClick={goCheckout} disabled={!canCheckout} loading={status === 'loading' && !checking}>
                        {user || authLoading ? 'Passer au paiement' : 'Se connecter pour payer'}
                      </Button>
                      {totals.hasBlockingIssue && (
                        <p className="text-xs text-rose-600" role="status">Corrigez les produits signalés pour continuer.</p>
                      )}
                      <p className="flex items-start gap-2 text-xs text-charcoal/50">
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
                        Les prix et les stocks sont revérifiés au moment de la commande.
                      </p>
                    </CardBody>
                  </Card>
                </aside>
              </div>
            )}
          </>
        )}
      </main>
      <Footer />
      <ConfirmDialog
        open={confirmClear}
        destructive
        title="Vider le panier ?"
        description="Tous les produits seront retirés de votre panier."
        confirmLabel="Vider le panier"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => { clear(); setConfirmClear(false); }}
      />

      {/* Barre d'action mobile, au-dessus de la navigation basse */}
      {count > 0 && !checking && (
        <div className="fixed inset-x-0 bottom-16 z-30 border-t border-black/[0.06] bg-offwhite/95 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur-sm lg:hidden">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] leading-tight text-charcoal/50">Total</p>
              <p className="truncate text-lg font-extrabold leading-tight tabular-nums text-brand-700">
                {formatPrice(totals.total, totals.currency ?? 'USD')}
              </p>
            </div>
            <Button size="lg" onClick={goCheckout} disabled={!canCheckout}>
              {user || authLoading ? 'Payer' : 'Se connecter'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
