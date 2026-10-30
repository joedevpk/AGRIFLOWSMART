import { useCallback, useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { Button, Card, CardBody, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { formatDateTime } from '@/lib/constants';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/logger';
import { ADMIN_ACTION_LABELS } from '@/lib/finance';

interface Entry { id: string; occurred_at: string; actor_id: string | null; action: string; entity_type: string; reason?: string | null; before_state: Record<string, unknown> | null; after_state: Record<string, unknown> | null; source: 'admin' | 'finance' }
const PAGE = 25;

function summarize(e: Entry): string {
  const b = e.before_state ?? {}, a = e.after_state ?? {};
  if (e.action === 'profile.role_changed') return `${String(b.role ?? '?')} → ${String(a.role ?? '?')}`;
  if (e.action === 'profile.verification_changed') return a.is_verified ? 'compte vérifié' : 'vérification retirée';
  if (e.action === 'product.status_changed') return `${String(b.status ?? '?')} → ${String(a.status ?? '?')}`;
  if (e.action === 'product.deleted_by_admin') return `« ${String(b.name ?? '')} »`;
  if (e.action === 'export.transactions') return `${String(a.row_count ?? 0)} ligne(s)${a.truncated ? ' (tronqué)' : ''}`;
  if (typeof a.rate_bps === 'number') return `${a.rate_bps / 100} %`;
  return '';
}

export function FinanceJournal() {
  const [page, setPage] = useState(1);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true); setFailed(null);
    const from = (p - 1) * PAGE, to = from + PAGE; // PAGE + 1 lignes pour savoir s'il y a une suite
    const [a, f] = await Promise.all([
      supabase.from('admin_action_log').select('id, occurred_at, actor_id, action, entity_type, reason, before_state, after_state').order('occurred_at', { ascending: false }).order('id').range(from, to),
      supabase.from('financial_audit_log').select('id, occurred_at, actor_id, action, entity_type, before_state, after_state').order('occurred_at', { ascending: false }).order('id').range(from, to),
    ]);
    const err = a.error ?? f.error;
    if (err) { reportError('FinanceJournal.load', err.message); setFailed('Impossible de charger le journal.'); setLoading(false); return; }
    const merged: Entry[] = [
      ...(a.data ?? []).map((x) => ({ ...x, source: 'admin' as const })), ...(f.data ?? []).map((x) => ({ ...x, source: 'finance' as const })),
    ].sort((x, y) => (x.occurred_at < y.occurred_at ? 1 : x.occurred_at > y.occurred_at ? -1 : 0));
    setMore(merged.length > PAGE);
    const slice = merged.slice(0, PAGE);
    setEntries(slice);
    const ids = Array.from(new Set(slice.map((e) => e.actor_id).filter((x): x is string => !!x)));
    if (ids.length > 0) {
      const { data } = await supabase.from('profiles').select('user_id, full_name').in('user_id', ids);
      setNames(Object.fromEntries((data ?? []).map((p) => [p.user_id as string, p.full_name as string])));
    }
    setLoading(false);
  }, []);
  useEffect(() => { void load(page); }, [load, page]);

  if (failed) return <ErrorState message={failed} onRetry={() => void load(page)} />;
  if (loading && entries.length === 0) return <LoadingState />;
  return (
    <div className="space-y-4">
      <p className="text-xs text-charcoal/55">Journal en ajout seul : les entrées ne peuvent être ni modifiées ni supprimées. Les exports ne journalisent que les filtres et le nombre de lignes, jamais leur contenu. Les actions effectuées hors de l'application (éditeur SQL) apparaissent sans auteur.</p>
      {entries.length === 0 ? <Card><CardBody><EmptyState icon={<History className="h-8 w-8" />} title="Aucune action enregistrée" /></CardBody></Card> : (
        <Card><CardBody className="p-0"><ul className="divide-y divide-black/[0.06]">{entries.map((e) => (
          <li key={`${e.source}-${e.id}`} className="flex flex-wrap items-start justify-between gap-2 px-5 py-3 text-sm">
            <div className="min-w-0"><p className="font-medium text-charcoal">{ADMIN_ACTION_LABELS[e.action] ?? e.action}{summarize(e) ? <span className="font-normal text-charcoal/65"> · {summarize(e)}</span> : null}</p>{e.reason ? <p className="text-xs text-charcoal/60">Motif : {e.reason}</p> : null}</div>
            <p className="text-xs text-charcoal/55">{formatDateTime(e.occurred_at)} · {e.actor_id ? names[e.actor_id] ?? `${e.actor_id.slice(0, 8)}…` : 'hors application'}</p>
          </li>))}</ul></CardBody></Card>
      )}
      <nav className="flex items-center justify-between gap-3" aria-label="Pagination du journal">
        <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>Précédent</Button>
        <span className="text-sm text-charcoal/60">Page {page}</span>
        <Button variant="outline" size="sm" disabled={!more || loading} onClick={() => setPage((p) => p + 1)}>Suivant</Button>
      </nav>
    </div>
  );
}
