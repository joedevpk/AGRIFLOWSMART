import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SectionHeaderProps {
  title: string;
  description?: string;
  eyebrow?: string;
  /** Lien ou bouton aligné à droite du titre (ex. « Voir tout »). */
  action?: ReactNode;
  align?: 'left' | 'center';
  /** Niveau de titre : h2 par défaut (le h1 appartient à la page). */
  as?: 'h2' | 'h3';
  className?: string;
}

/** Titre de section homogène : rubrique, titre, description, action optionnelle. */
export function SectionHeader({ title, description, eyebrow, action, align = 'left', as: Tag = 'h2', className }: SectionHeaderProps) {
  const centered = align === 'center';
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between', centered && 'items-center text-center sm:flex-col sm:items-center', className)}>
      <div className={cn('min-w-0', centered && 'mx-auto')}>
        {eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand-600 dark:text-brand-300">{eyebrow}</p>}
        <Tag className="text-balance text-2xl font-bold tracking-tight text-charcoal sm:text-3xl">{title}</Tag>
        {description && <p className={cn('mt-2 max-w-2xl text-base text-charcoal/60', centered && 'mx-auto')}>{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
