import { BookOpen, CalendarDays, ShieldCheck, ShoppingBasket, Truck, Wallet } from 'lucide-react';
import { Header, Footer } from '@/components/layout/Header';
import { PageHero } from '@/components/ui/PageHero';
import { FounderSection } from '@/components/about/FounderSection';
import { CtaBand, FeatureGrid, Section } from '@/components/institutional/blocks';
import { useSeo } from '@/hooks/useSeo';
import { PAGE_IMAGES } from '@/lib/image-config';

/** « À propos d'AgriFlow » : mission, services réellement disponibles, créateur du projet. Aucun chiffre ni témoignage inventé. */
export function AboutPage() {
  useSeo({
    title: 'À propos | AgriFlow RDC',
    description: 'AgriFlow RDC facilite les échanges entre producteurs, acheteurs et autres acteurs du secteur agricole en République démocratique du Congo. Découvrez la plateforme et son créateur.',
    image: PAGE_IMAGES.about.url,
    imageAlt: PAGE_IMAGES.about.alt,
  });

  return (
    <div className="min-h-screen bg-cream dark:bg-charcoal">
      <Header />
      <PageHero image={PAGE_IMAGES.about} badge="À propos" title="À propos d'AgriFlow RDC" subtitle="Du producteur au marché, simplement." />

      <Section title="Notre mission" intro="Faciliter les échanges entre les producteurs, les acheteurs et les autres acteurs du secteur agricole en République démocratique du Congo : publier une offre, trouver un produit, commander et suivre la livraison, depuis un téléphone comme depuis un ordinateur.">
        <FeatureGrid features={[
          { icon: ShoppingBasket, title: 'Une marketplace agricole', text: 'Les producteurs publient leurs offres ; les acheteurs recherchent, comparent et commandent la quantité dont ils ont besoin.' },
          { icon: Truck, title: 'Un suivi de commande', text: 'Chaque commande a un statut clair, du producteur à la livraison, consultable à tout moment.' },
          { icon: Wallet, title: 'Paiement à la livraison, en ligne bientôt', text: 'Le paiement à la livraison est disponible. Le paiement en ligne est en cours d\'activation et ne sera proposé qu\'une fois confirmé par le prestataire.' },
          { icon: BookOpen, title: 'Des outils pour produire', text: 'AgriGuide et le calendrier agricole accompagnent le producteur, de la parcelle à la récolte.' },
          { icon: CalendarDays, title: 'Pensé pour le terrain', text: 'Une interface adaptée aux petits écrans et aux connexions lentes, avec une application Android.' },
          { icon: ShieldCheck, title: 'Des règles claires', text: 'Données protégées, commissions et conditions publiées : voir le centre de confiance.' },
        ]} />
      </Section>

      <Section tone="soft">
        <FounderSection />
      </Section>

      <CtaBand
        title="Découvrir les offres du moment"
        text="Parcourez la marketplace ou écrivez-nous pour toute question sur la plateforme."
        actions={[{ label: 'Explorer la marketplace', to: '/marketplace', variant: 'primary' }, { label: 'Nous contacter', to: '/contact', variant: 'outline' }]}
      />
      <Footer />
    </div>
  );
}
