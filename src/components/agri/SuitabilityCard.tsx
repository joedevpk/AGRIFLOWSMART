import { Card, CardBody, Badge } from '@/components/ui';
import type { Suitability, FactorStatus } from '@/lib/agri/suitability';
import { cn } from '@/lib/utils';

const ICONS: Record<string, string> = { temperature: '🌡️', rainfall: '🌧️', altitude: '⛰️', soil: '🌱', water: '💧' };
const BADGE: Record<FactorStatus, 'success' | 'info' | 'warning' | 'neutral'> = {
  favorable: 'success', compatible: 'info', limited: 'warning', partial: 'warning', verify: 'warning', unavailable: 'neutral',
};
const CONF = { low: 'Fiabilité faible : peu de données renseignées', medium: 'Fiabilité moyenne', high: 'Fiabilité meilleure : sol et eau renseignés' } as const;

/** Affiche l'indice, ses facteurs et l'explication. Ne parle jamais de « probabilité de réussite ». */
export function SuitabilityCard({ cropEmoji, cropName, result }: { cropEmoji: string; cropName: string; result: Suitability }) {
  const s = result.score;
  return (
    <Card><CardBody className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-charcoal/60">Indice d'aptitude agricole</p>
          <h3 className="text-lg font-semibold text-charcoal"><span aria-hidden>{cropEmoji}</span> {cropName}</h3>
        </div>
        {s !== null ? (
          <div className="text-right">
            <p className="text-4xl font-extrabold leading-none text-brand-700">{s}<span className="text-lg font-semibold text-charcoal/40"> / 100</span></p>
            <p className="mt-1 text-sm font-medium text-charcoal">{result.rating}</p>
          </div>
        ) : <Badge variant="neutral">Indice non calculable</Badge>}
      </div>
      {s !== null && (
        <div className="h-2.5 overflow-hidden rounded-full bg-sage" role="progressbar" aria-label="Indice d'aptitude" aria-valuenow={s} aria-valuemin={0} aria-valuemax={100}>
          <div className={cn('h-full rounded-full', s >= 75 ? 'bg-brand-600' : s >= 50 ? 'bg-accent-400' : 'bg-rose-400')} style={{ width: `${s}%` }} />
        </div>
      )}
      <p className="text-xs text-charcoal/55">Calculé à partir de {result.usedFactors} facteur{result.usedFactors > 1 ? 's' : ''} sur {result.totalFactors} · {CONF[result.confidence]}</p>

      <ul className="divide-y divide-black/[0.06]">
        {result.factors.map((f) => (
          <li key={f.key} className="flex gap-3 py-3">
            <span className="text-xl" aria-hidden>{ICONS[f.key]}</span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-charcoal">{f.label} <Badge variant={BADGE[f.status]}>{f.statusLabel}</Badge></p>
              <p className="mt-0.5 text-xs text-charcoal/60">{f.detail}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="rounded-xl bg-sage/60 p-4 text-sm text-charcoal">
        <p className="font-semibold">Pourquoi ce résultat ?</p>
        <p className="mt-1 text-charcoal/75">{result.explanation}</p>
      </div>
      <p className="text-xs text-charcoal/50">{result.disclaimer}</p>
    </CardBody></Card>
  );
}
