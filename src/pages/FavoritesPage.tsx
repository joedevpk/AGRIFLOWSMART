import { PRODUCT_LIST_WITH_PRODUCER } from '@/lib/columns';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Search } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ProductCard } from '@/components/ui/ProductCard';
import { Card, CardBody, EmptyState } from '@/components/ui';
import { buttonStyles } from '@/components/ui/button-styles';
import { LoadError } from '@/components/orders/OrderStates';
import { MarketplaceSkeleton } from '@/components/marketplace/MarketplaceStates';
import { useAuth } from '@/contexts/auth-context';
import { useFavorites } from '@/hooks/useFavorites';
import { useSeo } from '@/hooks/useSeo';
import { supabase } from '@/lib/supabase';
import type { ProductWithProfile } from '@/types';

/** Produits enregistrés par l'utilisateur (table `favorites`, RLS propriétaire). */
export function FavoritesPage() {
  useSeo({ title: 'Mes favoris | AgriFlow RDC', noindex: true });
  const { user } = useAuth();
  const favorites = useFavorites();
  const [products, setProducts] = useState<ProductWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const known = useRef<Set<string>>(new Set()); // produits déjà chargés : un retrait/rollback ne relance pas de requête

  // Charge les produits une seule fois par liste d'identifiants ; un retrait met à jour la liste localement.
  const idsKey = Array.from(favorites.ids).sort().join(',');
  const load = useCallback(async () => {
    if (!user || favorites.loading) return;
    if (favorites.error) { setError(true); setLoading(false); return; }
    setError(false);
    const ids = idsKey ? idsKey.split(',') : [];
    const missing = ids.filter((id) => !known.current.has(id));
    if (missing.length === 0) { setLoading(false); return; }
    const { data, error: err } = await supabase
      .from('products')
      .select(PRODUCT_LIST_WITH_PRODUCER)
      .in('id', missing);
    if (err) {
      setError(true);
    } else {
      const fetched = (data as unknown as ProductWithProfile[]) ?? [];
      fetched.forEach((p) => known.current.add(p.id));
      setProducts((prev) => [...prev.filter((p) => !fetched.some((f) => f.id === p.id)), ...fetched]);
    }
    setLoading(false);
  }, [user, favorites.loading, favorites.error, idsKey]);

  useEffect(() => { void load(); }, [load]);

  const visible = products.filter((p) => favorites.has(p.id));

  return (
    <DashboardLayout title="Mes favoris">
      <p className="mb-5 text-sm text-charcoal/60">Les produits que vous avez enregistrés pour les retrouver facilement.</p>
      {loading || favorites.loading ? (
        <MarketplaceSkeleton />
      ) : error ? (
        <LoadError title="Impossible de charger vos favoris" onRetry={() => { setLoading(true); void favorites.reload(); }} />
      ) : visible.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={<Heart className="h-8 w-8" />}
              title="Aucun favori pour le moment"
              description="Touchez le cœur sur un produit pour l'enregistrer ici."
              action={<Link to="/marketplace" className={buttonStyles({ variant: 'primary', size: 'lg' })}><Search className="h-4 w-4" aria-hidden="true" /> Explorer la marketplace</Link>}
            />
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
