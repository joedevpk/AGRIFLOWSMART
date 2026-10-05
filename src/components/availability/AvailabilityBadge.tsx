import { CheckCircle2, PauseCircle } from 'lucide-react';
import { useLanguage } from '@/contexts/language-context';
import { cn } from '@/lib/utils';

interface AvailabilityBadgeProps {
  /** Le producteur accepte-t-il de nouvelles commandes ? (jamais inventé : à n'afficher que si la donnée existe) */
  accepting: boolean;
  className?: string;
}

/** Statut de disponibilité du PRODUCTEUR (distinct du stock du produit). Texte + icône : jamais la couleur seule. */
export function AvailabilityBadge({ accepting, className }: AvailabilityBadgeProps) {
  const { t } = useLanguage();
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        accepting
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-700/50 dark:bg-emerald-900/30 dark:text-emerald-200'
          : 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200',
        className,
      )}
    >
      {accepting ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <PauseCircle className="h-3.5 w-3.5" aria-hidden="true" />}
      {accepting ? t('producer.available') : t('producer.unavailable')}
    </span>
  );
}
