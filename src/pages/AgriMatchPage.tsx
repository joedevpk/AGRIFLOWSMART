import { BUYER_REQUEST_COLUMNS, PRODUCT_LIST_WITH_PRODUCER } from '@/lib/columns';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles, Package, MapPin, CalendarDays } from 'lucide-react';
import { Header, Footer } from '@/components/layout/Header';
import { Badge, Button, MatchCard } from '@/components/ui';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/States';
import { supabase } from '@/lib/supabase';
import type { BuyerRequest, ProductWithProfile } from '@/types';
import { formatQuantity, formatDate, formatPrice } from '@/lib/constants';
import { calculateMatchScore } from '@/lib/agri-match';
import { ContactProducerButton } from '@/components/marketplace/ContactProducer';
import { useSeo } from '@/hooks/useSeo';

export function AgriMatchPage() {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const [request, setRequest] = useState<BuyerRequest | null>(null);
  const [products, setProducts] = useState<ProductWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useSeo({ title: 'Agri-Match | AgriFlow RDC', noindex: true });

  const load = useCallback(async () => {
    if (!requestId) return;
    setLoading(true);
    setError(false);
    try {
      const [reqRes, prodRes] = await Promise.all([
        supabase.from('buyer_requests').select(BUYER_REQUEST_COLUMNS).eq('id', requestId).maybeSingle(),
        supabase.from('products').select(PRODUCT_LIST_WITH_PRODUCER).eq('status', 'available').gt('quantity', 0),
      ]);
      if (reqRes.error || prodRes.error) throw new Error('load');
      setRequest(reqRes.data as BuyerRequest | null);
      setProducts((prodRes.data as unknown as ProductWithProfile[]) ?? []);
    } catch {
      setError(true);
    }
    setLoading(false);
  }, [requestId]);

  useEffect(() => { void load(); }, [load]);

  const shell = (content: ReactNode) => (
    <div className="min-h-screen bg-cream transition-colors dark:bg-charcoal">
      <Header />
      {content}
      <Footer />
    </div>
  );

  if (loading) return shell(<LoadingState label="Recherche des meilleures correspondances…" />);
  if (error) return shell(<ErrorState title="Impossible de charger les correspondances" message="Vérifiez votre connexion puis réessayez." onRetry={() => void load()} />);
  if (!request) return shell(<ErrorState title="Demande introuvable" message="Cette demande d'achat n'existe pas ou plus." />);

  const matches = products
    .map((product) => ({ product, ...calculateMatchScore(request, product) }))
    .filter((m) => m.score >= 30)
    .sort((a, b) => b.score - a.score);

  return (
    <div className="min-h-screen bg-cream dark:bg-charcoal transition-colors">
      <Header />
      <main className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
        <Link to="/buyer/requests" className="inline-flex items-center gap-2 text-sm text-charcoal/50 hover:text-charcoal/80 mb-6">
          <ArrowLeft className="h-4 w-4" /> Retour à mes demandes
        </Link>

        <div className="mb-8 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 rounded-full bg-brand-50 text-brand-700 px-3 py-1 text-xs font-semibold mb-3">
            <Sparkles className="h-3.5 w-3.5" /> Agri-Match
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-charcoal tracking-tight">
            Trouvez les productions qui correspondent à votre besoin.
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-charcoal/60">Nous comparons votre demande aux offres disponibles : produit, quantité, localisation, budget et date de disponibilité.</p>
        </div>

        {/* Demande */}
        <div className="rounded-2xl border border-black/[0.06] bg-offwhite p-5 mb-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-charcoal/40 mb-2">Demande</p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <h2 className="text-xl font-bold text-charcoal">{request.product_name}</h2>
            <span className="flex items-center gap-1.5 text-sm text-charcoal/60"><Package className="h-4 w-4" /> {formatQuantity(request.quantity, request.unit)}</span>
            {request.city && <span className="flex items-center gap-1.5 text-sm text-charcoal/60"><MapPin className="h-4 w-4" /> {request.city}</span>}
            {request.desired_date && <span className="flex items-center gap-1.5 text-sm text-charcoal/60"><CalendarDays className="h-4 w-4" /> Avant le {formatDate(request.desired_date)}</span>}
            {request.budget && <Badge variant="neutral">Budget : {formatPrice(request.budget, request.currency)}</Badge>}
          </div>
        </div>

        <p className="text-xs font-semibold uppercase tracking-wide text-charcoal/40 mb-4">
          Meilleures correspondances {matches.length > 0 && `(${matches.length})`}
        </p>

        {matches.length === 0 ? (
          <div className="rounded-2xl border border-black/[0.06] bg-offwhite">
            <EmptyState
              icon={<Sparkles className="h-8 w-8" />}
              title="Aucune correspondance trouvée"
              description="Nous n'avons trouvé aucune production correspondant à cette demande pour le moment."
              action={<Button variant="outline" onClick={() => navigate('/marketplace')}>Explorer la marketplace</Button>}
            />
          </div>
        ) : (
          <div className="space-y-4">
            {matches.map(({ product, score, reasons }) => (
              <MatchCard
                key={product.id}
                score={score}
                reasons={reasons}
                producerName={product.profiles?.full_name || 'Producteur'}
                location={product.city || product.province || 'RDC'}
                quantity={formatQuantity(product.quantity, product.unit)}
                price={formatPrice(product.price, product.currency)}
              >
                <p className="text-sm font-medium text-charcoal/70 mb-3">{product.name}{product.variety ? ` — ${product.variety}` : ''}</p>
                <div className="flex gap-2">
                  <Link to={`/marketplace/${product.id}`} className="flex-1">
                    <Button fullWidth size="sm">Voir et commander</Button>
                  </Link>
                  <ContactProducerButton
                    producerId={product.user_id}
                    producerName={product.profiles?.full_name || 'le producteur'}
                    productId={product.id}
                    productName={product.name}
                    variant="outline"
                    size="sm"
                  />
                </div>
              </MatchCard>
            ))}
          </div>
        )}

        <p className="mt-6 text-xs text-charcoal/40 text-center">
          Le pourcentage est calculé à partir des critères listés sur chaque carte (produit, quantité, localisation, budget, date). Il est indicatif : ni une garantie, ni une probabilité de vente. Seules les offres dont le score atteint 30 % sont affichées.
        </p>
      </main>
      <Footer />
    </div>
  );
}
