import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sprout, MapPin, BadgeCheck, Upload, Handshake, ShoppingBag, LayoutDashboard, ArrowRight } from 'lucide-react';
import { Header, Footer } from '@/components/layout/Header';
import { Avatar, Badge, Card, CardBody, Button, PageHero, SectionHeader, CTASection } from '@/components/ui';
import { FeatureGrid, type Feature } from '@/components/institutional/blocks';
import { useSeo } from '@/hooks/useSeo';
import { useAuth } from '@/contexts/auth-context';
import { PAGE_IMAGES } from '@/lib/image-config';
import { EmptyState } from '@/components/ui/States';
import { Skeleton } from '@/components/ui/Skeleton';
import { ProducerError } from '@/components/marketplace/MarketplaceStates';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types';
import { ROLE_LABELS } from '@/lib/constants';

const SELLER_FEATURES: Feature[] = [
  { icon: Upload, title: 'Publiez', text: 'Ajoutez vos productions avec photos, prix, unité, quantité disponible et date de disponibilité.' },
  { icon: Handshake, title: 'Trouvez des acheteurs', text: 'Votre profil et vos offres sont visibles sur la marketplace. Consultez aussi les demandes d\'achat et les correspondances Agri-Match.' },
  { icon: ShoppingBag, title: 'Recevez des commandes', text: 'Les acheteurs commandent directement auprès de vous. Confirmez, préparez et suivez chaque commande.' },
  { icon: LayoutDashboard, title: 'Gérez votre activité', text: 'Un seul espace pour vos produits, commandes, ventes, parcelles et calendrier agricole.' },
];

export function ProducersPage() {
  useSeo({
    title: 'Pour les producteurs | AgriFlow RDC',
    description: 'Donnez plus de visibilité à votre production : publiez vos produits, trouvez des acheteurs et gérez vos commandes sur AgriFlow RDC.',
    image: PAGE_IMAGES.producerCta.url,
    imageAlt: PAGE_IMAGES.producerCta.alt,
  });
  const { user, profile } = useAuth();
  const sellCta = !user ? { label: 'Commencer à vendre', to: '/register' } : profile?.role === 'buyer' ? null : { label: 'Publier un produit', to: '/producer/products/new' };
  const [producers, setProducers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('profiles')
      // Page publique (accessible sans connexion) : on ne demande jamais le
      // téléphone ici, réservé au propriétaire / admin / participants d'une
      // commande commune (voir get_profile_phone côté base de données).
      .select('id, user_id, role, buyer_type, full_name, province, city, bio, avatar_url, is_verified, created_at, updated_at')
      .in('role', ['producer', 'cooperative'])
      .order('created_at', { ascending: false })
      .limit(24);
    if (err) setError(err.message);
    else { setProducers((data as Profile[]) ?? []); setError(null); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen bg-cream dark:bg-charcoal transition-colors">
      <Header />
      <PageHero
        image={PAGE_IMAGES.producerCta}
        badge="Pour les producteurs"
        title="Donnez plus de visibilité à votre production."
        subtitle="Publiez vos produits, rencontrez des acheteurs et gérez vos commandes depuis un seul espace."
        className="py-14 sm:py-20"
      >
        {sellCta && (
          <Link to={sellCta.to}>
            <Button size="xl" variant="sun" className="group font-semibold">{sellCta.label} <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" aria-hidden="true" /></Button>
          </Link>
        )}
      </PageHero>
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <SectionHeader title="Vendez directement, sans intermédiaire" description="Ce que vous pouvez faire dès aujourd'hui sur AgriFlow RDC." className="mb-8" />
        <FeatureGrid features={SELLER_FEATURES} />
      </section>
      <div className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 lg:px-8">
        <SectionHeader title="Les producteurs de la plateforme" description="Producteurs et coopératives inscrits sur AgriFlow RDC." className="mb-6" />
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" role="status" aria-label="Chargement des producteurs">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-black/[0.06] bg-offwhite p-5 flex gap-4">
                <Skeleton className="h-14 w-14 rounded-full shrink-0" />
                <div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-5 w-20 rounded-full" /><Skeleton className="h-3 w-full" /></div>
              </div>
            ))}
          </div>
        ) : error ? <ProducerError onRetry={load} /> : producers.length === 0 ? (
          <EmptyState icon={<Sprout className="h-8 w-8" />} title="Aucun producteur inscrit" description="Soyez le premier producteur à rejoindre la plateforme." action={<Link to="/register"><Button>Créer un compte</Button></Link>} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {producers.map((p) => (
              <Link key={p.id} to={`/producer/${p.user_id}`}>
                <Card hover className="h-full">
                  <CardBody>
                    <div className="flex items-start gap-4">
                      <Avatar name={p.full_name} src={p.avatar_url} size="lg" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-charcoal truncate">{p.full_name}</h3>
                          {p.is_verified && <BadgeCheck className="h-4.5 w-4.5 text-brand-500 shrink-0" />}
                        </div>
                        <Badge variant="neutral" className="mt-1">{ROLE_LABELS[p.role]}</Badge>
                        {p.city && <p className="mt-2 flex items-center gap-1 text-sm text-charcoal/60"><MapPin className="h-3.5 w-3.5" /> {p.city}{p.province ? `, ${p.province}` : ''}</p>}
                        {p.bio && <p className="mt-2 text-sm text-charcoal/60 line-clamp-2">{p.bio}</p>}
                      </div>
                    </div>
                  </CardBody>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
      {sellCta && <CTASection title="Prêt à vendre votre production ?" description="Créez votre compte et publiez votre premier produit." primary={sellCta} secondary={{ label: 'Voir comment ça marche', to: '/comment-ca-marche' }} />}
      <Footer />
    </div>
  );
}
