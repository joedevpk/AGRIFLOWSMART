import { Link } from 'react-router-dom';
import { Mail, Phone, MessageCircle, MapPin, LifeBuoy, Info } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Header, Footer } from '@/components/layout/Header';
import { useSeo } from '@/hooks/useSeo';
import { buttonStyles } from '@/components/ui/button-styles';
import { FAQ_CATEGORY_LABELS, type FaqCategory } from '@/lib/faq';
import { CONTACT_CHANNELS, HAS_CONTACT_CHANNELS, type ContactChannel } from '@/lib/site-contact';
import { PAGE_IMAGES } from '@/lib/image-config';

const ICONS: Record<ContactChannel['id'], LucideIcon> = { email: Mail, phone: Phone, whatsapp: MessageCircle, address: MapPin };

/**
 * Contact : aucun formulaire, car le projet n'a pas de backend qui reçoive et traite ces messages.
 * Les canaux affichés viennent uniquement de VITE_CONTACT_* ; s'il n'y en a aucun, la page le dit.
 */
export function ContactPage() {
  useSeo({
    title: 'Contact | AgriFlow RDC',
    description: 'Contactez AgriFlow RDC ou consultez le centre d\'aide pour trouver rapidement une réponse.',
    image: PAGE_IMAGES.home.url,
    imageAlt: PAGE_IMAGES.home.alt,
  });
  return (
    <div className="min-h-screen bg-cream dark:bg-charcoal">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="text-3xl font-bold text-charcoal text-balance sm:text-4xl">Comment pouvons-nous vous aider ?</h1>
        <p className="mt-3 text-charcoal/65">Une question sur votre compte, une commande ou la plateforme ? Commencez par le centre d'aide, puis écrivez-nous si besoin.</p>

        <Link to="/help" className="mt-8 flex items-center gap-4 rounded-2xl border border-black/[0.06] bg-offwhite p-5 shadow-card transition-colors hover:border-brand-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><LifeBuoy className="h-6 w-6" aria-hidden="true" /></span>
          <span className="min-w-0"><span className="block font-semibold text-charcoal">Centre d'aide</span><span className="block text-sm text-charcoal/60">Réponses aux questions fréquentes sur les commandes, le paiement, la livraison…</span></span>
        </Link>

        <h2 className="mb-4 mt-10 text-lg font-semibold text-charcoal">Choisissez un sujet</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(Object.keys(FAQ_CATEGORY_LABELS) as FaqCategory[]).map((c) => (
            <li key={c}>
              <Link to={`/help?cat=${c}`} className="flex min-h-[56px] items-center justify-center rounded-xl border border-black/[0.08] bg-offwhite px-3 text-center text-sm font-semibold text-charcoal transition-colors hover:border-brand-300 hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-white/10">
                {FAQ_CATEGORY_LABELS[c]}
              </Link>
            </li>
          ))}
        </ul>

        <h2 className="mb-4 mt-10 text-lg font-semibold text-charcoal">Nous joindre</h2>
        {HAS_CONTACT_CHANNELS ? (
          <ul className="space-y-3">
            {CONTACT_CHANNELS.map((c) => {
              const Icon = ICONS[c.id];
              const body = (<><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Icon className="h-5 w-5" aria-hidden="true" /></span><span className="min-w-0"><span className="block text-xs text-charcoal/50">{c.label}</span><span className="block break-words font-medium text-charcoal">{c.value}</span></span></>);
              return (
                <li key={c.id}>
                  {c.href ? (
                    <a href={c.href} {...(c.id === 'whatsapp' ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className="flex min-h-[64px] items-center gap-4 rounded-2xl border border-black/[0.06] bg-offwhite p-4 hover:border-brand-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">{body}</a>
                  ) : (
                    <div className="flex items-center gap-4 rounded-2xl border border-black/[0.06] bg-offwhite p-4">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex items-start gap-3 rounded-2xl border border-accent-300 bg-accent-50 p-5 text-sm text-accent-700">
            <Info className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p>Les coordonnées officielles d'AgriFlow ne sont pas encore publiées sur cette page. En attendant, le centre d'aide répond aux questions les plus fréquentes.</p>
          </div>
        )}
        <div className="mt-8"><Link to="/help" className={buttonStyles({ variant: 'outline' })}>Voir le centre d'aide</Link></div>
      </main>
      <Footer />
    </div>
  );
}
