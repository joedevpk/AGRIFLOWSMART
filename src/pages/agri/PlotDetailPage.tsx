import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MapPin, Pencil, Trash2, BookOpen, CalendarDays, Store, Inbox, CloudOff, ExternalLink, StickyNote, WifiOff } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardBody, Badge, Button, EmptyState, ErrorState, LoadingState, Select, Textarea, ConfirmDialog } from '@/components/ui';
import { toast } from '@/components/ui/toast-store';
import { PlotForm } from '@/components/agri/PlotForm';
import { SuitabilityCard } from '@/components/agri/SuitabilityCard';
import { DataSourcesPanel } from '@/components/agri/DataSourcesPanel';
import { ConnectionBadge, SyncPill, SyncPanel } from '@/components/agri/SyncStatus';
import { useAuth } from '@/contexts/auth-context';
import { useSync } from '@/contexts/sync-context';
import { addNote, countOpenRequestsFor, deletePlot, loadNotes, loadPlots, savePlot } from '@/services/agriService';
import { CROPS, SOIL_LABELS, getCrop } from '@/lib/agri/crops';
import { findZoneByName, getZone } from '@/lib/agri/zones';
import { computeSuitability, WATER_LABELS } from '@/lib/agri/suitability';
import { CALENDAR_DISCLAIMER, cropPhases, monthsToText } from '@/lib/agri/calendar';
import { AREA_UNIT_LABELS, PLOT_STATUS_LABELS, type Plot, type PlotNote } from '@/types/agri';
import { UNIT_LABELS, formatDateTime } from '@/lib/constants';

export function PlotDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { dataVersion, notifyQueued, connection } = useSync();
  const [plot, setPlot] = useState<Plot | null>(null);
  const [pending, setPending] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [cropId, setCropId] = useState('');
  const [notes, setNotes] = useState<PlotNote[]>([]);
  const [notePending, setNotePending] = useState<Set<string>>(new Set());
  const [noteText, setNoteText] = useState('');
  const [requests, setRequests] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    if (!user || !id) return;
    const r = await loadPlots(user.id);
    if (r.error && r.data.length === 0) { setError(true); setLoading(false); return; }
    const found = r.data.find((p) => p.id === id) ?? null;
    setPlot(found); setPending(r.pendingIds.has(id)); setFromCache(r.fromCache); setError(false); setLoading(false);
    const n = await loadNotes(user.id, id);
    setNotes(n.data); setNotePending(n.pendingIds);
  }, [user, id]);

  useEffect(() => { void load(); }, [load, dataVersion]);
  useEffect(() => { if (plot && !cropId) setCropId(plot.planned_crop ?? plot.current_crop ?? 'mais'); }, [plot, cropId]);

  const zone = useMemo(() => getZone(plot?.zone_id) ?? findZoneByName(plot?.locality) ?? null, [plot]);
  const crop = getCrop(cropId);
  const result = useMemo(() => (plot && crop ? computeSuitability(crop, { zone, soilType: plot.soil_type, soilPh: plot.soil_ph, water: plot.water_access }) : null), [plot, crop, zone]);
  const phases = useMemo(() => (crop && zone ? cropPhases(crop, zone) : null), [crop, zone]);

  useEffect(() => {
    setRequests(null);
    if (!crop || connection === 'offline') return;
    let cancelled = false;
    void countOpenRequestsFor(crop.marketName).then((n) => { if (!cancelled) setRequests(n); });
    return () => { cancelled = true; };
  }, [crop, connection]);

  if (loading) return <DashboardLayout title="Ma parcelle"><LoadingState /></DashboardLayout>;
  if (error) return <DashboardLayout title="Ma parcelle"><ErrorState message="Impossible de charger cette parcelle. Vérifiez votre connexion puis réessayez." onRetry={() => { setLoading(true); void load(); }} /></DashboardLayout>;
  if (!plot || !user) return <DashboardLayout title="Ma parcelle"><EmptyState title="Parcelle introuvable" description="Elle a peut-être été supprimée." action={<Link to="/plots"><Button>Mes parcelles</Button></Link>} /></DashboardLayout>;

  const onSave = (p: Plot, isNew: boolean) => {
    if (!savePlot(user.id, p, isNew)) { toast('error', 'Le stockage de cet appareil est indisponible : les modifications n\'ont pas pu être enregistrées.'); return; }
    setPlot(p); setPending(true); setEditing(false); setCropId(p.planned_crop ?? p.current_crop ?? cropId);
    toast('success', connection === 'offline' ? 'Modifications enregistrées sur cet appareil ; elles seront synchronisées au retour de la connexion.' : 'Parcelle mise à jour.');
    notifyQueued();
  };

  const onDelete = () => {
    setConfirmDelete(false);
    if (!deletePlot(user.id, plot.id)) { toast('error', 'Suppression impossible : stockage de l\'appareil indisponible.'); return; }
    notifyQueued();
    toast('success', 'Parcelle supprimée.');
    navigate('/plots');
  };

  const onAddNote = () => {
    const body = noteText.trim();
    if (!body) return;
    const n = addNote(user.id, plot.id, body);
    if (!n) { toast('error', 'Note non enregistrée : stockage de l\'appareil indisponible.'); return; }
    setNotes((l) => [n, ...l]); setNotePending((s) => new Set(s).add(n.id)); setNoteText('');
    notifyQueued();
  };

  const canPublish = connection !== 'offline';
  const publishHref = crop ? `/producer/products/new?crop=${crop.id}${plot.planned_quantity ? `&qty=${plot.planned_quantity}&unit=${plot.planned_unit}` : ''}${zone ? `&zone=${zone.id}` : ''}` : '/producer/products/new';

  return (
    <DashboardLayout title="Ma parcelle">
      <ConfirmDialog
        open={confirmDelete}
        destructive
        title="Supprimer cette parcelle ?"
        description={`« ${plot.name} » et ses notes seront supprimées.`}
        confirmLabel="Supprimer"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={onDelete}
      />
      <div className="space-y-6">
        <Link to="/plots" className="inline-flex items-center gap-1.5 text-sm text-charcoal/60 hover:text-brand-700"><ArrowLeft className="h-4 w-4" /> Mes parcelles</Link>
        <SyncPanel />
        {fromCache && <p className="flex items-center gap-2 rounded-xl border border-black/[0.06] bg-offwhite px-4 py-3 text-xs text-charcoal/60"><WifiOff className="h-4 w-4 shrink-0" /> Données enregistrées sur cet appareil.</p>}

        {editing ? (
          <Card><CardBody><h2 className="mb-4 text-lg font-semibold text-charcoal">Modifier la parcelle</h2><PlotForm userId={user.id} initial={plot} onSave={onSave} onCancel={() => setEditing(false)} /></CardBody></Card>
        ) : (
          <Card><CardBody className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-charcoal">{plot.name}</h1>
                <div className="mt-2 flex flex-wrap gap-2"><Badge variant="brand">{PLOT_STATUS_LABELS[plot.status]}</Badge>{pending && <Badge variant="warning"><CloudOff className="mr-1 inline h-3 w-3" />En attente de synchronisation</Badge>}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2"><ConnectionBadge /><SyncPill />
                <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Modifier</Button>
                <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}><Trash2 className="h-4 w-4" /> Supprimer</Button>
              </div>
            </div>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div><dt className="text-charcoal/50">📍 Localisation</dt><dd className="font-medium text-charcoal">{[plot.locality, zone?.name].filter(Boolean).join(' · ') || 'Non renseignée'}</dd></div>
              <div><dt className="text-charcoal/50">📐 Superficie</dt><dd className="font-medium text-charcoal">{plot.area_value} {AREA_UNIT_LABELS[plot.area_unit]}</dd></div>
              <div><dt className="text-charcoal/50">🌱 Culture actuelle</dt><dd className="font-medium text-charcoal">{getCrop(plot.current_crop)?.name ?? '—'}</dd></div>
              <div><dt className="text-charcoal/50">🎯 Culture envisagée</dt><dd className="font-medium text-charcoal">{getCrop(plot.planned_crop)?.name ?? '—'}</dd></div>
              <div><dt className="text-charcoal/50">Sol (déclaré)</dt><dd className="font-medium text-charcoal">{plot.soil_type ? SOIL_LABELS[plot.soil_type] : 'Non renseigné'}{plot.soil_ph !== null ? ` · pH ${plot.soil_ph}` : ''}</dd></div>
              <div><dt className="text-charcoal/50">Eau</dt><dd className="font-medium text-charcoal">{WATER_LABELS[plot.water_access]}</dd></div>
              {plot.latitude !== null && plot.longitude !== null && (
                <div className="sm:col-span-2 lg:col-span-3"><dt className="text-charcoal/50">Coordonnées</dt><dd className="font-medium text-charcoal">{plot.latitude}, {plot.longitude} <a className="ml-2 inline-flex items-center gap-1 text-brand-700 underline" href={`https://www.openstreetmap.org/?mlat=${plot.latitude}&mlon=${plot.longitude}#map=16/${plot.latitude}/${plot.longitude}`} target="_blank" rel="noopener noreferrer">OpenStreetMap <ExternalLink className="h-3 w-3" /></a></dd></div>
              )}
            </dl>
          </CardBody></Card>
        )}

        {/* Analyse */}
        <section className="space-y-4" aria-labelledby="analyse">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="analyse" className="text-lg font-semibold text-charcoal">Analyser ma parcelle</h2>
            <div className="w-full sm:w-64"><Select label="Culture à analyser" value={cropId} onChange={(e) => setCropId(e.target.value)} options={CROPS.map((c) => ({ value: c.id, label: `${c.emoji} ${c.name}` }))} /></div>
          </div>
          {!zone && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Choisissez une <strong>zone de référence</strong> (bouton « Modifier ») : sans zone, température, pluie et altitude ne sont pas disponibles et l'indice ne peut pas être calculé.</p>}
          {crop && result && <SuitabilityCard cropEmoji={crop.emoji} cropName={crop.name} result={result} />}
          <DataSourcesPanel zoneKnown={Boolean(zone)} soilKnown={Boolean(plot.soil_type) || plot.soil_ph !== null} waterKnown={plot.water_access !== 'inconnu'} />
        </section>

        {/* Calendrier + apprentissage */}
        {crop && (
          <Card><CardBody className="space-y-3">
            <h2 className="text-lg font-semibold text-charcoal">Calendrier — {crop.name}{zone ? ` à ${zone.name}` : ''}</h2>
            {phases ? (
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                <div><dt className="font-semibold text-charcoal">{crop.sowing === 'perennial' ? 'Plantation' : 'Semis'}</dt><dd className="text-charcoal/65">{monthsToText(phases.sow)}</dd></div>
                <div><dt className="font-semibold text-charcoal">Récolte (estimation)</dt><dd className="text-charcoal/65">{phases.longCycleNote ?? monthsToText(phases.harvest)}</dd></div>
                <div><dt className="font-semibold text-charcoal">Cycle</dt><dd className="text-charcoal/65">{crop.cycleLabel}</dd></div>
              </dl>
            ) : <p className="text-sm text-charcoal/60">Choisissez une zone pour afficher les périodes.</p>}
            <p className="text-xs text-charcoal/50">{CALENDAR_DISCLAIMER}</p>
            <div className="flex flex-wrap gap-3">
              <Link to={`/calendar?crop=${crop.id}${zone ? `&zone=${zone.id}` : ''}`}><Button variant="outline"><CalendarDays className="h-4 w-4" /> Voir le calendrier</Button></Link>
              <Link to={`/agriguide/${crop.id}`}><Button variant="outline"><BookOpen className="h-4 w-4" /> Apprendre</Button></Link>
            </div>
          </CardBody></Card>
        )}

        {/* Notes */}
        <Card><CardBody className="space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-charcoal"><StickyNote className="h-5 w-5 text-brand-700" /> Notes de la parcelle</h2>
          <Textarea aria-label="Nouvelle note" value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={2} maxLength={2000} placeholder="Ex. Semis terminé, sol bien humide…" />
          <div className="flex items-center justify-between gap-3"><p className="text-xs text-charcoal/50">Enregistrée immédiatement sur cet appareil, synchronisée dès que possible.</p><Button size="sm" onClick={onAddNote} disabled={!noteText.trim()}>Ajouter la note</Button></div>
          {notes.length === 0 ? <p className="text-sm text-charcoal/50">Aucune note pour le moment.</p> : (
            <ul className="space-y-2">{notes.map((n) => (
              <li key={n.id} className="rounded-xl bg-sage/50 p-3 text-sm text-charcoal"><p className="whitespace-pre-wrap">{n.body}</p><p className="mt-1 flex items-center gap-2 text-[11px] text-charcoal/45">{formatDateTime(n.created_at)}{notePending.has(n.id) && <Badge variant="warning">En attente</Badge>}</p></li>
            ))}</ul>
          )}
        </CardBody></Card>

        {/* De la parcelle au marché */}
        <Card className="border-brand-200 bg-brand-50/60"><CardBody className="space-y-3">
          <h2 className="text-lg font-semibold text-charcoal">De la parcelle au marché</h2>
          <p className="text-sm text-charcoal/70">
            {plot.planned_quantity && crop ? <>Production prévue : <strong>{plot.planned_quantity} {UNIT_LABELS[plot.planned_unit] ?? plot.planned_unit} de {crop.name.toLowerCase()}</strong>.</> : 'Indiquez une quantité prévue (bouton « Modifier ») pour préparer la mise en vente.'}
          </p>
          {requests !== null && crop && (
            <p className="flex items-center gap-2 text-sm font-medium text-brand-800"><Inbox className="h-4 w-4" /> {requests > 0 ? `${requests} demande${requests > 1 ? 's' : ''} d'achat ouverte${requests > 1 ? 's' : ''} pour « ${crop.marketName} » en ce moment.` : `Aucune demande d'achat ouverte pour « ${crop.marketName} » pour l'instant.`}</p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {canPublish ? <Link to={publishHref}><Button variant="sun"><Store className="h-4 w-4" /> Publier ma production</Button></Link> : <Button variant="sun" disabled><Store className="h-4 w-4" /> Publier ma production</Button>}
            <Link to="/producer/requests"><Button variant="outline"><Inbox className="h-4 w-4" /> Demandes d'achat (Agri-Match)</Button></Link>
          </div>
          {!canPublish && <p className="text-xs text-charcoal/55">Une connexion est nécessaire pour publier. Vous pouvez préparer un brouillon : il est conservé sur cet appareil.</p>}
          <p className="flex items-center gap-1 text-xs text-charcoal/50"><MapPin className="h-3 w-3" /> Parcelle → apprendre → planifier → publier → Agri-Match → commande → paiement → livraison.</p>
        </CardBody></Card>
      </div>
    </DashboardLayout>
  );
}
