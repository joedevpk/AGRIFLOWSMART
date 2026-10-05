import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export type StepNumber = 1 | 2 | 3 | 4;

const STEPS = ['Panier', 'Livraison', 'Paiement', 'Confirmation'] as const;

interface CheckoutStepperProps {
  current: StepNumber;
  /** Permet de revenir à une étape déjà franchie (jamais d'avancer sans validation). */
  onSelect?: (step: 1 | 2 | 3) => void;
}

export function CheckoutStepper({ current, onSelect }: CheckoutStepperProps) {
  return (
    <nav aria-label="Étapes de la commande">
      {/* Mobile : étape courante + barre de progression */}
      <div className="sm:hidden">
        <p className="text-sm font-semibold text-charcoal">
          Étape {current} sur 4 <span className="font-medium text-charcoal/50">— {STEPS[current - 1]}</span>
        </p>
        <div className="mt-2 flex gap-1.5" aria-hidden="true">
          {STEPS.map((label, i) => (
            <span key={label} className={cn('h-1.5 flex-1 rounded-full', i < current ? 'bg-brand-600' : 'bg-black/[0.08]')} />
          ))}
        </div>
      </div>

      {/* Tablette / bureau */}
      <ol className="hidden items-center sm:flex">
        {STEPS.map((label, i) => {
          const n = (i + 1) as StepNumber;
          const done = n < current;
          const active = n === current;
          const clickable = done && n < 4 && !!onSelect && current < 4;
          const body = (
            <>
              <span
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors',
                  done && 'bg-brand-600 text-white',
                  active && 'bg-brand-600 text-white ring-4 ring-brand-100',
                  !done && !active && 'bg-black/[0.06] text-charcoal/40',
                )}
              >
                {done ? <Check className="h-4 w-4" aria-hidden="true" /> : n}
              </span>
              <span className={cn('text-sm font-medium', active ? 'text-charcoal' : done ? 'text-charcoal/70' : 'text-charcoal/40')}>{label}</span>
            </>
          );
          return (
            <li key={label} className={cn('flex items-center', i < STEPS.length - 1 && 'flex-1')} aria-current={active ? 'step' : undefined}>
              {clickable ? (
                <button type="button" onClick={() => onSelect?.(n as 1 | 2 | 3)} className="flex items-center gap-2.5 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2">
                  {body}
                </button>
              ) : (
                <div className="flex items-center gap-2.5">{body}</div>
              )}
              {i < STEPS.length - 1 && <span className={cn('mx-3 h-0.5 flex-1 rounded-full', done ? 'bg-brand-600' : 'bg-black/[0.08]')} aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
