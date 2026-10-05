import { ClipboardList, LayoutGrid, Handshake, ShoppingBag, Eye, Users } from 'lucide-react';
import { Header, Footer } from '@/components/layout/Header';
import { PageHero } from '@/components/ui';
import { CtaBand, FeatureGrid, Notice, Section, type Feature } from '@/components/institutional/blocks';
import { useSeo } from '@/hooks/useSeo';
import { PAGE_IMAGES } from '@/lib/image-config';

const FEATURES: Feature[] = [
  { icon: ClipboardList, title: 'Gestion de la production', text: 'Publiez les quantités disponibles, les prix et les dates de disponibilité, et tenez-les à jour.' },
  { icon: LayoutGrid, title: 'Catalogue', text: 'Présentez vos productions avec photos et description dans un catalogue consultable par les acheteurs.' },
  { icon: Handshake, title: 'Mise en relation avec les acheteurs', text: 'Consultez les demandes d\'achat publiées et les correspondances Agri-Match avec vos offres.' },
  { icon: ShoppingBag, title: 'Commandes', text: 'Recevez, confirmez et suivez les commandes jusqu\'à la livraison depuis un seul espace.' },
  { icon: Eye, title: 'Visibilité', text: 'Votre profil et vos offres sont visibles sur la marketplace, sans intermédiaire.' },
  { icon: Users, title: 'Organisation', text: 'Un espace de gestion pour suivre vos parcelles, votre calendrier agricole et vos ventes.' },
];

export function CooperativesPage() {
  useSeo({
    title: 'AgriFlow RDC pour les coopératives',
    description: 'Donnez plus de visibilité à votre production collective : catalogue, commandes et mise en relation avec les acheteurs sur AgriFlow RDC.',
    image: PAGE_IMAGES.producer.url,
    imageAlt: PAGE_IMAGES.producer.alt,
  });
  return (
    <div className="min-h-screen bg-cream dark:bg-charcoal">
      <Header />
      <PageHero image={PAGE_IMAGES.producer} badge="Coopératives" title="Donnez plus de visibilité à votre production collective." subtitle="Catalogue, commandes et mise en relation avec les acheteurs, dans un seul espace." />
      <Section title="Ce que la plateforme vous apporte" intro="Des fonctionnalités disponibles aujourd'hui dans AgriFlow."><FeatureGrid features={FEATURES} /></Section>
      <Section><Notice>Un compte « Coopérative » est un compte unique par organisation. La gestion individuelle des membres n'existe pas encore. Pour toute question, passez par la page Contact.</Notice></Section>
      <CtaBand title="Rejoignez AgriFlow" text="Créez le compte de votre coopérative en quelques minutes." actions={[{ label: 'Rejoindre AgriFlow', to: '/register' }, { label: 'Nous contacter', to: '/contact', variant: 'outline' }]} />
      <Footer />
    </div>
  );
}
