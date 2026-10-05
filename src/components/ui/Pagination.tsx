import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  label?: string;
}

/** Pagination côté client : « x–y sur N », précédent / suivant (cibles tactiles ≥ 44 px). */
export function Pagination({ page, pageSize, total, onPageChange, label = 'Pagination' }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const btn = 'inline-flex h-11 w-11 items-center justify-center rounded-lg border border-black/[0.08] text-charcoal/70 transition-colors hover:bg-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10';
  return (
    <nav aria-label={label} className="flex items-center justify-between gap-3 border-t border-black/[0.06] px-4 py-3 dark:border-white/10">
      <p className="text-sm tabular-nums text-charcoal/60" aria-live="polite">{from}–{to} sur {total}</p>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Page précédente"><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
        <span className="min-w-[4.5rem] text-center text-sm tabular-nums text-charcoal/60">Page {page}/{pages}</span>
        <button type="button" className={btn} onClick={() => onPageChange(page + 1)} disabled={page >= pages} aria-label="Page suivante"><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
      </div>
    </nav>
  );
}
