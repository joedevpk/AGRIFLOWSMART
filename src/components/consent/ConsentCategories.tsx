import { useId } from 'react';
import { Lock, Palette, BarChart3, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ANALYTICS_AVAILABLE, type ConsentChoices } from '@/lib/consent';
import { cn } from '@/lib/utils';

/** Interrupteur accessible (role="switch"), zone tactile ≥ 44 px. */
function Switch({ checked, onChange, labelledBy, describedBy }: { checked: boolean; onChange: (v: boolean) => void; labelledBy: string; describedBy: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-11 w-[68px] shrink-0 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
    >
      <span className={cn('relative block h-7 w-12 rounded-full border transition-colors motion-reduce:transition-none', checked ? 'border-brand-700 bg-brand-600' : 'border-charcoal/40 bg-charcoal/30')}>
        <span className={cn('absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform motion-reduce:transition-none', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
      </span>
    </button>
  );
}

interface Category {
  id: 'necessary' | 'preferences' | 'analytics';
  icon: LucideIcon;
  title: string;
  purpose: string;
  description: string;
  stored: string;
}

const CATEGORIES: Category[] = [
  {
    id: 'necessary',
    icon: ShieldCheck,
    title: 'Cookies nécessaires',
    purpose: 'Faire fonctionner AgriFlow.',
    description: 'Indispensables : connexion à votre compte, panier, brouillons de commande ou de publication, file d\'actions hors connexion, mémorisation de ce choix. Sans eux, le service ne peut pas fonctionner. Ils ne peuvent pas être désactivés.',
    stored: 'Session de connexion, panier, brouillons, file hors connexion, choix de consentement.',
  },
  {
    id: 'preferences',
    icon: Palette,
    title: 'Cookies de préférences',
    purpose: 'Retenir votre confort d\'affichage.',
    description: 'Mémorisent votre thème (clair ou sombre) et votre langue d\'un passage à l\'autre. Si vous les refusez, ces réglages fonctionnent pendant votre visite mais sont oubliés à la fermeture.',
    stored: 'Thème d\'affichage, langue de l\'interface.',
  },
  {
    id: 'analytics',
    icon: BarChart3,
    title: 'Cookies analytiques',
    purpose: 'Mesurer l\'audience.',
    description: ANALYTICS_AVAILABLE
      ? 'Nous aident à comprendre comment le site est utilisé, afin de l\'améliorer.'
      : 'AgriFlow n\'utilise actuellement aucun outil de mesure d\'audience ni de publicité. Cette catégorie n\'est donc pas active et ne peut pas être activée.',
    stored: ANALYTICS_AVAILABLE ? 'Statistiques d\'usage.' : 'Aucune donnée.',
  },
];

export function ConsentCategories({ value, onChange }: { value: ConsentChoices; onChange: (next: ConsentChoices) => void }) {
  const uid = useId();
  return (
    <ul className="space-y-3">
      {CATEGORIES.map((c) => {
        const titleId = `${uid}-${c.id}-title`;
        const descId = `${uid}-${c.id}-desc`;
        const locked = c.id === 'necessary';
        const unavailable = c.id === 'analytics' && !ANALYTICS_AVAILABLE;
        const checked = locked ? true : c.id === 'preferences' ? value.preferences : value.analytics && ANALYTICS_AVAILABLE;
        const state = locked ? 'Toujours actifs' : unavailable ? 'Non utilisés' : checked ? 'Activés' : 'Désactivés';
        return (
          <li key={c.id} className="rounded-2xl border border-black/[0.08] bg-offwhite p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700" aria-hidden="true"><c.icon className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <h3 id={titleId} className="text-base font-semibold text-charcoal">{c.title}</h3>
                  <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', checked || locked ? 'bg-brand-100 text-brand-800' : 'bg-charcoal/10 text-charcoal/70')}>
                    {locked && <Lock className="h-3 w-3" aria-hidden="true" />}{state}
                  </span>
                </div>
                <p className="mt-1 text-sm font-medium text-brand-700 dark:text-brand-300">Objectif : {c.purpose}</p>
              </div>
              {!locked && !unavailable && <Switch checked={checked} onChange={(v) => onChange({ ...value, [c.id]: v })} labelledBy={titleId} describedBy={descId} />}
            </div>
            <p id={descId} className="mt-3 text-sm leading-relaxed text-charcoal/70">{c.description}</p>
            <p className="mt-2 text-xs text-charcoal/70"><span className="font-semibold">Concerne :</span> {c.stored}</p>
          </li>
        );
      })}
    </ul>
  );
}
