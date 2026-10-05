import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Petit libellé au-dessus du titre (rubrique). */
  eyebrow?: string;
  /** Boutons à droite du titre (passent sous le titre sur mobile). */
  actions?: ReactNode;
  /** Contenu sous le titre : recherche, onglets… */
  children?: ReactNode;
  className?: string;
}

/**
 * En-tête léger et sobre des pages internes (Marketplace, listes, tableaux de bord…).
 * Un seul <h1> par page. Fonctionne en clair et en sombre (dégradé adapté, pas inversé).
 * Ne remplace pas le hero photo de l'accueil : utiliser `PageHero` pour les pages institutionnelles.
 */
export function PageHeader({ title, description, eyebrow, actions, children, className }: PageHeaderProps) {
  return (
    <section
      className={cn(
        'border-b border-black/[0.06] bg-gradient-to-b from-brand-50/70 to-offwhite dark:border-white/10 dark:from-white/[0.04] dark:to-transparent',
        className,
      )}
    >
      <div className="mx-auto max-w-7xl px-4 pb-6 pt-8 sm:px-6 sm:pt-10 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            {eyebrow && (
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand-600 dark:text-brand-300">{eyebrow}</p>
            )}
            <h1 className="text-balance text-3xl font-extrabold tracking-tight text-charcoal sm:text-4xl">{title}</h1>
            {description && <p className="mt-2 max-w-2xl text-base text-charcoal/60">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
        </div>
        {children && <div className="mt-5">{children}</div>}
      </div>
    </section>
  );
}
