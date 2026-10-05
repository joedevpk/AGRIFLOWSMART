import { Link } from 'react-router-dom';
import { CloudOff, Loader2, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import { useSync } from '@/contexts/sync-context';
import { describeOp } from '@/services/agriService';
import { cn } from '@/lib/utils';
import type { ConnectionState } from '@/lib/offline/connection';

const CONNECTION_UI: Record<ConnectionState, { dot: string; label: string }> = {
  online: { dot: 'bg-emerald-500', label: 'Connecté' },
  limited: { dot: 'bg-amber-400', label: 'Connexion faible' },
  offline: { dot: 'bg-charcoal/30', label: 'Hors connexion' },
};

/** Indicateur discret : 🟢 Connecté · 🟡 Connexion faible · ⚪ Hors connexion. */
export function ConnectionBadge({ className, compact }: { className?: string; compact?: boolean }) {
  const { connection } = useSync();
  const ui = CONNECTION_UI[connection];
  return (
    <span role="status" aria-live="polite" title={ui.label} className={cn('inline-flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-offwhite px-2.5 py-1 text-[11px] font-medium text-charcoal/70', className)}>
      <span className={cn('h-2 w-2 rounded-full', ui.dot)} aria-hidden />
      {!compact && ui.label}
    </span>
  );
}

/** Synchronisation en cours… / Synchronisé / en attente. Ne s'affiche que s'il y a quelque chose à dire. */
export function SyncPill({ className }: { className?: string }) {
  const { state, pending, connection } = useSync();
  let node: React.ReactNode = null;
  if (state === 'syncing') node = <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Synchronisation en cours…</>;
  else if (state === 'synced') node = <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Synchronisé</>;
  else if (state === 'auth') node = <><AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> Session expirée — données conservées</>;
  else if (pending > 0) node = <><CloudOff className="h-3.5 w-3.5 text-amber-600" /> {pending} modification{pending > 1 ? 's' : ''} en attente{connection === 'offline' ? ' de connexion' : ''}</>;
  if (!node) return null;
  return <span role="status" aria-live="polite" className={cn('inline-flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-offwhite px-2.5 py-1 text-[11px] font-medium text-charcoal/70', className)}>{node}</span>;
}

/** Panneau des actions bloquées : conflit, refus du serveur, session expirée. */
export function SyncPanel() {
  const { problems, state, resolveConflict, discardOp, syncNow, connection } = useSync();
  if (problems.length === 0 && state !== 'auth' && state !== 'error') return null;
  return (
    <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      {state === 'auth' && (
        <p>Votre session a expiré. <strong>Vos modifications sont conservées</strong> sur cet appareil : <Link to="/login" className="font-semibold underline">reconnectez-vous</Link> pour les synchroniser.</p>
      )}
      {state === 'error' && (
        <p className="flex flex-wrap items-center gap-2">
          La synchronisation a échoué (réseau instable). Nouvelle tentative automatique.
          {connection !== 'offline' && <button onClick={() => void syncNow()} className="inline-flex items-center gap-1 font-semibold underline"><RefreshCw className="h-3.5 w-3.5" /> Réessayer maintenant</button>}
        </p>
      )}
      {problems.map((op) => (
        <div key={op.id} className="rounded-xl border border-amber-200 bg-white/70 p-3">
          <p className="font-semibold">{describeOp(op)}</p>
          <p className="mt-0.5 text-xs text-amber-800">{op.status === 'conflict' ? op.lastError : `Refusé par le serveur : ${op.lastError ?? 'raison inconnue'}`}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {op.status === 'conflict' && op.type === 'plot_upsert' && (
              <>
                <button onClick={() => resolveConflict(op.id, 'mine')} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white">Garder ma version</button>
                <button onClick={() => resolveConflict(op.id, 'server')} className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold">Garder la version du serveur</button>
              </>
            )}
            {op.status === 'rejected' && <button onClick={() => discardOp(op.id)} className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold">Abandonner cette modification</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

