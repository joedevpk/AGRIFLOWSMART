import { PRODUCT_DETAIL_COLUMNS, BUYER_REQUEST_COLUMNS } from '@/lib/columns';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Inbox, MapPin, TrendingUp, Package, Plus, CalendarDays } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardBody, Badge, Button, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { MatchCard } from '@/components/ui/Timeline';
import { ContactProducerButton } from '@/components/marketplace/ContactProducer';
import { useAuth } from '@/contexts/auth-context';
import { supabase } from '@/lib/supabase';
import type { BuyerRequest, Product, Profile } from '@/types';
import { formatPrice, formatQuantity, formatDate, REQUEST_STATUS_LABELS } from '@/lib/constants';
import { bestOfferForRequest } from '@/lib/agri-match';

interface RequestWithProfile extends BuyerRequest {
  profiles: Pick<Profile, 'full_name' | 'city' | 'role'> | null;
}

/**
 * Demandes d'achat ouvertes : un producteur y voit les besoins des acheteurs, la meilleure de ses
 * offres pour chacun (avec les raisons de la correspondance) et peut contacter l'acheteur
 * ou ouvrir son offre. Objectif : transformer une demande en commande.
 */
export function ProducerRequestsPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<RequestWithProfile[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [onlyMatching, setOnlyMatching] = useState(false);

  const load = useCallback(() => {
    if (!user) return;
    setLoading(true);
    setError(false);
    Promise.all([
      supabase.from('buyer_requests').select(`${BUYER_REQUEST_COLUMNS}, profiles!buyer_requests_user_id_fkey(full_name, city, role)`).eq('status', 'open').order('created_at', { ascending: false }).limit(100),
      supabase.from('products').select(PRODUCT_DETAIL_COLUMNS).eq('user_id', user.id),
    ]).then(([reqRes, prodRes]) => {
      if (reqRes.error || prodRes.error) setError(true);
      setRequests((reqRes.data as unknown as RequestWithProfile[]) ?? []);
      setProducts((prodRes.data as Product[]) ?? []);
      setLoading(false);
    });
  }, [user]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <DashboardLayout title="Demandes d'achat"><LoadingState /></DashboardLayout>;
  if (error) return <DashboardLayout title="Demandes d'achat"><ErrorState message="Impossible de charger les demandes." onRetry={load} /></DashboardLayout>;

  const rows = requests
    .filter((r) => r.user_id !== user?.id)
    .map((req) => ({ req, best: bestOfferForRequest(req, products) }))
    .sort((a, b) => (b.best?.result.score ?? -1) - (a.best?.result.score ?? -1));
  const shown = onlyMatching ? rows.filter((r) => r.best) : rows;
  const matchingCount = rows.filter((r) => r.best).length;

  return (
    <DashboardLayout title="Demandes d'achat">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-charcoal/60">
            {rows.length} demande{rows.length > 1 ? 's' : ''} ouverte{rows.length > 1 ? 's' : ''} · {matchingCount} correspond{matchingCount > 1 ? 'ent' : ''} à vos productions
          </p>
          <div className="flex gap-2">
            <Button variant={onlyMatching ? 'primary' : 'outline'} size="sm" onClick={() => setOnlyMatching(!onlyMatching)} aria-pressed={onlyMatching}>
              Correspond à mes productions
            </Button>
            <Link to="/producer/products/new"><Button size="sm"><Plus className="h-4 w-4" /> Publier une production</Button></Link>
          </div>
        </div>

        {shown.length === 0 ? (
          <Card><CardBody>
            <EmptyState
              icon={<Inbox className="h-8 w-8" />}
              title={onlyMatching ? 'Aucune demande ne correspond à vos productions' : 'Aucune demande d\'achat ouverte'}
              description={onlyMatching ? 'Publiez de nouvelles productions ou consultez toutes les demandes.' : 'Les demandes des acheteurs apparaîtront ici dès qu\'elles seront publiées.'}
            />
          </CardBody></Card>
        ) : (
          shown.map(({ req, best }) => {
            const buyerName = req.profiles?.full_name || 'Acheteur';
            return (
              <Card key={req.id}>
                <CardBody>
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <h3 className="font-semibold text-charcoal">Recherche : {req.product_name}</h3>
                        <Badge variant="success" dot>{REQUEST_STATUS_LABELS[req.status]}</Badge>
                      </div>
                      <p className="text-sm text-charcoal/60">{formatQuantity(req.quantity, req.unit)}</p>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-charcoal/60">
                        {(req.city || req.province) && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {[req.city, req.province].filter(Boolean).join(', ')}</span>}
                        {req.budget && <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Budget : {formatPrice(req.budget, req.currency)}</span>}
                        {req.desired_date && <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" /> Souhaité avant le {formatDate(req.desired_date)}</span>}
                        <span className="flex items-center gap-1"><Package className="h-3 w-3" /> Publiée le {formatDate(req.created_at)}</span>
                      </div>
                      {req.description && <p className="mt-2 text-sm text-charcoal/70">{req.description}</p>}
                      <p className="mt-2 text-xs text-charcoal/40">Par : {buyerName}{req.profiles?.city ? ` · ${req.profiles.city}` : ''}</p>
                      <div className="mt-4">
                        <ContactProducerButton
                          producerId={req.user_id}
                          producerName={buyerName}
                          label="Contacter l'acheteur"
                          variant="outline"
                          size="sm"
                          subject={`Votre demande : ${req.product_name}`}
                          initialMessage={`Bonjour ${buyerName}, j'ai vu votre demande de ${formatQuantity(req.quantity, req.unit)} de ${req.product_name}. Je peux vous proposer ma production. Pouvons-nous en discuter ?`}
                        />
                      </div>
                    </div>

                    <div className="lg:w-80 shrink-0">
                      {best ? (
                        <MatchCard
                          score={best.result.score}
                          reasons={best.result.reasons}
                          producerName={`Votre offre : ${best.product.name}`}
                          location={best.product.city || best.product.province || 'RDC'}
                          quantity={formatQuantity(best.product.quantity, best.product.unit)}
                          price={formatPrice(best.product.price, best.product.currency)}
                        >
                          <Link to={`/marketplace/${best.product.id}`}><Button fullWidth size="sm" variant="outline">Voir mon offre</Button></Link>
                        </MatchCard>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-brand-200 p-4 text-sm text-charcoal/60">
                          <p>Aucune de vos productions disponibles ne correspond à ce besoin.</p>
                          <Link to="/producer/products/new" className="mt-2 inline-block font-medium text-brand-700 hover:underline">Publier une production</Link>
                        </div>
                      )}
                    </div>
                  </div>
                </CardBody>
              </Card>
            );
          })
        )}
        <p className="text-xs text-charcoal/40 text-center">Le pourcentage est un score de correspondance indicatif — ni une garantie ni une probabilité de vente.</p>
      </div>
    </DashboardLayout>
  );
}
