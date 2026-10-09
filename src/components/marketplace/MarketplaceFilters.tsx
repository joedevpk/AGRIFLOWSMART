import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  AVAILABILITY_OPTIONS, PRICE_RANGES, QUANTITY_OPTIONS, SORT_OPTIONS,
  type MarketFilters,
} from '@/lib/marketplace';
import { cn } from '@/lib/utils';

export function Chip({ active, onClick, children, className }: { active: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn('chip min-h-[40px]', active ? 'chip-active' : 'chip-idle', className)}
    >
      {children}
    </button>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-2.5">
      <legend className="text-sm font-semibold text-charcoal">{title}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

interface FilterGroupsProps {
  filters: MarketFilters;
  provinces: string[];
  onChange: (patch: Partial<MarketFilters>) => void;
}

/** Groupes de filtres en puces : localisation, prix, disponibilité, quantité, tri. */
export function FilterGroups({ filters, provinces, onChange }: FilterGroupsProps) {
  const toggle = (key: keyof MarketFilters, value: string) => onChange({ [key]: filters[key] === value ? '' : value });
  return (
    <div className="space-y-6">
      <Group title="Localisation">
        <Chip active={!filters.province} onClick={() => onChange({ province: '' })}>Toutes</Chip>
        {provinces.map((p) => (
          <Chip key={p} active={filters.province === p} onClick={() => toggle('province', p)}>{p}</Chip>
        ))}
      </Group>
      <Group title="Prix par unité">
        <Chip active={!filters.price} onClick={() => onChange({ price: '' })}>Tous</Chip>
        {PRICE_RANGES.map((r) => (
          <Chip key={r.id} active={filters.price === r.id} onClick={() => toggle('price', r.id)}>{r.label}</Chip>
        ))}
      </Group>
      <Group title="Disponibilité">
        <Chip active={!filters.avail} onClick={() => onChange({ avail: '' })}>Toutes</Chip>
        {AVAILABILITY_OPTIONS.map((o) => (
          <Chip key={o.id} active={filters.avail === o.id} onClick={() => toggle('avail', o.id)}>{o.label}</Chip>
        ))}
      </Group>
      <Group title="Quantité disponible">
        <Chip active={!filters.qty} onClick={() => onChange({ qty: '' })}>Toutes</Chip>
        {QUANTITY_OPTIONS.map((o) => (
          <Chip key={o.id} active={filters.qty === o.id} onClick={() => toggle('qty', o.id)}>{o.label}</Chip>
        ))}
      </Group>
      <Group title="Trier par">
        {SORT_OPTIONS.map((o) => (
          <Chip key={o.id} active={filters.sort === o.id} onClick={() => onChange({ sort: o.id })}>{o.label}</Chip>
        ))}
      </Group>
    </div>
  );
}

interface FilterSheetProps extends FilterGroupsProps {
  open: boolean;
  resultCount: number;
  onClose: () => void;
  onReset: () => void;
}

/** Feuille de filtres mobile (bottom sheet) — simple : puces + « Voir N résultats ». */
export function FilterSheet({ open, resultCount, onClose, onReset, ...groups }: FilterSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end lg:hidden" role="dialog" aria-modal="true" aria-label="Filtres">
      <div className="absolute inset-0 bg-charcoal/50 animate-fade-in" onClick={onClose} />
      <div className="relative flex max-h-sheet w-full flex-col rounded-t-3xl bg-offwhite shadow-lift animate-slide-up">
        <div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-4">
          <h2 className="text-lg font-bold text-charcoal">Filtres</h2>
          <button type="button" onClick={onClose} aria-label="Fermer les filtres" className="flex h-11 w-11 items-center justify-center rounded-full text-charcoal/50 hover:bg-black/5">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <FilterGroups {...groups} />
        </div>
        <div className="flex gap-3 border-t border-black/[0.06] px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button variant="outline" onClick={onReset}>Réinitialiser</Button>
          <Button fullWidth onClick={onClose}>
            Voir {resultCount} résultat{resultCount > 1 ? 's' : ''}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
