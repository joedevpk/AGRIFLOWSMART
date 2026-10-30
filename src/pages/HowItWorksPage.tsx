import { Link } from 'react-router-dom';
import { UserPlus, PackageCheck, Search, ShoppingCart, CreditCard, Truck, Wallet, ArrowRight, MapPin, BadgeCheck, TrendingUp, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Header, Footer } from '@/components/layout/Header';
import { PageHero } from '@/components/ui';
import { buttonStyles } from '@/components/ui/button-styles';
import { CtaBand, Notice, Section } from '@/components/institutional/blocks';
import { useSeo } from '@/hooks/useSeo';
import { PAGE_IMAGES } from '@/lib/image-config';
import { cn } from '@/lib/utils';

interface Step { num: string; title: string; text: string; icon: LucideIcon; note?: string }

/** Uniquement ce qui est réellement implémenté ; les étapes encore manuelles sont signalées. */
const STEPS: Step[] = [
  { num: '01', title: 'Le producteur crée son profil', text: 'Inscription comme producteur ou coopérative : nom, localisation, présentation.', icon: UserPlus },
  { num: '02', title: 'Il publie sa production', text: 'Produit, quantité, prix, localisation, photos et date de disponibilité.', icon: PackageCheck },
  { num: '03', title: 'Les acheteurs découvrent les produits', text: 'Recherche par produit, catégorie ou province sur la marketplace ; les acheteurs peuvent aussi publier une demande d\'achat (Agri-Match).', icon: Search },
  { num: '04', title: 'L\'acheteur passe commande', text: 'Il choisit la quantité, renseigne l\'adresse de livraison ; le producteur est notifié et confirme la commande.', icon: ShoppingCart },
  { num: '05', title: 'Le paiement est effectué', text: 'En espèces à la livraison. Le paiement en ligne (Mobile Money) sera proposé dès son activation.', icon: CreditCard },
  { num: '06', title: 'La livraison est suivie', text: 'Préparation, livraison et réception sont suivies étape par étape dans l\'application.', icon: Truck, note: 'AgriFlow suit le statut de la livraison ; il n\'affecte pas automatiquement de transporteur.' },
  { num: '07', title: 'Le producteur reçoit son paiement', text: 'Lorsque le paiement est confirmé, le montant net (produits moins commission validée de la plateforme) est calculé pour le producteur.', icon: Wallet, note: 'Le versement au producteur est aujourd\'hui un processus manuel, pas un virement automatique.' },
];

function Timeline() {
  return (
    <ol className="relative mx-auto max-w-4xl">
      <span className="absolute bottom-2 left-[22px] top-2 w-px bg-brand-200 lg:left-1/2 lg:-translate-x-1/2" aria-hidden="true" />
      {STEPS.map((s, i) => {
        const right = i % 2 === 1;
        return (
          <li key={s.num} className="relative pb-8 pl-14 last:pb-0 motion-safe:animate-fade-up lg:grid lg:grid-cols-2 lg:gap-16 lg:pl-0" style={{ animationDelay: `${i * 60}ms` }}>
            <span className="absolute left-0 top-0 flex h-11 w-11 items-center justify-center rounded-full border-4 border-cream bg-brand-600 text-sm font-bold text-white lg:left-1/2 lg:-translate-x-1/2" aria-hidden="true">{s.num}</span>
            <div className={cn('rounded-2xl border border-black/[0.06] bg-offwhite p-5 shadow-card', right ? 'lg:col-start-2' : 'lg:col-start-1 lg:text-right')}>
              <span className={cn('mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700', !right && 'lg:ml-auto')}><s.icon className="h-5 w-5" aria-hidden="true" /></span>
              <h3 className="text-base font-semibold text-charcoal sm:text-lg"><span className="sr-only">Étape {s.num} : </span>{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-charcoal/65">{s.text}</p>
              {s.note && <p className="mt-3 rounded-lg bg-accent-50 px-3 py-2 text-xs font-medium text-accent-700 lg:text-left">{s.note}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function HowItWorksPage() {
  useSeo({
    title: 'Comment ça marche | AgriFlow RDC',
    description: 'De la publication de la production à la livraison : découvrez en quelques étapes comment AgriFlow RDC relie les producteurs agricoles aux acheteurs.',
    image: PAGE_IMAGES.howItWorks.url,
    imageAlt: PAGE_IMAGES.howItWorks.alt,
  });

  const producer = [
    { icon: PackageCheck, text: 'Publiez vos productions en quelques minutes' },
    { icon: TrendingUp, text: 'Fixez vos prix et indiquez la disponibilité' },
    { icon: BadgeCheck, text: 'Recevez des commandes directement des acheteurs' },
    { icon: ShieldCheck, text: 'Paiement à la livraison ; paiement en ligne bientôt' },
  ];
  const buyer = [
    { icon: Search, text: 'Recherchez par produit, catégorie ou localisation' },
    { icon: MapPin, text: 'Comparez les producteurs près de chez vous' },
    { icon: ShoppingCart, text: 'Commandez la quantité exacte dont vous avez besoin' },
    { icon: Truck, text: 'Suivez chaque étape jusqu\'à la livraison' },
  ];

  return (
    <div className="min-h-screen bg-cream dark:bg-charcoal">
      <Header />
      <PageHero image={PAGE_IMAGES.howItWorks} badge="Comment ça marche" title="Du producteur au marché, simplement." subtitle="Sept étapes, de la publication de la production à la livraison. Ce que vous voyez ici est ce que la plateforme fait réellement aujourd'hui." />
      <Section title="Le parcours en 7 étapes"><Timeline /></Section>

      <Section tone="soft">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
          {[{ badge: 'Pour les producteurs', title: 'Vendez sans intermédiaire', items: producer, cta: { label: 'Commencer à vendre', to: '/register' } },
            { badge: 'Pour les acheteurs', title: 'Approvisionnez-vous directement', items: buyer, cta: { label: 'Explorer les produits', to: '/marketplace' } }].map((col) => (
            <div key={col.badge}>
              <span className="inline-flex rounded-full border border-brand-200 bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700">{col.badge}</span>
              <h2 className="mt-3 text-2xl font-bold text-charcoal sm:text-3xl">{col.title}</h2>
              <ul className="mt-6 space-y-4">
                {col.items.map((it) => (
                  <li key={it.text} className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><it.icon className="h-5 w-5" aria-hidden="true" /></span><p className="pt-2 text-sm text-charcoal/75">{it.text}</p></li>
                ))}
              </ul>
              <Link to={col.cta.to} className={buttonStyles({ className: 'mt-7' })}>{col.cta.label} <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
            </div>
          ))}
        </div>
      </Section>

      <Section><Notice>Transparence : le versement des fonds au producteur (étape 07) et l'affectation d'un transporteur (étape 06) ne sont pas automatisés à ce jour.</Notice></Section>
      <CtaBand title="Prêt à démarrer ?" actions={[{ label: 'Commencer à vendre', to: '/register' }, { label: 'Explorer les produits', to: '/marketplace', variant: 'outline' }]} />
      <Footer />
    </div>
  );
}
