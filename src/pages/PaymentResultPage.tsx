import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import { Header, Footer } from '@/components/layout/Header';
import { Card, CardBody, buttonStyles, Button } from '@/components/ui';
import type { PaymentResultStatus } from '@/services/paymentService';
import { fetchPaymentByReference, verifyPayment } from '@/services/paymentService';
import { useSeo } from '@/hooks/useSeo';
import { useLanguage } from '@/contexts/language-context';

/**
 * Retour depuis la page de paiement hébergée CinetPay (`return_url`). Cette page
 * n'affirme JAMAIS elle-même qu'un paiement a réussi : elle interroge le
 * backend (qui applique le résultat vérifié auprès de CinetPay, via webhook ou
 * vérification active) et affiche l'état réel renvoyé par le serveur.
 */

const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 15; // ~1 minute de vérification active, sans polling agressif

type ViewState = 'checking' | 'success' | 'failed' | 'pending' | 'cancelled' | 'not_found';

function viewStateFor(status: PaymentResultStatus | null): ViewState {
  if (!status) return 'checking';
  if (status === 'paid' || status === 'demo_paid') return 'success';
  if (status === 'failed' || status === 'expired') return 'failed';
  if (status === 'cancelled') return 'cancelled';
  return 'pending'; // pending / processing / refunded (rare ici)
}

export function PaymentResultPage() {
  useSeo({ title: 'Résultat du paiement | AgriFlow RDC', noindex: true });
  const { reference } = useParams<{ reference: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [status, setStatus] = useState<PaymentResultStatus | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const stoppedRef = useRef(false);

  useEffect(() => {
    if (!reference) return;
    stoppedRef.current = false;
    setPollCount(0);
    setNotFound(false);

    let attempt = 0;

    const check = async (forceVerify: boolean) => {
      if (stoppedRef.current) return;

      if (forceVerify) {
        const result = await verifyPayment(reference);
        if (result.ok) setStatus(result.data);
      }

      const record = await fetchPaymentByReference(reference);
      if (record.ok) {
        if (!record.data) {
          setNotFound(true);
          stoppedRef.current = true;
          return;
        }
        setStatus(record.data.status);
        setOrderId(record.data.order_id);
        if (['paid', 'failed', 'cancelled', 'expired', 'refunded', 'demo_paid'].includes(record.data.status)) {
          stoppedRef.current = true;
          return;
        }
      }

      attempt += 1;
      setPollCount(attempt);
      if (attempt >= MAX_POLLS) {
        stoppedRef.current = true;
        return;
      }
      window.setTimeout(() => void check(attempt % 3 === 0), POLL_INTERVAL_MS);
    };

    void check(true);
    return () => {
      stoppedRef.current = true;
    };
  }, [reference]);

  const view = notFound ? 'not_found' : viewStateFor(status);
  const stillWaiting = view === 'pending' && pollCount >= MAX_POLLS;

  return (
    <div className="min-h-screen bg-cream transition-colors dark:bg-charcoal">
      <Header />
      <main className="mx-auto max-w-lg px-4 py-10 sm:px-6">
        <Card>
          <CardBody className="flex flex-col items-center gap-4 py-10 text-center">
            {view === 'checking' && (
              <>
                <Loader2 className="h-10 w-10 animate-spin text-brand-600" aria-hidden="true" />
                <h1 className="text-xl font-bold text-charcoal">Nous vérifions votre paiement...</h1>
                <p className="text-sm text-charcoal/60">Ne fermez pas cette page.</p>
              </>
            )}

            {view === 'pending' && !stillWaiting && (
              <>
                <Loader2 className="h-10 w-10 animate-spin text-brand-600" aria-hidden="true" />
                <h1 className="text-xl font-bold text-charcoal">Paiement en attente de confirmation</h1>
                <p className="text-sm text-charcoal/60">
                  Validez le paiement sur votre téléphone si ce n'est pas déjà fait. Nous confirmons dès réception.
                </p>
              </>
            )}

            {view === 'pending' && stillWaiting && (
              <>
                <Clock className="h-10 w-10 text-amber-500" aria-hidden="true" />
                <h1 className="text-xl font-bold text-charcoal">Le paiement est toujours en attente de confirmation</h1>
                <p className="text-sm text-charcoal/60">
                  Cela peut prendre quelques minutes selon votre opérateur. Vous recevrez une notification dès que le paiement sera confirmé — vous pouvez aussi suivre la commande.
                </p>
              </>
            )}

            {view === 'success' && (
              <>
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
                </span>
                <h1 className="text-xl font-bold text-charcoal">{t('payResult.successTitle')}</h1>
                <p className="text-sm text-charcoal/70">{t('payResult.successBody')}</p>
                {/* Passe 23 : le paiement ne confirme pas la commande — le producteur doit la confirmer. */}
                <p role="status" className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-900">
                  <Clock className="h-4 w-4" aria-hidden="true" /> {t('confirm.pendingTitle')}
                </p>
              </>
            )}

            {view === 'failed' && (
              <>
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                  <XCircle className="h-8 w-8" aria-hidden="true" />
                </span>
                <h1 className="text-xl font-bold text-charcoal">Paiement échoué</h1>
                <p className="text-sm text-charcoal/60">
                  Aucun montant n'a été confirmé. Vous pouvez réessayer depuis la page de la commande.
                </p>
              </>
            )}

            {view === 'cancelled' && (
              <>
                <XCircle className="h-10 w-10 text-charcoal/40" aria-hidden="true" />
                <h1 className="text-xl font-bold text-charcoal">Paiement annulé</h1>
                <p className="text-sm text-charcoal/60">Vous avez annulé le paiement. Vous pouvez réessayer à tout moment.</p>
              </>
            )}

            {view === 'not_found' && (
              <>
                <XCircle className="h-10 w-10 text-charcoal/40" aria-hidden="true" />
                <h1 className="text-xl font-bold text-charcoal">Référence de paiement introuvable</h1>
                <p className="text-sm text-charcoal/60">Retrouvez l'état de votre commande depuis votre espace.</p>
              </>
            )}

            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              {orderId && (
                <Link to={`/orders/${orderId}`} className={buttonStyles({ variant: 'primary', size: 'md' })}>{t('payResult.track')}</Link>
              )}
              {!orderId && (
                <Link to="/buyer/orders" className={buttonStyles({ variant: 'primary', size: 'md' })}>Mes commandes</Link>
              )}
              {(view === 'failed' || view === 'cancelled') && orderId && (
                <Button variant="outline" onClick={() => navigate(`/orders/${orderId}`)}>Réessayer le paiement</Button>
              )}
            </div>
          </CardBody>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
