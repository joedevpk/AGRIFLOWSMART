import { useRef, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useModalA11y } from '@/hooks/useModalA11y';
import { Button } from './Button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Action destructive : bouton de confirmation rouge. */
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Boîte de confirmation accessible (focus piégé, Échap, retour du focus), en remplacement de window.confirm.
 * Le focus initial est sur « Annuler » : une confirmation destructive ne doit jamais être le choix par défaut.
 */
export function ConfirmDialog(props: ConfirmDialogProps) {
  if (!props.open) return null;
  return <ConfirmDialogInner {...props} />;
}

function ConfirmDialogInner({ title, description, confirmLabel = 'Confirmer', cancelLabel = 'Annuler', destructive, loading, onConfirm, onCancel }: ConfirmDialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useModalA11y(true, loading ? () => undefined : onCancel, ref, cancelRef);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-4 sm:items-center" onMouseDown={(e) => { if (e.target === e.currentTarget && !loading) onCancel(); }}>
      <div ref={ref} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby={description ? 'confirm-desc' : undefined} className="w-full max-w-md rounded-2xl border border-black/[0.06] bg-offwhite p-6 shadow-xl animate-fade-in dark:border-white/10">
        <div className="flex items-start gap-3">
          <span className={destructive ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600' : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700'}>
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="confirm-title" className="text-lg font-bold text-charcoal">{title}</h2>
            {description && <p id="confirm-desc" className="mt-1.5 text-sm text-charcoal/65">{description}</p>}
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button ref={cancelRef} type="button" variant="outline" onClick={onCancel} disabled={loading}>{cancelLabel}</Button>
          <Button type="button" variant={destructive ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
