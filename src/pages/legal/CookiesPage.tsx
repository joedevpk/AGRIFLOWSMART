import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Cookie, CheckCircle2 } from 'lucide-react';
import { LegalLayout, type LegalSectionDef } from '@/components/legal/LegalLayout';
import { CardTable, Callout, Todo } from '@/components/legal/blocks';
import { ConsentCategories } from '@/components/consent/ConsentCategories';
import { acceptAll, getConsent, rejectNonEssential, saveConsent, useConsentState, type ConsentChoices } from '@/lib/consent';
import { buttonStyles } from '@/components/ui/button-styles';

/** Interface de gestion intégrée à la page : mêmes catégories et mêmes actions que la fenêtre de préférences. */
function ManageConsent() {
  const { record } = useConsentState();
  const [choices, setChoices] = useState<ConsentChoices>(() => ({ preferences: getConsent()?.preferences ?? false, analytics: getConsent()?.analytics ?? false }));
  const [saved, setSaved] = useState(false);
  const wrap = (fn: () => void) => () => { fn(); setSaved(true); };
  return (
    <div className="not-prose mt-2 rounded-3xl border border-brand-200 bg-brand-50/60 p-4 dark:border-white/10 dark:bg-white/[0.04] sm:p-6">
      <p className="mb-4 text-sm text-charcoal/70" role="status" aria-live="polite">
        {record ? (<>Votre choix actuel a été enregistré le {new Date(record.decidedAt).toLocaleDateString('fr-FR')}.</>) : 'Vous n\'avez pas encore fait de choix : seuls les cookies nécessaires sont utilisés.'}
        {saved && <span className="ml-2 inline-flex items-center gap-1 font-semibold text-brand-800 dark:text-brand-200"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Préférences enregistrées.</span>}
      </p>
      <ConsentCategories value={choices} onChange={(c) => { setChoices(c); setSaved(false); }} />
      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        <button type="button" onClick={wrap(() => saveConsent(choices))} className={buttonStyles({ variant: 'primary', className: 'w-full whitespace-normal' })}>Enregistrer mes préférences</button>
        <button type="button" onClick={wrap(() => { acceptAll(); setChoices({ preferences: true, analytics: false }); })} className={buttonStyles({ variant: 'outline', className: 'w-full whitespace-normal' })}>Tout accepter</button>
        <button type="button" onClick={wrap(() => { rejectNonEssential(); setChoices({ preferences: false, analytics: false }); })} className={buttonStyles({ variant: 'outline', className: 'w-full whitespace-normal' })}>Refuser les non essentiels</button>
      </div>
    </div>
  );
}

const sections: LegalSectionDef[] = [
  {
    id: 'definition', title: 'Qu\'est-ce qu\'un cookie ?',
    content: (<>
      <p>Un cookie est un petit fichier enregistré sur votre appareil lorsque vous visitez un site. Des technologies voisines (le « stockage local » du navigateur) jouent le même rôle : retenir une information d'une page à l'autre ou d'une visite à l'autre.</p>
      <Callout title="Ce que fait AgriFlow" tone="good">AgriFlow ne pose pas de cookie HTTP. Il utilise le stockage local de votre navigateur (localStorage, sessionStorage) et un cache pour le mode hors connexion. Par transparence, nous appliquons à ces éléments les mêmes règles que pour des cookies.</Callout>
    </>),
  },
  {
    id: 'usage', title: 'Pourquoi AgriFlow en utilise',
    content: (<ul>
      <li>vous garder connecté, garder votre panier et vos brouillons ;</li>
      <li>permettre le mode faible connexion et hors connexion ;</li>
      <li>retenir votre thème et votre langue, si vous l'autorisez.</li>
    </ul>),
  },
  {
    id: 'necessaires', title: 'Cookies nécessaires',
    content: (<>
      <p>Ils sont indispensables au service et ne demandent pas votre accord. Vous pouvez les effacer depuis votre navigateur, mais certaines fonctions cesseront de marcher.</p>
      <CardTable caption="Éléments nécessaires" columns={['Élément', 'Rôle', 'Durée']} rows={[
        ['Session de connexion (clé « sb-…-auth-token »)', 'Vous garder connecté à votre compte.', 'Jusqu\'à la déconnexion ou l\'expiration de la session.'],
        ['Panier (clés « agriflow.cart.v1 »)', 'Conserver les offres ajoutées, par compte ou en visiteur.', 'Jusqu\'à la validation de la commande ou au vidage du panier.'],
        ['Brouillon de commande (sessionStorage)', 'Ne pas perdre votre saisie si la page se recharge.', 'Durée de l\'onglet.'],
        ['Brouillons, données Ma Parcelle et file d\'actions (clés « agriflow:v1:… »)', 'Fonctionnement hors connexion et brouillons de publication.', 'Jusqu\'à l\'envoi, la suppression, ou l\'effacement des données du navigateur.'],
        ['Cache hors connexion (« agriflow-shell-v1 »)', 'Charger l\'application avec une connexion faible.', 'Jusqu\'à mise à jour de l\'application ou effacement.'],
        ['Votre choix de cookies (« agriflow_consent »)', 'Se souvenir de ce que vous avez accepté ou refusé.', 'Aucune expiration automatique aujourd\'hui.'],
      ]} />
    </>),
  },
  {
    id: 'preferences', title: 'Cookies de préférences',
    content: (<>
      <CardTable caption="Éléments de préférences" columns={['Élément', 'Rôle', 'Durée']} rows={[
        ['Thème (« agriflow_theme »)', 'Retenir le mode clair ou sombre.', 'Jusqu\'à retrait de votre accord ou effacement.'],
        ['Langue (« agriflow_language »)', 'Retenir la langue de l\'interface.', 'Jusqu\'à retrait de votre accord ou effacement.'],
      ]} />
      <p>Ils ne sont enregistrés <strong>qu'avec votre accord</strong>. Sans accord, le thème et la langue restent modifiables pendant la visite mais ne sont pas mémorisés. Si vous retirez votre accord, ces éléments sont supprimés immédiatement.</p>
    </>),
  },
  {
    id: 'analytiques', title: 'Cookies analytiques',
    content: (<>
      <p><strong>AgriFlow n'utilise actuellement aucun outil de mesure d'audience ni de publicité.</strong> Aucun cookie analytique n'est donc posé, quel que soit votre choix. Si un outil est ajouté un jour, il ne sera activé qu'avec votre accord explicite et cette page sera mise à jour.</p>
    </>),
  },
  {
    id: 'durees', title: 'Durées de conservation',
    content: (<>
      <p>Les durées sont indiquées dans les tableaux ci-dessus. AgriFlow ne fixe pas de durée d'expiration automatique pour le stockage local : les éléments restent jusqu'à ce que vous, ou l'application, les supprimiez.</p>
      <Todo><p>Durée de validité du choix de consentement (par exemple redemander le choix après un certain temps) : à décider avec un conseil juridique. Aucune durée n'est annoncée.</p></Todo>
    </>),
  },
  {
    id: 'gestion', title: 'Gérer mon consentement',
    content: (<>
      <p>Vous pouvez modifier vos choix ici, à tout moment, ou via « Gestion des cookies » dans le pied de page. Refuser est aussi simple qu'accepter.</p>
      <ManageConsent />
    </>),
  },
  {
    id: 'tiers', title: 'Services tiers',
    content: (<>
      <ul>
        <li><strong>Google Fonts</strong> : la police d'écriture est chargée depuis les serveurs de Google, qui reçoivent votre adresse IP.</li>
        <li><strong>Images d'illustration</strong> hébergées par des sites tiers (crédits dans le projet) : même principe.</li>
        <li><strong>CinetPay</strong> : la page de paiement en ligne est hébergée par ce prestataire, avec ses propres règles ; elle s'ouvre hors d'AgriFlow.</li>
      </ul>
      <p>Pour en savoir plus sur vos données : <Link to="/confidentialite">politique de confidentialité</Link>.</p>
      <Todo><p>Envisager l'auto-hébergement des polices pour supprimer l'appel à Google Fonts, puis mettre à jour ce texte.</p></Todo>
    </>),
  },
];

export function CookiesPage() {
  return (
    <LegalLayout
      path="/cookies"
      icon={Cookie}
      title="Politique de cookies"
      intro="Ce qu'AgriFlow enregistre sur votre appareil, pourquoi, pour combien de temps — et comment garder la main."
      seo={{ title: 'Politique de cookies | AgriFlow RDC', description: 'Ce que sont les cookies, ceux qu\'AgriFlow RDC utilise (nécessaires, préférences), leur durée, et comment gérer votre consentement.' }}
      sections={sections}
    />
  );
}
