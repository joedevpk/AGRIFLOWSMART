import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, CalendarDays, MapPin, Store, AlertTriangle, Circle, Inbox } from 'lucide-react';
import { Header, Footer } from '@/components/layout/Header';
import { Card, CardBody, Badge, Button } from '@/components/ui';
import { toast } from '@/components/ui/toast-store';
import { ConnectionBadge, SyncPill } from '@/components/agri/SyncStatus';
import { getCrop, STEP_KEYS, STEP_TITLES, CROPS_SOURCE } from '@/lib/agri/crops';
import { cropProgress, useProgress } from '@/hooks/useProgress';
import { progressKey, countOpenRequestsFor, listActiveCropTips } from '@/services/agriService';
import { useAuth } from '@/contexts/auth-context';
import { useSeo } from '@/hooks/useSeo';
import { useConnection } from '@/contexts/sync-context';
import { cn } from '@/lib/utils';
import type { CropTip } from '@/types/agri';

export function CropGuidePage() {
  const { cropId } = useParams<{ cropId: string }>();
  const crop = getCrop(cropId);
  useSeo({
    title: crop ? `Guide de culture : ${crop.name} | AgriFlow RDC` : 'Culture introuvable | AgriFlow RDC',
    description: crop ? `${crop.summary} Étapes de culture, conseils et calendrier.` : undefined,
  });
  const { profile } = useAuth();
  const connection = useConnection();
  const { map, isAuthed, toggle, fromCache } = useProgress();
  const [requests, setRequests] = useState<number | null>(null);
  const [tips, setTips] = useState<CropTip[]>([]);

  useEffect(() => {
    setRequests(null);
    if (!crop || !isAuthed || connection === 'offline') return;
    let cancelled = false;
    void countOpenRequestsFor(crop.marketName).then((n) => { if (!cancelled) setRequests(n); });
    return () => { cancelled = true; };
  }, [crop, isAuthed, connection]);

  useEffect(() => {
    setTips([]);
    if (!crop || connection === 'offline') return;
    let cancelled = false;
    void listActiveCropTips(crop.id).then((t) => { if (!cancelled) setTips(t); });
    return () => { cancelled = true; };
  }, [crop, connection]);

  if (!crop) {
    return (
      <div className="min-h-screen bg-cream"><Header />
        <main className="mx-auto max-w-3xl px-4 py-16 text-center"><h1 className="text-xl font-bold text-charcoal">Culture introuvable</h1><Link to="/agriguide" className="mt-4 inline-block text-brand-700 underline">Retour à AgriGuide</Link></main><Footer /></div>
    );
  }

  const p = cropProgress(map, crop.id);
  const canSell = isAuthed && profile?.role !== 'buyer';
  const onToggle = (stepKey: string, value: boolean) => {
    if (!isAuthed) { toast('info', 'Connectez-vous pour enregistrer votre progression.'); return; }
    toggle(crop.id, stepKey, value);
  };

  return (
    <div className="min-h-screen bg-cream dark:bg-charcoal">
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <Link to="/agriguide" className="mb-4 inline-flex items-center gap-1.5 text-sm text-charcoal/60 hover:text-brand-700"><ArrowLeft className="h-4 w-4" /> AgriGuide</Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-4">
            <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-sage text-4xl" aria-hidden>{crop.emoji}</span>
            <div><h1 className="text-2xl font-bold text-charcoal sm:text-3xl">{crop.name}</h1><Badge variant="neutral">{crop.category}</Badge></div>
          </div>
          <div className="flex flex-wrap gap-2"><ConnectionBadge /><SyncPill /></div>
        </div>
        <p className="mt-4 text-charcoal/70">{crop.summary}</p>
        {crop.caution && <p className="mt-3 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {crop.caution}</p>}

        {tips.length > 0 && (
          <div className="mt-6 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-charcoal/50">Conseils</h2>
            {tips.map((tip) => (
              <Card key={tip.id}><CardBody>
                <h3 className="font-semibold text-charcoal">{tip.title}</h3>
                <p className="mt-1 text-sm text-charcoal/70">{tip.body}</p>
              </CardBody></Card>
            ))}
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Cycle', crop.cycleLabel],
            ['Température', `${crop.temp.optMin}–${crop.temp.optMax} °C`],
            ['Pluie annuelle', `${crop.rain.optMin}–${crop.rain.optMax} mm`],
            ['Altitude', `${crop.alt.optMin}–${crop.alt.optMax} m`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl border border-black/[0.06] bg-offwhite p-3"><p className="text-[11px] uppercase tracking-wide text-charcoal/45">{k}</p><p className="mt-0.5 text-sm font-semibold text-charcoal">{v}</p></div>
          ))}
        </div>
        <p className="mt-2 text-xs text-charcoal/45">Repères indicatifs (plages favorables) — à confirmer localement.</p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link to={`/calendar?crop=${crop.id}`}><Button variant="outline"><CalendarDays className="h-4 w-4" /> Voir le calendrier</Button></Link>
          <Link to="/plots"><Button variant="outline"><MapPin className="h-4 w-4" /> Analyser ma parcelle</Button></Link>
          <Link to={canSell ? `/producer/products/new?crop=${crop.id}` : '/register'}><Button variant="sun"><Store className="h-4 w-4" /> Publier ma production</Button></Link>
        </div>

        <Card className="mt-8"><CardBody>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-charcoal">Mon parcours — {crop.name}</h2>
            {isAuthed ? <span className="text-sm font-bold text-brand-700">Progression : {p.pct} %</span> : <Link to="/login" className="text-sm font-medium text-brand-700 underline">Se connecter pour suivre</Link>}
          </div>
          {isAuthed && (
            <>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-sage" role="progressbar" aria-valuenow={p.pct} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${p.pct}%` }} /></div>
              {fromCache && <p className="mt-2 text-xs text-charcoal/50">Données enregistrées sur cet appareil (hors connexion).</p>}
            </>
          )}
        </CardBody></Card>

        <ol className="mt-6 space-y-3">
          {STEP_KEYS.map((k, i) => {
            const done = Boolean(map[progressKey(crop.id, k)]);
            const current = isAuthed && p.nextIndex === i;
            return (
              <li key={k}>
                <Card className={cn(current && 'border-brand-300 ring-2 ring-brand-500/15')}>
                  <CardBody className="space-y-2">
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => onToggle(k, !done)} aria-pressed={done} aria-label={`${done ? 'Marquer comme non terminée' : 'Marquer comme terminée'} : ${STEP_TITLES[k]}`}
                        className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors', done ? 'border-brand-600 bg-brand-600 text-white' : 'border-black/15 text-transparent hover:border-brand-400')}
                      >{done ? <Check className="h-4 w-4" /> : <Circle className="h-4 w-4" />}</button>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-charcoal">{i + 1}. {STEP_TITLES[k]} {current && <Badge variant="brand" className="ml-1">Étape en cours</Badge>}</h3>
                        <p className="mt-1 text-sm text-charcoal/70">{crop.steps[k]}</p>
                        {k === 'commercialisation' && (
                          <div className="mt-3 space-y-2">
                            {requests !== null && requests > 0 && <p className="flex items-center gap-2 text-sm font-medium text-brand-800"><Inbox className="h-4 w-4" /> {requests} demande{requests > 1 ? 's' : ''} d'achat ouverte{requests > 1 ? 's' : ''} pour « {crop.marketName} » en ce moment.</p>}
                            <Link to={canSell ? `/producer/products/new?crop=${crop.id}` : '/register'}><Button size="sm" variant="sun"><Store className="h-4 w-4" /> Publier ma production</Button></Link>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardBody>
                </Card>
              </li>
            );
          })}
        </ol>

        <p className="mt-8 rounded-xl border border-black/[0.06] bg-offwhite p-4 text-xs text-charcoal/55"><strong>Conseils indicatifs.</strong> Ces fiches donnent des repères généraux. Elles ne constituent pas une recommandation agronomique personnalisée. <strong>Source :</strong> {CROPS_SOURCE}</p>
      </main>
      <Footer />
    </div>
  );
}
