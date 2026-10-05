import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/toast-store';
import type { OrderWithDetails } from '@/types';
import { actionsFor, type ActorRole } from '@/lib/order-workflow';
import { transitionOrderStatus } from '@/services/orderService';
import { useConfirmAction } from '@/hooks/useConfirmAction';

interface OrderQuickActionsProps {
  order: OrderWithDetails;
  role: Exclude<ActorRole, 'admin'>;
  /** Appelé après une transition réussie ou refusée : la liste est relue depuis le serveur. */
  onDone: () => void | Promise<void>;
}

/** Boutons d'action rapide d'une carte de commande (le serveur valide chaque transition). */
export function OrderQuickActions({ order, role, onDone }: OrderQuickActionsProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const lock = useRef(false);
  const actions = actionsFor(role, order.status);
  const { request, dialog } = useConfirmAction();

  if (actions.length === 0) return null;

  const execute = async (to: (typeof actions)[number]) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(to.to);
    const result = await transitionOrderStatus(order.id, to.to, to.note);
    if (result.ok) toast('success', 'Commande mise à jour.');
    else toast('error', result.message);
    lock.current = false;
    setBusy(null);
    await onDone();
  };

  const run = (to: (typeof actions)[number]) => {
    if (to.confirm) request({ title: to.label, description: to.confirm, confirmLabel: to.label, destructive: to.variant === 'danger', run: () => execute(to) });
    else void execute(to);
  };

  return (
    <>
      {dialog}
      {actions.map((a) => (
        <Button key={a.to} size="sm" variant={a.variant} loading={busy === a.to} disabled={busy !== null && busy !== a.to} onClick={() => run(a)}>
          {a.label}
        </Button>
      ))}
    </>
  );
}
