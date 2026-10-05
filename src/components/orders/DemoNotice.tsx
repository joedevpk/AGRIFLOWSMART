import { FlaskConical } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Bandeau affiché uniquement pour les commandes créées AVANT la mise en
 * production du paiement réel (Passe 16) : leur paiement historique
 * `demo_paid` n'a jamais débité de montant réel. Depuis la Passe 16, plus
 * aucune commande ne peut produire ce statut.
 */
export function DemoNotice({ children, className }: { children?: string; className?: string }) {
  return (
    <div role="note" className={cn('flex items-start gap-2.5 rounded-xl border border-accent-300 bg-accent-50 px-4 py-3 text-sm text-accent-700', className)}>
      <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        <span className="font-semibold">Ancienne commande de démonstration. </span>
        {children ?? 'Ce paiement date d\'avant la mise en production : aucun montant réel n\'a été débité.'}
      </p>
    </div>
  );
}
