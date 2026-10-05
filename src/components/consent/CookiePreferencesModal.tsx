import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { acceptAll, closeConsentPreferences, getConsent, rejectNonEssential, saveConsent, type ConsentChoices } from '@/lib/consent';
import { useModalA11y } from '@/hooks/useModalA11y';
import { buttonStyles } from '@/components/ui/button-styles';
import { ConsentCategories } from './ConsentCategories';

function initialChoices(): ConsentChoices {
  const c = getConsent();
  // Sans choix préalable, tout ce qui est optionnel démarre DÉSACTIVÉ (pas de pré-cochage).
  return { preferences: c?.preferences ?? false, analytics: c?.analytics ?? false };
}

export function CookiePreferencesModal() {
  const ref = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [choices, setChoices] = useState<ConsentChoices>(initialChoices);
  // Le composant n'est monté que lorsque le panneau est ouvert : l'état part toujours du choix enregistré.
  useModalA11y(true, closeConsentPreferences, ref, titleRef);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-brand-950/60" onClick={closeConsentPreferences} aria-hidden="true" />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="consent-title" className="relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-cream shadow-lift sm:rounded-3xl">
        <div className="flex items-start justify-between gap-4 border-b border-black/[0.08] px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="consent-title" ref={titleRef} tabIndex={-1} className="text-xl font-bold text-charcoal focus:outline-none">Préférences de confidentialité</h2>
            <p className="mt-1 text-sm text-charcoal/70">Choisissez ce que vous autorisez. Vous pouvez modifier ces choix à tout moment depuis le pied de page. <Link to="/cookies" onClick={closeConsentPreferences} className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-300">Politique de cookies</Link></p>
          </div>
          <button type="button" onClick={closeConsentPreferences} aria-label="Fermer sans modifier mes choix" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-charcoal/70 hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><X className="h-5 w-5" aria-hidden="true" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6"><ConsentCategories value={choices} onChange={setChoices} /></div>
        <div className="grid gap-2 border-t border-black/[0.08] bg-offwhite px-5 py-4 pb-safe sm:grid-cols-3 sm:px-6">
          <button type="button" onClick={() => saveConsent(choices)} className={buttonStyles({ variant: 'primary', className: 'w-full whitespace-normal' })}>Enregistrer mes préférences</button>
          <button type="button" onClick={acceptAll} className={buttonStyles({ variant: 'outline', className: 'w-full whitespace-normal' })}>Tout accepter</button>
          <button type="button" onClick={rejectNonEssential} className={buttonStyles({ variant: 'outline', className: 'w-full whitespace-normal' })}>Refuser les non essentiels</button>
        </div>
      </div>
    </div>
  );
}
