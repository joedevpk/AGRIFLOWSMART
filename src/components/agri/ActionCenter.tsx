import { Link } from 'react-router-dom';
import { CheckSquare, ArrowRight } from 'lucide-react';
import { Card, CardBody } from '@/components/ui';

/**
 * Centre d'actions — « À faire aujourd'hui ».
 * Chaque entrée est calculée à partir de données réelles (parcelles, progression AgriGuide,
 * calendrier de la zone, correspondances Agri-Match, commandes) : rien n'est un message fictif.
 * Le composant est purement présentationnel ; c'est l'appelant qui calcule les `items`.
 */
export interface ActionItem {
  id: string;
  text: string;
  to: string;
}

interface ActionCenterProps {
  items: ActionItem[];
  /** Si renseigné, s'affiche quand il n'y a rien à faire (au lieu de masquer la section). */
  emptyText?: string;
}

export function ActionCenter({ items, emptyText }: ActionCenterProps) {
  if (items.length === 0) {
    if (!emptyText) return null;
    return (
      <div>
        <h2 className="mb-4 text-lg font-semibold text-charcoal">À faire aujourd'hui</h2>
        <Card><CardBody className="flex items-center gap-3 text-sm text-charcoal/70"><CheckSquare className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />{emptyText}</CardBody></Card>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-charcoal">À faire aujourd'hui</h2>
      <Card>
        <CardBody className="divide-y divide-black/[0.06] p-0">
          {items.map((item) => (
            <Link
              key={item.id}
              to={item.to}
              className="group flex items-center gap-3 px-5 py-3.5 text-sm text-charcoal transition-colors hover:bg-offwhite first:rounded-t-2xl last:rounded-b-2xl"
            >
              <CheckSquare className="h-4 w-4 shrink-0 text-brand-600" />
              <span className="flex-1">{item.text}</span>
              <ArrowRight className="h-4 w-4 shrink-0 text-charcoal/30 transition-transform group-hover:translate-x-1 group-hover:text-brand-600" />
            </Link>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
