import { useCallback, useRef, useState, type ReactNode } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

export interface ConfirmRequest {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  /** Action exécutée à la confirmation ; le dialogue reste ouvert (état loading) tant qu'elle est en cours. */
  run: () => void | Promise<void>;
}

/**
 * Point d'entrée unique des confirmations (remplace window.confirm) :
 * `const { request, dialog } = useConfirmAction();` puis `request({...})` et `{dialog}` dans le JSX.
 */
export function useConfirmAction() {
  const [pending, setPending] = useState<ConfirmRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);

  const request = useCallback((req: ConfirmRequest) => setPending(req), []);

  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      title={pending?.title ?? ''}
      description={pending?.description}
      confirmLabel={pending?.confirmLabel}
      destructive={pending?.destructive}
      loading={loading}
      onCancel={() => { if (!busy.current) setPending(null); }}
      onConfirm={async () => {
        if (!pending || busy.current) return;
        busy.current = true;
        setLoading(true);
        try {
          await pending.run();
        } finally {
          busy.current = false;
          setLoading(false);
          setPending(null);
        }
      }}
    />
  );

  return { request, dialog };
}
