import { useId } from 'react';

export interface ChartPoint { label: string; value: number }

interface Props {
  title: string;
  points: ChartPoint[];
  format: (n: number) => string;
  /** Texte lu par les lecteurs d'écran ; le tableau de données reste disponible sous le graphique. */
  summary?: string;
}

/** Graphique à barres en SVG pur (aucune dépendance) + tableau de données accessible. */
export function FinanceChart({ title, points, format, summary }: Props) {
  const id = useId();
  const max = Math.max(0, ...points.map((p) => p.value));
  const W = 640, H = 200, padL = 8, padR = 8, padT = 12, padB = 26;
  const n = Math.max(points.length, 1);
  const slot = (W - padL - padR) / n;
  const bar = Math.max(1, Math.min(28, slot * 0.7));
  const every = Math.max(1, Math.ceil(n / 8));
  const total = points.reduce((s, p) => s + p.value, 0);
  const hasData = max > 0;

  return (
    <figure className="space-y-2" aria-labelledby={`${id}-t`}>
      <figcaption id={`${id}-t`} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-charcoal">{title}</span>
        <span className="text-xs text-charcoal/55">Total de la période : <span className="font-semibold tabular-nums text-charcoal">{format(total)}</span></span>
      </figcaption>
      {hasData ? (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary ?? title} className="h-auto w-full" preserveAspectRatio="xMidYMid meet">
          <line x1={padL} x2={W - padR} y1={H - padB} y2={H - padB} stroke="currentColor" className="text-charcoal/15" />
          {points.map((p, i) => {
            const h = max === 0 ? 0 : ((H - padT - padB) * p.value) / max;
            const x = padL + i * slot + (slot - bar) / 2;
            return (
              <g key={`${p.label}-${i}`}>
                <rect x={x} y={H - padB - h} width={bar} height={Math.max(h, p.value > 0 ? 1 : 0)} rx={2} className="fill-brand-600">
                  <title>{`${p.label} : ${format(p.value)}`}</title>
                </rect>
                {i % every === 0 && (
                  <text x={x + bar / 2} y={H - 8} textAnchor="middle" className="fill-charcoal/50" fontSize="10">{p.label.slice(5)}</text>
                )}
              </g>
            );
          })}
        </svg>
      ) : (
        <p className="rounded-xl border border-dashed border-black/10 px-4 py-10 text-center text-sm text-charcoal/55">Aucune donnée sur cette période.</p>
      )}
      <details className="text-xs text-charcoal/60">
        <summary className="cursor-pointer select-none py-1 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">Voir les données en tableau</summary>
        <div className="max-h-56 overflow-auto rounded-xl border border-black/[0.06]">
          <table className="w-full text-left">
            <caption className="sr-only">{title}</caption>
            <thead className="sticky top-0 bg-offwhite"><tr><th scope="col" className="px-3 py-2 font-medium">Période</th><th scope="col" className="px-3 py-2 text-right font-medium">Valeur</th></tr></thead>
            <tbody className="divide-y divide-black/[0.06]">{points.map((p, i) => <tr key={`${p.label}-${i}`}><th scope="row" className="px-3 py-1.5 font-normal">{p.label}</th><td className="px-3 py-1.5 text-right tabular-nums">{format(p.value)}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
