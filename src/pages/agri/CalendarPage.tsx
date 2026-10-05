import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDays, BookOpen, Store, Info } from 'lucide-react';
import { Header, Footer } from '@/components/layout/Header';
import { Card, CardBody, Badge, Button, Select } from '@/components/ui';
import { ConnectionBadge } from '@/components/agri/SyncStatus';
import { CROPS, getCrop } from '@/lib/agri/crops';
import { ZONES, ZONES_SOURCE, getZone } from '@/lib/agri/zones';
import { CALENDAR_DISCLAIMER, MONTH_LONG, MONTH_SHORT, STATUS_LABELS, cropPhases, cropYear, monthsToText, regimeExplanation, type MonthStatus } from '@/lib/agri/calendar';
import { useAuth } from '@/contexts/auth-context';
import { cn } from '@/lib/utils';
import { useSeo } from '@/hooks/useSeo';

const CELL: Record<MonthStatus, string> = {
  favorable: 'bg-emerald-500 text-white',
  conditional: 'bg-emerald-200 text-emerald-900 ring-1 ring-inset ring-emerald-500',
  verify: 'bg-amber-300 text-amber-900',
  longcycle: 'bg-sky-400 text-white',
  none: 'bg-cream text-charcoal/20',
};
const ICON: Record<MonthStatus, string> = { favorable: '🟢', conditional: '🟢', verify: '🟡', longcycle: '🔵', none: '⚪' };

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-charcoal/65" aria-label="Légende">
      {(['favorable', 'conditional', 'verify', 'longcycle', 'none'] as MonthStatus[]).map((s) => (
        <li key={s} className="flex items-center gap-1.5"><span className={cn('h-3.5 w-3.5 rounded', CELL[s])} aria-hidden /> {STATUS_LABELS[s]}</li>
      ))}
    </ul>
  );
}

export function CalendarPage() {
  useSeo({
    title: 'Calendrier agricole par zone | AgriFlow RDC',
    description: 'Périodes indicatives de préparation, semis, entretien et récolte des principales cultures, selon la zone de RDC.',
  });
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const zoneId = getZone(params.get('zone'))?.id ?? 'kinshasa';
  const cropId = getCrop(params.get('crop'))?.id ?? '';
  const zone = getZone(zoneId)!;
  const crop = getCrop(cropId);
  const [picked, setPicked] = useState<{ cropId: string; month: number } | null>(null);

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    setParams(next, { replace: true });
    setPicked(null);
  };

  const rows = useMemo(() => CROPS.map((c) => ({ c, cells: cropYear(c, zone) })), [zone]);
  const phases = useMemo(() => (crop ? cropPhases(crop, zone) : null), [crop, zone]);
  const pickedInfo = picked ? rows.find((r) => r.c.id === picked.cropId)?.cells[picked.month - 1] : null;
  const pickedCrop = picked ? getCrop(picked.cropId) : null;

  return (
    <div className="min-h-screen bg-cream dark:bg-charcoal">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <Badge variant="brand"><CalendarDays className="mr-1 inline h-3 w-3" /> Calendrier agricole</Badge>
            <h1 className="mt-2 text-2xl font-bold text-charcoal sm:text-3xl">Quand planifier vos cultures ?</h1>
            <p className="mt-1 max-w-2xl text-sm text-charcoal/60">Choisissez une zone (et une culture) pour voir les périodes indicatives de préparation, semis, entretien et récolte.</p>
          </div>
          <ConnectionBadge />
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2 sm:max-w-xl">
          <Select label="Zone" value={zoneId} onChange={(e) => set({ zone: e.target.value })} options={ZONES.map((z) => ({ value: z.id, label: `${z.name} (${z.region})` }))} />
          <Select label="Culture" value={cropId} onChange={(e) => set({ crop: e.target.value })} placeholder="Toutes les cultures" options={CROPS.map((c) => ({ value: c.id, label: c.name }))} />
        </div>
        <p className="mb-6 flex gap-2 text-xs text-charcoal/55"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {zone.name} : {regimeExplanation(zone)}.</p>

        {!crop && (
          <Card><CardBody className="space-y-4">
            <Legend />
            <div className="-mx-2 overflow-x-auto px-2">
              <table className="w-full min-w-[440px] border-separate border-spacing-y-1 text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 w-24 bg-offwhite text-left font-medium text-charcoal/50">Culture</th>
                    {MONTH_SHORT.map((m) => <th key={m} scope="col" className="px-0.5 text-center text-[9px] font-semibold text-charcoal/50 sm:text-[10px]">{m}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ c, cells }) => (
                    <tr key={c.id}>
                      <th scope="row" className="sticky left-0 z-10 bg-offwhite pr-2 text-left text-xs font-medium text-charcoal"><button onClick={() => set({ crop: c.id })} className="whitespace-nowrap hover:text-brand-700">{c.emoji} {c.name.split(' ')[0]}</button></th>
                      {cells.map((cell) => (
                        <td key={cell.month} className="p-0.5">
                          <button
                            onClick={() => setPicked({ cropId: c.id, month: cell.month })}
                            aria-label={`${c.name}, ${MONTH_LONG[cell.month - 1]} : ${STATUS_LABELS[cell.status]}`}
                            className={cn('h-8 w-full min-w-[24px] rounded-md transition-transform hover:scale-105', CELL[cell.status], picked?.cropId === c.id && picked.month === cell.month && 'outline outline-2 outline-charcoal')}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pickedInfo && pickedCrop && (
              <div className="rounded-xl bg-sage/60 p-3 text-sm text-charcoal" role="status">
                <p className="font-semibold">{ICON[pickedInfo.status]} {pickedCrop.name} — {MONTH_LONG[pickedInfo.month - 1]} : {STATUS_LABELS[pickedInfo.status]}</p>
                <p className="mt-1 text-charcoal/70">{pickedInfo.reason}</p>
              </div>
            )}
          </CardBody></Card>
        )}

        {crop && phases && (
          <div className="space-y-4">
            <Card><CardBody className="space-y-4">
              <h2 className="text-lg font-semibold text-charcoal">{crop.name} — {zone.name}</h2>
              <Legend />
              <ol className="space-y-0 md:hidden" aria-label={`Étapes de culture : ${crop.name}`}>
                {([
                  ['Préparation', monthsToText(phases.prep), 'bg-stone-400'],
                  [crop.sowing === 'perennial' ? 'Plantation' : 'Semis', monthsToText(phases.sow), 'bg-emerald-500'],
                  ['Entretien', phases.care.length ? monthsToText(phases.care) : 'Tout au long du cycle', 'bg-lime-400'],
                  ['Récolte (estimation)', phases.longCycleNote ?? monthsToText(phases.harvest), 'bg-accent-400'],
                ] as [string, string, string][]).map(([label, when, color], i, all) => (
                  <li key={label} className="relative flex gap-4 pb-5 last:pb-0">
                    {i < all.length - 1 && <span className="absolute left-[9px] top-5 h-full w-px bg-black/10" aria-hidden="true" />}
                    <span className={cn('relative z-10 mt-1 h-5 w-5 shrink-0 rounded-full ring-4 ring-offwhite', color)} aria-hidden="true" />
                    <div className="min-w-0"><p className="font-semibold text-charcoal">{label}</p><p className="text-sm text-charcoal/65">{when}</p></div>
                  </li>
                ))}
              </ol>
              <div className="-mx-2 hidden overflow-x-auto px-2 md:block">
                <table className="w-full min-w-[440px] border-separate border-spacing-y-1 text-xs">
                  <thead>
                    <tr><th className="sticky left-0 w-24 bg-offwhite" />{MONTH_SHORT.map((m) => <th key={m} className="px-0.5 text-center text-[9px] font-semibold text-charcoal/50 sm:text-[10px]">{m}</th>)}</tr>
                  </thead>
                  <tbody>
                    {([
                      ['Préparation', phases.prep, 'bg-stone-400'],
                      ['Semis', phases.sow, 'bg-emerald-500'],
                      ['Entretien', phases.care, 'bg-lime-400'],
                      ['Récolte', phases.harvest, 'bg-accent-400'],
                    ] as [string, number[], string][]).map(([label, months, color]) => (
                      <tr key={label}>
                        <th scope="row" className="sticky left-0 z-10 bg-offwhite pr-2 text-left text-xs font-medium text-charcoal">{label}</th>
                        {MONTH_SHORT.map((_, i) => <td key={i} className="p-0.5"><div className={cn('h-7 rounded-md', months.includes(i + 1) ? color : 'bg-cream')} aria-label={months.includes(i + 1) ? `${label} : ${MONTH_LONG[i]}` : undefined} /></td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <dl className="hidden gap-3 text-sm md:grid md:grid-cols-2">
                <div><dt className="font-semibold text-charcoal">Préparation</dt><dd className="text-charcoal/65">{monthsToText(phases.prep)}</dd></div>
                <div><dt className="font-semibold text-charcoal">{crop.sowing === 'perennial' ? 'Plantation' : 'Semis'}</dt><dd className="text-charcoal/65">{monthsToText(phases.sow)}</dd></div>
                <div><dt className="font-semibold text-charcoal">Entretien</dt><dd className="text-charcoal/65">{phases.care.length ? monthsToText(phases.care) : 'Tout au long du cycle'}</dd></div>
                <div><dt className="font-semibold text-charcoal">Récolte (estimation)</dt><dd className="text-charcoal/65">{phases.longCycleNote ?? monthsToText(phases.harvest)}</dd></div>
              </dl>
              <p className="text-xs text-charcoal/55">Cycle de la culture : {crop.cycleLabel}. {crop.sowing === 'dry_irrigated' ? 'Les périodes plus sèches supposent un arrosage maîtrisé.' : crop.sowing === 'rain_start' ? 'La règle utilisée place le semis au début des pluies ; un second semis en milieu de saison est à vérifier localement.' : 'La plantation est généralement placée au début des pluies.'}</p>
            </CardBody></Card>
            <div className="flex flex-wrap gap-3">
              <Link to={`/agriguide/${crop.id}`}><Button variant="outline"><BookOpen className="h-4 w-4" /> Apprendre cette culture</Button></Link>
              <Link to={user ? `/producer/products/new?crop=${crop.id}` : '/register'}><Button variant="sun"><Store className="h-4 w-4" /> Publier ma production</Button></Link>
            </div>
          </div>
        )}

        <p className="mt-8 rounded-xl border border-black/[0.06] bg-offwhite p-4 text-xs text-charcoal/55"><strong>Indicatif.</strong> {CALENDAR_DISCLAIMER} <strong>Source :</strong> {ZONES_SOURCE}</p>
      </main>
      <Footer />
    </div>
  );
}
