import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { clampQuantity } from '@/lib/cart';
import { cn } from '@/lib/utils';

interface QuantityStepperProps {
  value: number;
  /** Stock disponible (la quantité ne peut jamais le dépasser ni être inférieure à 1). */
  max: number;
  onChange: (quantity: number) => void;
  /** Libellé accessible, ex. « Quantité de Maïs en kg ». */
  label: string;
  disabled?: boolean;
  className?: string;
}

/** Sélecteur de quantité : boutons ≥ 44 px, saisie libre validée à la sortie du champ. */
export function QuantityStepper({ value, max, onChange, label, disabled, className }: QuantityStepperProps) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = (raw: string) => {
    const parsed = raw.trim() === '' ? value : Number(raw);
    const next = clampQuantity(parsed, max);
    setDraft(String(next));
    if (next !== value) onChange(next);
  };

  const atMin = value <= 1;
  const atMax = value >= Math.floor(max);
  const buttonClass =
    'flex h-11 w-11 items-center justify-center text-charcoal/70 transition-colors hover:bg-brand-50 hover:text-charcoal focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent';

  return (
    <div className={cn('inline-flex items-center overflow-hidden rounded-xl border border-black/[0.1] bg-white', className)} role="group" aria-label={label}>
      <button type="button" className={buttonClass} onClick={() => commit(String(value - 1))} disabled={disabled || atMin} aria-label="Diminuer la quantité">
        <Minus className="h-4 w-4" aria-hidden="true" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={draft}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit(e.currentTarget.value);
          }
        }}
        className="h-11 w-16 border-x border-black/[0.06] bg-transparent text-center text-sm font-semibold tabular-nums text-charcoal focus:outline-none focus-visible:bg-brand-50/60"
      />
      <button type="button" className={buttonClass} onClick={() => commit(String(value + 1))} disabled={disabled || atMax} aria-label="Augmenter la quantité">
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
