import { Banknote } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Le paiement à la livraison est un vrai mode de paiement : on ne l'appelle jamais « démonstration ». */
export function CashOnDeliveryNotice({ className }: { className?: string }) {
  return (
    <div role="note" className={cn('flex items-start gap-2.5 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800', className)}>
      <Banknote className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        <span className="font-semibold">Paiement à la livraison. </span>
        Vous réglez en espèces à la réception. Le producteur confirme l'encaissement une fois la commande livrée.
      </p>
    </div>
  );
}
