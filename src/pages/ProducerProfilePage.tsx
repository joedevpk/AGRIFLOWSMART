import { PRODUCT_LIST_COLUMNS } from '@/lib/columns';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSeo } from '@/hooks/useSeo';
import { PAGE_IMAGES } from '@/lib/image-config';
import { useParams, Link } from 'react-router-dom';
import { MapPin, Package, ArrowLeft, CalendarDays, ShieldCheck, ShieldAlert } from 'lucide-react';
import { Header, Footer } from '@/components/layout/Header';
import { Avatar, Badge, ProductCard } from '@/components/ui';
import { buttonStyles } from '@/components/ui/button-styles';
import { EmptyState } from '@/components/ui/States';
import { ProducerError, ProducerSkeleton } from '@/components/marketplace/MarketplaceStates';
import { ContactProducerButton } from '@/components/marketplace/ContactProducer';
import { useAuth } from '@/contexts/auth-context';
import { supabase } from '@/lib/supabase';
import type { Profile, Product, ProductWithProfile } from '@/types';
import { ROLE_LABELS, formatDate } from '@/lib/constants';
import { AvailabilityBadge } from '@/components/availability/AvailabilityBadge';
import { useLanguage } from '@/contexts/language-context';
import { useProducerPresence } from '@/hooks/useProducerPresence';
import { isProducerAccepting, presenceLabel, unavailableUntil, formatDeadline } from '@/lib/order-confirmation';

/**
 * Profil producteur public. Uniquement des données réellement présentes en base :
 * aucune note, aucun nombre de commandes, aucun revenu, aucune certification.
 * (Un comptage de commandes serait de toute façon faussé par la RLS : un visiteur
 * ne peut lire que ses propres commandes.)
 */
export function ProducerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const [profile, setProfile] = useState<Profile | null>(null);
  useSeo({
    title: profile ? `${profile.full_name} | AgriFlow RDC` : 'Producteur | AgriFlow RDC',
    description: profile ? (profile.bio?.trim().slice(0, 155) || `Découvrez les productions de ${profile.full_name} sur AgriFlow RDC.`) : undefined,
    image: profile?.avatar_url || PAGE_IMAGES.producer.url,
    imageAlt: profile?.full_name,
  });
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [profRes, prodRes] = await Promise.all([
      // Page publique (accessible sans connexion) : jamais le téléphone ici.
      supabase.from('profiles').select('id, user_id, role, buyer_type, full_name, province, city, bio, avatar_url, is_verified, is_available_for_orders, availability_until, created_at, updated_at').eq('user_id', id).maybeSingle(),
      supabase.from('products').select(PRODUCT_LIST_COLUMNS).eq('user_id', id).eq('status', 'available').order('created_at', { ascending: false }),
    ]);
    if (profRes.error) {
      setLoadError(profRes.error.message);
      setProfile(null);
    } else {
      setLoadError(null);
      setProfile(profRes.data as Profile | null);
      setProducts((prodRes.data as Product[]) ?? []);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const cards = useMemo<ProductWithProfile[]>(() => {
    if (!profile) return [];
    return products.map((p) => ({
      ...p,
      profiles: {
        full_name: profile.full_name, city: profile.city, province: profile.province,
        avatar_url: profile.avatar_url, is_verified: profile.is_verified, role: profile.role,
      },
    }));
  }, [products, profile]);

  const presence = useProducerPresence(profile?.user_id);
  const productNames = useMemo(() => [...new Set(products.map((p) => p.name))], [products]);

  if (loading) {
    return (
      <div className="min-h-screen bg-cream dark:bg-charcoal transition-colors">
        <Header />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8"><ProducerSkeleton /></div>
      </div>
    );
  }
  if (loadError || !profile) {
    return (
      <div className="min-h-screen bg-cream dark:bg-charcoal transition-colors">
        <Header />
        <ProducerError notFound={!loadError} onRetry={load} />
        <Footer />
      </div>
    );
  }

  const isOwn = user?.id === profile.user_id;

  return (
    <div className="min-h-screen bg-cream dark:bg-charcoal transition-colors">
      <Header />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <Link to="/producers" className="mb-5 inline-flex items-center gap-2 text-sm text-charcoal/50 hover:text-charcoal/80">
          <ArrowLeft className="h-4 w-4" /> Retour aux producteurs
        </Link>

        {/* En-tête profil */}
        <div className="relative mb-8 overflow-hidden rounded-3xl border border-black/[0.06] bg-offwhite">
          <div className="h-24 bg-gradient-to-r from-brand-800 via-brand-600 to-brand-500 sm:h-28" />
          <div className="px-5 pb-6 sm:px-8 sm:pb-8">
            <div className="-mt-10 flex flex-col gap-5 sm:-mt-12 sm:flex-row sm:items-end">
              <Avatar name={profile.full_name} src={profile.avatar_url} size="xl" className="shrink-0 shadow-lift ring-4 ring-offwhite" />
              <div className="min-w-0 flex-1 pt-1 sm:pb-1">
                <h1 className="text-2xl font-extrabold text-charcoal sm:text-3xl">{profile.full_name}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <Badge variant="brand">{ROLE_LABELS[profile.role]}</Badge>
                  {/* Disponibilité du PRODUCTEUR (≠ stock des produits) : affichée seulement si la donnée existe. */}
                  {(profile.role === 'producer' || profile.role === 'cooperative') && profile.is_available_for_orders !== undefined && (
                    <AvailabilityBadge accepting={isProducerAccepting(profile)} />
                  )}
                  {profile.city || profile.province ? (
                    <span className="flex items-center gap-1 text-sm text-charcoal/55">
                      <MapPin className="h-3.5 w-3.5" /> {[profile.city, profile.province].filter(Boolean).join(', ')}
                    </span>
                  ) : null}
                  <span className="flex items-center gap-1 text-sm text-charcoal/55">
                    <CalendarDays className="h-3.5 w-3.5" /> Membre depuis {formatDate(profile.created_at)}
                  </span>
                  {presenceLabel(presence?.last_seen_at, t) && (
                    <span className="flex items-center gap-1 text-sm text-charcoal/65">{presenceLabel(presence?.last_seen_at, t)}</span>
                  )}
                </div>
              </div>
              <div className="sm:pb-1">
                {isOwn ? (
                  <Link to="/profile" className={buttonStyles({ variant: 'outline' })}>Modifier mon profil</Link>
                ) : (
                  <ContactProducerButton producerId={profile.user_id} producerName={profile.full_name} variant="primary" fullWidth className="sm:w-auto" label="Contacter le producteur" />
                )}
              </div>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_280px]">
              <div>
                <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-charcoal/40">Présentation</h2>
                {profile.bio ? (
                  <p className="max-w-2xl whitespace-pre-line text-sm leading-relaxed text-charcoal/70">{profile.bio}</p>
                ) : (
                  <p className="text-sm italic text-charcoal/40">Ce producteur n'a pas encore rédigé de présentation.</p>
                )}
                {productNames.length > 0 && (
                  <div className="mt-4">
                    <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-charcoal/40">Productions</h2>
                    <div className="flex flex-wrap gap-2">
                      {productNames.map((n) => (
                        <span key={n} className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">{n}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-black/[0.06] bg-cream p-4">
                <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-charcoal/40">Statut du profil</h2>
                {profile.is_verified ? (
                  <p className="flex items-center gap-2 text-sm font-semibold text-brand-700"><ShieldCheck className="h-5 w-5" /> Profil vérifié</p>
                ) : (
                  <p className="flex items-center gap-2 text-sm font-semibold text-charcoal/60"><ShieldAlert className="h-5 w-5 text-accent-500" /> Profil non vérifié</p>
                )}
                {!isProducerAccepting(profile) && (
                  <p className="mt-3 text-sm text-charcoal/75" role="note">
                    {t('producer.noImmediate')}
                    {unavailableUntil(profile) && <> {t('producer.unavailableUntil', { date: formatDeadline(unavailableUntil(profile)!, language) })}.</>}
                  </p>
                )}
                <p className="mt-3 text-2xl font-extrabold text-charcoal tabular-nums">{products.length}</p>
                <p className="text-xs text-charcoal/50">production{products.length > 1 ? 's' : ''} disponible{products.length > 1 ? 's' : ''} actuellement</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-charcoal">Productions disponibles</h2>
          {products.length > 0 && <span className="text-sm text-charcoal/40">{products.length} résultat{products.length > 1 ? 's' : ''}</span>}
        </div>

        {cards.length === 0 ? (
          <div className="rounded-2xl border border-black/[0.06] bg-offwhite">
            <EmptyState icon={<Package className="h-8 w-8" />} title="Aucune production disponible" description="Ce producteur n'a pas de production disponible actuellement." />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3">
            {cards.map((p) => <ProductCard key={p.id} product={p} showProducer={false} />)}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
