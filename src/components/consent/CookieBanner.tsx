import { Link } from 'react-router-dom';
import { Cookie } from 'lucide-react';
import { acceptAll, openConsentPreferences, rejectNonEssential } from '@/lib/consent';
import { buttonStyles } from '@/components/ui/button-styles';

/**
 * Bannière de première visite. Non modale : le site reste consultable, aucun mur de consentement.
 * « Tout accepter » et « Refuser les cookies non essentiels » ont EXACTEMENT le même style et la même taille.
 */
export function CookieBanner() {
  return (
    <div role="region" aria-label="Consentement aux cookies" className="fixed inset-x-0 bottom-0 z-[60] border-t border-black/[0.08] bg-offwhite pb-safe shadow-[0_-8px_30px_-12px_rgba(22,58,36,0.35)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:gap-8">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="mt-0.5 hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 sm:flex" aria-hidden="true"><Cookie className="h-5 w-5" /></span>
          <p className="text-sm leading-relaxed text-charcoal/80">
            Nous utilisons des cookies nécessaires au fonctionnement d'AgriFlow et, lorsque vous l'autorisez, des cookies supplémentaires pour améliorer votre expérience.{' '}
            <Link to="/cookies" className="whitespace-nowrap font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-300">En savoir plus</Link>
          </p>
        </div>
        <div className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-3 lg:flex lg:flex-row">
          <button type="button" onClick={acceptAll} className={buttonStyles({ variant: 'primary', className: 'w-full whitespace-normal lg:w-auto' })}>Tout accepter</button>
          <button type="button" onClick={rejectNonEssential} className={buttonStyles({ variant: 'primary', className: 'w-full whitespace-normal lg:w-auto' })}>Refuser les cookies non essentiels</button>
          <button type="button" onClick={openConsentPreferences} className={buttonStyles({ variant: 'outline', className: 'w-full whitespace-normal lg:w-auto' })}>Personnaliser</button>
        </div>
      </div>
    </div>
  );
}
