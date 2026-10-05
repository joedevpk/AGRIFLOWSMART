import { Link } from 'react-router-dom';
import { Bell, Inbox, ShoppingBag, ShoppingCart } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button-styles';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { Skeleton, OrderCardSkeleton } from '@/components/ui/Skeleton';

/* ------------------------------------------------------------------ */
/*  États vides                                                        */
/* ------------------------------------------------------------------ */

export function EmptyCart() {
  return (
    <Card>
      <CardBody>
        <EmptyState
          icon={<ShoppingCart className="h-8 w-8" />}
          title="Votre panier est encore vide."
          description="Parcourez les productions disponibles et ajoutez celles qui vous intéressent."
          action={<Link to="/marketplace" className={buttonStyles({ variant: 'primary', size: 'lg' })}>Explorer les productions</Link>}
        />
      </CardBody>
    </Card>
  );
}

export function EmptyOrders() {
  return (
    <Card>
      <CardBody>
        <EmptyState
          icon={<ShoppingBag className="h-8 w-8" />}
          title="Vous n'avez pas encore de commande."
          description="Vos commandes apparaîtront ici dès votre premier achat."
          action={<Link to="/marketplace" className={buttonStyles({ variant: 'primary', size: 'lg' })}>Explorer les productions</Link>}
        />
      </CardBody>
    </Card>
  );
}

export function EmptyOrdersFiltered() {
  return (
    <Card>
      <CardBody>
        <EmptyState icon={<Inbox className="h-8 w-8" />} title="Aucune commande dans cette catégorie." description="Changez de filtre pour voir vos autres commandes." />
      </CardBody>
    </Card>
  );
}

export function EmptyProducerOrders({ filtered }: { filtered?: boolean }) {
  return (
    <Card>
      <CardBody>
        <EmptyState
          icon={<Inbox className="h-8 w-8" />}
          title={filtered ? 'Aucune commande dans cette catégorie.' : 'Aucune commande reçue pour le moment.'}
          description={
            filtered
              ? 'Changez de filtre pour voir les autres commandes.'
              : 'Les commandes de vos acheteurs apparaîtront ici. Gardez vos productions à jour pour en recevoir.'
          }
          action={
            filtered ? undefined : <Link to="/producer/products" className={buttonStyles({ variant: 'secondary', size: 'lg' })}>Voir mes productions</Link>
          }
        />
      </CardBody>
    </Card>
  );
}

export function EmptyNotifications() {
  return (
    <Card>
      <CardBody>
        <EmptyState
          icon={<Bell className="h-8 w-8" />}
          title="Aucune notification."
          description="Vous serez prévenu ici des nouvelles commandes et des changements de statut."
        />
      </CardBody>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Squelettes de chargement                                           */
/* ------------------------------------------------------------------ */

export function CartSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-3" role="status" aria-label="Chargement du panier">
      <div className="space-y-4 lg:col-span-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-4 rounded-2xl border border-black/[0.06] bg-offwhite p-4">
            <Skeleton className="h-24 w-24 shrink-0 rounded-xl" />
            <div className="flex-1 space-y-2.5">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="mt-3 h-11 w-36 rounded-xl" />
            </div>
          </div>
        ))}
      </div>
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}

export function CheckoutSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Chargement du paiement">
      <Skeleton className="h-8 w-full max-w-xl" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-11 w-full rounded-xl" />
          <Skeleton className="h-11 w-full rounded-xl" />
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}

export function OrderSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-4" role="status" aria-label="Chargement des commandes">
      {Array.from({ length: count }).map((_, i) => <OrderCardSkeleton key={i} />)}
    </div>
  );
}

export function OrderDetailSkeleton() {
  return (
    <div className="max-w-4xl space-y-6" role="status" aria-label="Chargement de la commande">
      <Skeleton className="h-9 w-64" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

export function PaymentSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Chargement des paiements">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
      <OrderSkeleton count={3} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  États d'erreur                                                     */
/* ------------------------------------------------------------------ */

export function LoadError({ title, message, onRetry }: { title: string; message?: string; onRetry: () => void }) {
  return (
    <Card>
      <CardBody>
        <ErrorState title={title} message={message ?? 'Vérifiez votre connexion puis réessayez.'} onRetry={onRetry} />
      </CardBody>
    </Card>
  );
}
