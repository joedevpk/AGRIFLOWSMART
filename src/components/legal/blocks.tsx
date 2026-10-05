import type { ReactNode } from 'react';
import { TriangleAlert, Info, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Élément juridique NON tranché : affiché clairement, jamais comblé par une invention. */
export function Todo({ children }: { children: ReactNode }) {
  return (
    <div role="note" className="legal-note not-prose my-5 flex gap-3 rounded-2xl border border-accent-400 bg-accent-50 p-4 text-sm text-amber-900">
      <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0"><p className="font-bold uppercase tracking-wide">TODO interne — validation juridique requise</p><div className="mt-1 space-y-1 leading-relaxed">{children}</div></div>
    </div>
  );
}

/** Valeur commerciale non encore décidée par AgriFlow. */
export function Configure({ children }: { children: ReactNode }) {
  return (
    <div role="note" className="legal-note not-prose my-5 flex gap-3 rounded-2xl border border-accent-400 bg-accent-50 p-4 text-sm text-amber-900">
      <Settings2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0"><p className="font-bold uppercase tracking-wide">À configurer avant production</p><div className="mt-1 space-y-1 leading-relaxed">{children}</div></div>
    </div>
  );
}

export function Callout({ title, children, tone = 'info' }: { title?: string; children: ReactNode; tone?: 'info' | 'good' }) {
  return (
    <div role="note" className={cn('not-prose my-5 flex gap-3 rounded-2xl border p-4 text-sm', tone === 'good' ? 'border-brand-300 bg-brand-50 text-brand-900 dark:border-brand-700 dark:bg-brand-900/40 dark:text-brand-100' : 'border-black/[0.08] bg-offwhite text-charcoal/80')}>
      <Info className="mt-0.5 h-5 w-5 shrink-0 text-brand-700 dark:text-brand-300" aria-hidden="true" />
      <div className="min-w-0 leading-relaxed">{title && <p className="font-semibold text-charcoal">{title}</p>}{children}</div>
    </div>
  );
}

/** Tableau lisible partout : vrai tableau dès md, cartes empilées sur mobile. */
export function CardTable({ columns, rows, caption }: { columns: string[]; rows: ReactNode[][]; caption: string }) {
  return (
    <div className="not-prose my-5">
      <table className="hidden w-full border-collapse overflow-hidden rounded-2xl border border-black/[0.08] bg-offwhite text-left text-sm md:table">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-brand-50 text-brand-900"><tr>{columns.map((c) => <th key={c} scope="col" className="px-4 py-3 font-semibold">{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i} className="border-t border-black/[0.06] align-top">{r.map((cell, j) => j === 0 ? <th key={j} scope="row" className="px-4 py-3 font-semibold text-charcoal">{cell}</th> : <td key={j} className="px-4 py-3 text-charcoal/70">{cell}</td>)}</tr>
        ))}</tbody>
      </table>
      <ul className="space-y-3 md:hidden" aria-label={caption}>
        {rows.map((r, i) => (
          <li key={i} className="rounded-2xl border border-black/[0.08] bg-offwhite p-4 text-sm">
            <p className="font-semibold text-charcoal">{r[0]}</p>
            <dl className="mt-2 space-y-2">{r.slice(1).map((cell, j) => (<div key={j}><dt className="text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">{columns[j + 1]}</dt><dd className="text-charcoal/70">{cell}</dd></div>))}</dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
