import { PLOT_COLUMNS, PLOT_NOTE_COLUMNS, CROP_TIP_COLUMNS } from '@/lib/columns';
import { supabase } from '@/lib/supabase';
import { OfflineQueue, classifyError, type ExecResult, type QueuedOp } from '@/lib/offline/queue';
import { cacheRead, cacheWrite, storageKey } from '@/lib/offline/storage';
import { reportNetworkFailure, reportNetworkSuccess, isNetworkError } from '@/lib/offline/connection';
import type { Plot, PlotNote, CropTip } from '@/types/agri';

/**
 * Données « Ma Parcelle » / notes / progression AgriGuide — LOCAL-FIRST.
 * Chaque écriture est d'abord placée dans une file locale (persistante), puis envoyée à Supabase
 * dès que possible. Les lectures affichent le dernier état serveur connu + les actions en attente.
 * Rien n'est jamais présenté comme synchronisé tant que le serveur ne l'a pas confirmé.
 */
export const queueFor = (uid: string) => new OfflineQueue(storageKey(uid, 'queue'));

export type PlotUpsertPayload = { plot: Plot; isNew: boolean; baseVersion: number | null; force?: boolean };
export type PlotDeletePayload = { id: string };
export type NoteAddPayload = { note: PlotNote };
export type ProgressPayload = { crop_id: string; step_key: string; completed: boolean };

const PLOT_FIELDS = [
  'name', 'zone_id', 'locality', 'latitude', 'longitude', 'area_value', 'area_unit', 'current_crop', 'planned_crop',
  'start_date', 'status', 'water_access', 'soil_type', 'soil_ph', 'planned_quantity', 'planned_unit', 'notes',
] as const;

function plotFields(p: Plot): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of PLOT_FIELDS) out[k] = p[k];
  return out;
}

const uid8 = () => crypto.randomUUID();
const opId = (kind: string) => `${kind}:${Date.now()}:${uid8().slice(0, 8)}`;

// ---------------------------------------------------------------------------
// Lecture : état serveur (ou cache) + actions locales en attente
// ---------------------------------------------------------------------------
export interface LoadResult<T> { data: T; fromCache: boolean; savedAt: string | null; error: string | null; pendingIds: Set<string> }

function applyPlotOps(base: Plot[], ops: QueuedOp[]): { plots: Plot[]; pendingIds: Set<string> } {
  let plots = [...base];
  const pendingIds = new Set<string>();
  for (const op of ops) {
    if (op.type === 'plot_upsert') {
      const { plot } = op.payload as PlotUpsertPayload;
      pendingIds.add(plot.id);
      const i = plots.findIndex((p) => p.id === plot.id);
      if (i === -1) plots = [plot, ...plots]; else plots[i] = plot;
    } else if (op.type === 'plot_delete') {
      const { id } = op.payload as PlotDeletePayload;
      plots = plots.filter((p) => p.id !== id);
    }
  }
  return { plots, pendingIds };
}

export async function loadPlots(uid: string): Promise<LoadResult<Plot[]>> {
  const key = storageKey(uid, 'plots');
  const ops = queueFor(uid).list();
  const { data, error } = await supabase.from('user_plots').select(PLOT_COLUMNS).eq('user_id', uid).order('created_at', { ascending: false }).limit(200);
  if (!error && data) {
    reportNetworkSuccess();
    cacheWrite(key, data as Plot[]);
    const { plots, pendingIds } = applyPlotOps(data as Plot[], ops);
    return { data: plots, fromCache: false, savedAt: null, error: null, pendingIds };
  }
  if (error && isNetworkError(error.message)) reportNetworkFailure();
  const cached = cacheRead<Plot[]>(key);
  if (cached) {
    const { plots, pendingIds } = applyPlotOps(cached.data, ops);
    return { data: plots, fromCache: true, savedAt: cached.savedAt, error: null, pendingIds };
  }
  const { plots, pendingIds } = applyPlotOps([], ops);
  return { data: plots, fromCache: true, savedAt: null, error: error?.message ?? 'Chargement impossible', pendingIds };
}

export async function loadNotes(uid: string, plotId: string): Promise<LoadResult<PlotNote[]>> {
  const key = storageKey(uid, `notes:${plotId}`);
  const pending = queueFor(uid).list().filter((o) => o.type === 'note_add').map((o) => (o.payload as NoteAddPayload).note).filter((n) => n.plot_id === plotId);
  const pendingIds = new Set(pending.map((n) => n.id));
  const merge = (rows: PlotNote[]) => [...pending.filter((n) => !rows.some((r) => r.id === n.id)), ...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const { data, error } = await supabase.from('plot_notes').select(PLOT_NOTE_COLUMNS).eq('plot_id', plotId).eq('user_id', uid).order('created_at', { ascending: false }).limit(100);
  if (!error && data) { reportNetworkSuccess(); cacheWrite(key, data as PlotNote[]); return { data: merge(data as PlotNote[]), fromCache: false, savedAt: null, error: null, pendingIds }; }
  if (error && isNetworkError(error.message)) reportNetworkFailure();
  const cached = cacheRead<PlotNote[]>(key);
  return { data: merge(cached?.data ?? []), fromCache: true, savedAt: cached?.savedAt ?? null, error: cached ? null : (error?.message ?? null), pendingIds };
}

export type ProgressMap = Record<string, boolean>;
export const progressKey = (cropId: string, stepKey: string) => `${cropId}:${stepKey}`;

export async function loadProgress(uid: string): Promise<LoadResult<ProgressMap>> {
  const key = storageKey(uid, 'progress');
  const applyPending = (m: ProgressMap): { map: ProgressMap; pendingIds: Set<string> } => {
    const map = { ...m };
    const pendingIds = new Set<string>();
    for (const o of queueFor(uid).list()) {
      if (o.type !== 'progress_set') continue;
      const p = o.payload as ProgressPayload;
      map[progressKey(p.crop_id, p.step_key)] = p.completed;
      pendingIds.add(progressKey(p.crop_id, p.step_key));
    }
    return { map, pendingIds };
  };
  const { data, error } = await supabase.from('learning_progress').select('crop_id, step_key, completed').eq('user_id', uid).limit(1000);
  if (!error && data) {
    reportNetworkSuccess();
    const server: ProgressMap = {};
    for (const r of data as { crop_id: string; step_key: string; completed: boolean }[]) server[progressKey(r.crop_id, r.step_key)] = r.completed;
    cacheWrite(key, server);
    const { map, pendingIds } = applyPending(server);
    return { data: map, fromCache: false, savedAt: null, error: null, pendingIds };
  }
  if (error && isNetworkError(error.message)) reportNetworkFailure();
  const cached = cacheRead<ProgressMap>(key);
  const { map, pendingIds } = applyPending(cached?.data ?? {});
  return { data: map, fromCache: true, savedAt: cached?.savedAt ?? null, error: cached ? null : (error?.message ?? null), pendingIds };
}

/** Dernière liste de parcelles connue localement (sans réseau) — pour les tableaux de bord. */
export function cachedPlots(uid: string): Plot[] {
  const cached = cacheRead<Plot[]>(storageKey(uid, 'plots'));
  return applyPlotOps(cached?.data ?? [], queueFor(uid).list()).plots;
}

// ---------------------------------------------------------------------------
// Écriture : uniquement dans la file locale. Retourne false si le stockage local est indisponible.
// ---------------------------------------------------------------------------
export function newPlotId(): string { return uid8(); }

export function savePlot(uid: string, plot: Plot, isNew: boolean): boolean {
  const q = queueFor(uid);
  const existing = q.list().find((o) => o.type === 'plot_upsert' && (o.payload as PlotUpsertPayload).plot.id === plot.id && o.status !== 'rejected');
  if (existing) {
    const prev = existing.payload as PlotUpsertPayload;
    q.replaceWhere((o) => o.id === existing.id, { ...existing, payload: { ...prev, plot } satisfies PlotUpsertPayload });
    return true;
  }
  return q.enqueue({ id: opId('plot'), type: 'plot_upsert', payload: { plot, isNew, baseVersion: isNew ? null : plot.version } satisfies PlotUpsertPayload });
}

export function deletePlot(uid: string, plotId: string): boolean {
  const q = queueFor(uid);
  const ops = q.list();
  const neverSynced = ops.some((o) => o.type === 'plot_upsert' && (o.payload as PlotUpsertPayload).plot.id === plotId && (o.payload as PlotUpsertPayload).isNew);
  for (const o of ops) {
    const involves =
      (o.type === 'plot_upsert' && (o.payload as PlotUpsertPayload).plot.id === plotId) ||
      (o.type === 'note_add' && (o.payload as NoteAddPayload).note.plot_id === plotId);
    if (involves) q.remove(o.id);
  }
  if (neverSynced) return true; // la parcelle n'a jamais atteint le serveur : rien à supprimer là-bas
  return q.enqueue({ id: opId('plotdel'), type: 'plot_delete', payload: { id: plotId } satisfies PlotDeletePayload });
}

export function addNote(uid: string, plotId: string, body: string): PlotNote | null {
  const note: PlotNote = { id: uid8(), user_id: uid, plot_id: plotId, body: body.trim(), created_at: new Date().toISOString() };
  return queueFor(uid).enqueue({ id: opId('note'), type: 'note_add', payload: { note } satisfies NoteAddPayload }) ? note : null;
}

export function setProgress(uid: string, cropId: string, stepKey: string, completed: boolean): boolean {
  const q = queueFor(uid);
  const same = q.list().find((o) => o.type === 'progress_set' && (o.payload as ProgressPayload).crop_id === cropId && (o.payload as ProgressPayload).step_key === stepKey);
  const payload: ProgressPayload = { crop_id: cropId, step_key: stepKey, completed };
  if (same) { q.replaceWhere((o) => o.id === same.id, { ...same, payload, status: 'pending' }); return true; }
  return q.enqueue({ id: opId('prog'), type: 'progress_set', payload });
}

// ---------------------------------------------------------------------------
// Exécution d'une action de la file (appelée par la synchronisation)
// ---------------------------------------------------------------------------
type DbError = { message: string; code?: string } | null;
const fromDb = (error: DbError): ExecResult => {
  if (error && isNetworkError(error.message)) reportNetworkFailure();
  return classifyError(error ?? undefined);
};

export async function execOp(uid: string, op: QueuedOp): Promise<ExecResult> {
  try {
    switch (op.type) {
      case 'plot_upsert': {
        const { plot, isNew, baseVersion, force } = op.payload as PlotUpsertPayload;
        if (isNew) {
          const { error } = await supabase.from('user_plots').upsert({ id: plot.id, user_id: uid, ...plotFields(plot) }, { onConflict: 'id' });
          if (error) return fromDb(error);
          reportNetworkSuccess();
          return { kind: 'ok' };
        }
        let q = supabase.from('user_plots').update(plotFields(plot)).eq('id', plot.id).eq('user_id', uid);
        if (!force) q = q.eq('version', baseVersion ?? plot.version);
        const { data, error } = await q.select('id');
        if (error) return fromDb(error);
        reportNetworkSuccess();
        if (data && data.length > 0) return { kind: 'ok' };
        const check = await supabase.from('user_plots').select('id, version').eq('id', plot.id).eq('user_id', uid).maybeSingle();
        if (check.error) return fromDb(check.error);
        if (!check.data) {
          if (force) {
            const ins = await supabase.from('user_plots').upsert({ id: plot.id, user_id: uid, ...plotFields(plot) }, { onConflict: 'id' });
            return ins.error ? fromDb(ins.error) : { kind: 'ok' };
          }
          return { kind: 'conflict', message: 'Cette parcelle a été supprimée depuis un autre appareil.' };
        }
        return { kind: 'conflict', message: 'Cette parcelle a été modifiée depuis un autre appareil.' };
      }
      case 'plot_delete': {
        const { id } = op.payload as PlotDeletePayload;
        const { error } = await supabase.from('user_plots').delete().eq('id', id).eq('user_id', uid);
        return error ? fromDb(error) : (reportNetworkSuccess(), { kind: 'ok' });
      }
      case 'note_add': {
        const { note } = op.payload as NoteAddPayload;
        const { error } = await supabase.from('plot_notes').upsert({ id: note.id, user_id: uid, plot_id: note.plot_id, body: note.body, created_at: note.created_at }, { onConflict: 'id' });
        return error ? fromDb(error) : (reportNetworkSuccess(), { kind: 'ok' });
      }
      case 'progress_set': {
        const p = op.payload as ProgressPayload;
        const { error } = await supabase.from('learning_progress').upsert({ user_id: uid, crop_id: p.crop_id, step_key: p.step_key, completed: p.completed }, { onConflict: 'user_id,crop_id,step_key' });
        return error ? fromDb(error) : (reportNetworkSuccess(), { kind: 'ok' });
      }
      default:
        return { kind: 'rejected', message: `Action inconnue : ${op.type}` };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (isNetworkError(message)) reportNetworkFailure();
    return classifyError({ message });
  }
}

export function describeOp(op: QueuedOp): string {
  switch (op.type) {
    case 'plot_upsert': return `Parcelle « ${(op.payload as PlotUpsertPayload).plot.name} »`;
    case 'plot_delete': return 'Suppression d\'une parcelle';
    case 'note_add': return 'Note de parcelle';
    case 'progress_set': return 'Progression AgriGuide';
    default: return op.type;
  }
}

/** Nombre de demandes d'achat ouvertes qui recherchent ce produit (Agri-Match). Lecture seule, données réelles. */
export async function countOpenRequestsFor(marketName: string): Promise<number | null> {
  const { count, error } = await supabase.from('buyer_requests').select('id', { count: 'exact', head: true }).eq('status', 'open').ilike('product_name', `%${marketName}%`);
  if (error) return null;
  return count ?? 0;
}

/** Conseils agricoles publiés par un administrateur pour une culture (voir crop_tips). Lecture seule, jamais de fallback inventé. */
export async function listActiveCropTips(cropId: string): Promise<CropTip[]> {
  const { data, error } = await supabase.from('crop_tips').select(CROP_TIP_COLUMNS).eq('crop_id', cropId).eq('is_active', true).order('created_at', { ascending: false });
  if (error) return [];
  return (data as CropTip[]) ?? [];
}
