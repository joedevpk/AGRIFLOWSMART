import { Search, Package, ShoppingCart, Boxes, Truck } from 'lucide-react';
import { Header, Footer } from '@/components/layout/Header';
import { PageHero } from '@/components/ui';
import { CtaBand, FeatureGrid, Notice, Section, type Feature } from '@/components/institutional/blocks';
import { useSeo } from '@/hooks/useSeo';
import { PAGE_IMAGES } from '@/lib/image-config';

const FEATURES: Feature[] = [
  { icon: Search, title: 'Recherche de fournisseurs', text: 'Trouvez des producteurs et coopératives par produit, catégorie ou province, et consultez leur profil.' },
  { icon: Package, title: 'Produits disponibles', text: 'Quantités, unités et prix affichés par offre, avec la date de disponibilité indiquée par le producteur.' },
  { icon: ShoppingCart, title: 'Commandes', text: 'Commandez directement auprès du producteur et suivez chaque commande depuis votre espace.' },
  { icon: Boxes, title: 'Approvisionnement', text: 'Publiez une demande d\'achat : Agri-Match vous propose les offres qui correspondent (produit, quantité, lieu, budget).' },
  { icon: Truck, title: 'Livraison', text: 'Renseignez l\'adresse de livraison et suivez les étapes jusqu\'à la réception.' },
];

const TARGETS = ['Restaurants', 'Hôtels', 'Supermarchés', 'Transformateurs', 'Distributeurs', 'Entreprises agroalimentaires'];

export function EnterprisesPage() {
  useSeo({
    title: 'Approvisionnement agricole pour les entreprises | AgriFlow',
    description: 'Restaurants, hôtels, supermarchés, transformateurs : approvisionnez votre activité directement auprès des producteurs agricoles de RDC.',
    image: PAGE_IMAGES.buyer.url,
    imageAlt: PAGE_IMAGES.buyer.alt,
  });
  return (
    <div className="min-h-screen bg-cream dark:bg-charcoal">
      <Header />
      <PageHero image={PAGE_IMAGES.buyer} badge="Entreprises" title="Approvisionnez votre activité directement auprès des producteurs." subtitle="Fiabilité, visibilité et simplicité pour vos achats agricoles." />
      <Section>
        <ul className="flex flex-wrap gap-2" aria-label="Entreprises concernées">
          {TARGETS.map((t) => <li key={t} className="rounded-full border border-brand-200 bg-offwhite px-4 py-2 text-sm font-medium text-brand-800">{t}</li>)}
        </ul>
      </Section>
      <Section tone="soft" title="Comment AgriFlow vous aide à vous approvisionner"><FeatureGrid features={FEATURES} /></Section>
      <Section><Notice>Traçabilité : AgriFlow affiche le producteur, sa localisation et la date de disponibilité de chaque offre. Il n'existe pas de traçabilité de lot ni de certification de qualité à ce jour.</Notice></Section>
      <CtaBand title="Créez votre compte acheteur" actions={[{ label: 'Créer un compte', to: '/register' }, { label: 'Explorer les produits', to: '/marketplace', variant: 'outline' }]} />
      <Footer />
    </div>
  );
}
