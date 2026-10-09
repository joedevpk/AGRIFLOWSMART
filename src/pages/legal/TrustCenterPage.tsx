import { Link } from 'react-router-dom';
import { ShieldCheck, Lock, CreditCard, UserRound, Cookie, ScrollText, Undo2, ArrowRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Header, Footer } from '@/components/layout/Header';
import { useSeo } from '@/hooks/useSeo';
import { Callout } from '@/components/legal/blocks';
import { LEGAL_UPDATED_ISO, LEGAL_UPDATED_LABEL } from '@/lib/legal/meta';
import { openConsentPreferences } from '@/lib/consent';
import { buttonStyles } from '@/components/ui/button-styles';

interface Topic { id: string; icon: LucideIcon; title: string; text: string; points: string[]; to: string; cta: string }

const TOPICS: Topic[] = [
  { id: 'confidentialite', icon: ShieldCheck, title: 'Confidentialité', text: 'Vous savez quelles données sont collectées, pourquoi, et qui peut les voir.', points: ['Données limitées à ce que les fonctions exigent.', 'Le téléphone n\'est jamais public.', 'Ni publicité, ni revente de données.'], to: '/confidentialite', cta: 'Lire la politique' },
  { id: 'securite', icon: Lock, title: 'Sécurité', text: 'Des règles d\'accès strictes protègent les données de chaque compte.', points: ['Règles d\'accès au niveau de la base (RLS).', 'Statuts de paiement modifiés côté serveur seulement.', 'Clés secrètes jamais présentes dans le navigateur.'], to: '/confidentialite#securite', cta: 'Voir les mesures' },
  { id: 'paiements', icon: CreditCard, title: 'Paiements', text: 'Le paiement en ligne se fait chez le prestataire, pas dans AgriFlow.', points: ['Carte et PIN saisis uniquement sur la page CinetPay.', 'AgriFlow ne stocke aucune donnée bancaire.', 'Ou paiement en espèces à la livraison.'], to: '/confidentialite#commandes-paiements', cta: 'Comprendre le paiement' },
  { id: 'donnees', icon: UserRound, title: 'Données personnelles', text: 'Consultez, modifiez, exportez vos données et demandez la suppression du compte.', points: ['Copie de vos données au format JSON.', 'Demande de suppression examinée avant exécution.', 'Modification du profil à tout moment.'], to: '/profile#confidentialite', cta: 'Gérer mes données' },
  { id: 'cookies', icon: Cookie, title: 'Cookies', text: 'Seuls les éléments nécessaires sont actifs sans votre accord.', points: ['Aucun outil de mesure d\'audience.', 'Préférences mémorisées avec votre accord.', 'Refuser est aussi simple qu\'accepter.'], to: '/cookies', cta: 'Politique de cookies' },
  { id: 'conditions', icon: ScrollText, title: 'Conditions d\'utilisation', text: 'Les règles du jeu pour producteurs, coopératives et acheteurs.', points: ['Publication, commandes, paiements, livraison.', 'Annulation selon le statut de la commande.', 'Éléments juridiques en cours de validation.'], to: '/conditions', cta: 'Lire les conditions' },
  { id: 'remboursements', icon: Undo2, title: 'Remboursements', text: 'Ce qui est prévu en cas d\'annulation ou de problème, sans fausse promesse.', points: ['Traitement manuel suivi par l\'administration.', 'Procédure de réclamation par contact.', 'Délais et garanties : à définir et publier.'], to: '/remboursement', cta: 'Voir la politique' },
];

const STEPS: { title: string; text: string; to: string }[] = [
  { title: 'Avant de vous inscrire', text: 'Ce que nous demandons à l\'inscription et ce qui reste public.', to: '/confidentialite#donnees-collectees' },
  { title: 'Avant de publier', text: 'Ce qui devient visible quand vous vendez.', to: '/confidentialite#producteurs' },
  { title: 'Avant de commander', text: 'Statuts, annulation et qui voit votre adresse.', to: '/conditions#commandes' },
  { title: 'Avant de payer', text: 'Où est saisi le paiement et ce qu\'AgriFlow enregistre.', to: '/confidentialite#commandes-paiements' },
];

export function TrustCenterPage() {
  useSeo({ title: 'Centre de confiance | AgriFlow RDC', description: 'Confidentialité, sécurité, paiements, données personnelles, cookies, conditions et remboursements : tout ce qu\'il faut savoir pour utiliser AgriFlow RDC en confiance.' });
  return (
    <div className="min-h-screen bg-cream dark:bg-charcoal">
      <Header />
      <main>
        <section className="bg-gradient-to-b from-brand-900 to-brand-800 py-14 sm:py-20">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-accent-400" aria-hidden="true"><ShieldCheck className="h-7 w-7" /></span>
            <h1 className="text-3xl font-bold tracking-tight text-white text-balance sm:text-5xl">Centre de confiance</h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-brand-100/90 sm:text-lg">Comprendre ce qu'AgriFlow fait de vos données, comment les paiements sont traités et quels sont vos droits — avant de vous inscrire, de publier, de commander ou de payer.</p>
            <p className="mt-4 text-sm text-brand-100/80">Dernière mise à jour : <time dateTime={LEGAL_UPDATED_ISO}>{LEGAL_UPDATED_LABEL}</time></p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8" aria-labelledby="topics-h">
          <h2 id="topics-h" className="sr-only">Nos engagements et documents</h2>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TOPICS.map((t) => (
              <li key={t.id} id={t.id} className="flex flex-col rounded-2xl border border-black/[0.06] bg-offwhite p-5 shadow-card">
                <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700" aria-hidden="true"><t.icon className="h-5 w-5" /></span>
                <h3 className="text-lg font-semibold text-charcoal">{t.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-charcoal/70">{t.text}</p>
                <ul className="mt-3 flex-1 list-disc space-y-1 pl-5 text-sm text-charcoal/70 marker:text-brand-500">{t.points.map((p) => <li key={p}>{p}</li>)}</ul>
                <Link to={t.to} className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-300">{t.cta} <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-offwhite py-12 sm:py-16" aria-labelledby="moments-h">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2 id="moments-h" className="text-2xl font-bold tracking-tight text-charcoal sm:text-3xl">Au bon moment, la bonne information</h2>
            <ol className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <li key={s.title}>
                  <Link to={s.to} className="flex h-full flex-col rounded-2xl border border-black/[0.06] bg-cream p-5 hover:border-brand-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                    <span className="text-xs font-bold uppercase tracking-wider text-brand-600 dark:text-brand-300">Étape {i + 1}</span>
                    <span className="mt-1 text-base font-semibold text-charcoal">{s.title}</span>
                    <span className="mt-1 text-sm text-charcoal/70">{s.text}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
          <Callout title="Une information honnête">
            <p>Cette page décrit l'architecture et les pratiques actuelles d'AgriFlow. Elle ne constitue ni une certification, ni une déclaration de conformité à une loi. Les textes sont en attente de validation juridique ; les éléments non décidés y sont signalés plutôt qu'inventés.</p>
          </Callout>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={openConsentPreferences} className={buttonStyles({ variant: 'outline' })}><Cookie className="h-4 w-4" aria-hidden="true" /> Gérer mes cookies</button>
            <Link to="/contact" className={buttonStyles({ variant: 'primary' })}>Une question ? Contactez-nous</Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
