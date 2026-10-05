import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Plus, Ruler, Sprout, CloudOff, WifiOff, CalendarDays, ArrowRight } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardBody, Badge, Button, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { toast } from '@/components/ui/toast-store';
import { PlotForm } from '@/components/agri/PlotForm';
import { ConnectionBadge, SyncPill, SyncPanel } from '@/components/agri/SyncStatus';
import { useAuth } from '@/contexts/auth-context';
import { useSync } from '@/contexts/sync-context';
import { loadPlots, savePlot } from '@/services/agriService';
import { getCrop } from '@/lib/agri/crops';
import { getZone } from '@/lib/agri/zones';
import { cropPhases } from '@/lib/agri/calendar';
import type { Crop } from '@/lib/agri/crops';
import type { Zone } from '@/lib/agri/zones';
import { AREA_UNIT_LABELS, PLOT_STATUS_LABELS, type Plot } from '@/types/agri';
import { formatDate, formatDateTime } from '@/lib/constants';
import { useSeo } from '@/hooks/useSeo';

/** Période indicative du mois en cours d'après le calendrier de la zone (aucune donnée inventée : null si non calculable). */
function currentActivity(crop: Crop | undefined, zone: Zone | undefined): string | null {
  if (!crop || !zone) return null;
  const month = new Date().getMonth() + 1;
  const ph = cropPhases(crop, zone);
  if (ph.harvest.includes(month)) return 'Récolte (période indicative)';
  if (ph.sow.includes(month)) return crop.sowing === 'perennial' ? 'Plantation (période indicative)' : 'Semis (période indicative)';
  if (ph.care.includes(month)) return 'Entretien (période indicative)';
  if (ph.prep.includes(month)) return 'Préparation (période indicative)';
  return null;
}

export function PlotsPage() {
  useSeo({ title: 'Mes parcelles | AgriFlow RDC', noindex: true });
  const { user } = useAuth();
  const { dataVersion, notifyQueued, connection } = useSync();
  const [plots, setPlots] = useState<Plot[]>([]);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [fromCache, setFromCache] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const r = await loadPlots(user.id);
    setPlots(r.data); setPendingIds(r.pendingIds); setFromCache(r.fromCache); setSavedAt(r.savedAt); setError(r.error && r.data.length === 0 ? r.error : null);
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load, dataVersion]);

  const onSave = (plot: Plot, isNew: boolean) => {
    if (!user) return;
    if (!savePlot(user.id, plot, isNew)) { toast('error', 'Le stockage de cet appareil est indisponible : la parcelle n\'a pas pu être enregistrée.'); return; }
    setPlots((l) => [plot, ...l.filter((p) => p.id !== plot.id)]);
    setPendingIds((s) => new Set(s).add(plot.id));
    setCreating(false);
    toast('success', connection === 'offline' ? 'Parcelle enregistrée sur cet appareil. Elle sera synchronisée au retour de la connexion.' : 'Parcelle enregistrée.');
    notifyQueued();
  };

  return (
    <DashboardLayout title="Mes parcelles">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xl text-sm text-charcoal/60">Enregistrez vos parcelles, analysez leur aptitude, planifiez vos cultures — puis publiez votre production pour trouver des acheteurs.</p>
          <div className="flex flex-wrap items-center gap-2"><ConnectionBadge /><SyncPill />{!creating && <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden="true" /> Ajouter une parcelle</Button>}</div>
        </div>

        <SyncPanel />

        {fromCache && !loading && (
          <p className="flex items-center gap-2 rounded-xl border border-black/[0.06] bg-offwhite px-4 py-3 text-xs text-charcoal/60"><WifiOff className="h-4 w-4 shrink-0" /> Affichage des données enregistrées sur cet appareil{savedAt ? ` (dernière mise à jour : ${formatDateTime(savedAt)})` : ''}.</p>
        )}

        {creating && user && (
          <Card><CardBody>
            <h2 className="mb-4 text-lg font-semibold text-charcoal">Nouvelle parcelle</h2>
            <PlotForm userId={user.id} onSave={onSave} onCancel={() => setCreating(false)} />
          </CardBody></Card>
        )}

        {loading ? <LoadingState /> : error ? <ErrorState message="Impossible de charger vos parcelles. Vérifiez votre connexion puis réessayez." onRetry={() => { setLoading(true); void load(); }} /> : plots.length === 0 && !creating ? (
          <Card><CardBody><EmptyState icon={<MapPin className="h-8 w-8" />} title="Aucune parcelle enregistrée" description="Commencez par indiquer votre zone et la superficie de votre parcelle." action={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Ajouter ma première parcelle</Button>} /></CardBody></Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {plots.map((p) => {
              const zone = getZone(p.zone_id);
              const crop = getCrop(p.current_crop) ?? getCrop(p.planned_crop);
              const activity = currentActivity(crop, zone);
              return (
                <Link key={p.id} to={`/plots/${p.id}`} className="block">
                  <Card hover className="h-full"><CardBody className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="font-semibold text-charcoal">{p.name}</h2>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Badge variant="brand">{PLOT_STATUS_LABELS[p.status]}</Badge>
                        {pendingIds.has(p.id) && <Badge variant="warning"><CloudOff className="mr-1 inline h-3 w-3" />En attente</Badge>}
                      </div>
                    </div>
                    <ul className="space-y-1 text-sm text-charcoal/65">
                      <li className="flex items-center gap-2"><MapPin className="h-4 w-4 text-charcoal/40" /> {[p.locality, zone?.name].filter(Boolean).join(' · ') || 'Zone non renseignée'}</li>
                      <li className="flex items-center gap-2"><Ruler className="h-4 w-4 text-charcoal/40" /> {p.area_value} {AREA_UNIT_LABELS[p.area_unit]}</li>
                      <li className="flex items-center gap-2"><Sprout className="h-4 w-4 text-charcoal/40" /> {crop ? `${crop.name}${p.current_crop ? '' : ' (envisagée)'}` : 'Aucune culture'}</li>
                      {p.start_date && <li className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-charcoal/40" aria-hidden="true" /> {p.current_crop ? 'Plantation' : 'Début prévu'} : {formatDate(p.start_date)}</li>}
                    </ul>
                    {activity && <p className="flex items-center gap-1.5 border-t border-black/[0.06] pt-3 text-sm font-medium text-brand-700 dark:border-white/10"><ArrowRight className="h-4 w-4" aria-hidden="true" /> Ce mois-ci : {activity}</p>}
                  </CardBody></Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
