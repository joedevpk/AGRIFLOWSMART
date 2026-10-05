import type { DeliveryStatus, OrderStatus, PaymentMethod, PaymentStatus } from '@/types';

/**
 * Workflow des commandes — SOURCE DE VÉRITÉ CÔTÉ INTERFACE.
 *
 * Ce module reflète exactement la fonction SQL `order_transition_allowed`
 * (migration 20260924120000). Il ne sert qu'à décider quels boutons afficher :
 * la vraie protection est la RPC `transition_order_status` (RLS + triggers), qui
 * refuse toute transition interdite même si l'interface est contournée.
 */

export type ActorRole = 'producer' | 'buyer' | 'admin';

const PRODUCER_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['in_delivery'],
  in_delivery: ['delivered'],
  delivered: ['completed'],
};

const BUYER_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  pending: ['cancelled'],
  delivered: ['completed'],
};

export function allowedTransitions(role: ActorRole, from: OrderStatus): OrderStatus[] {
  const producer = PRODUCER_TRANSITIONS[from] ?? [];
  const buyer = BUYER_TRANSITIONS[from] ?? [];
  if (role === 'producer') return [...producer];
  if (role === 'buyer') return [...buyer];
  const adminExtra: OrderStatus[] = from === 'ready' || from === 'in_delivery' ? ['cancelled'] : [];
  return Array.from(new Set<OrderStatus>([...producer, ...buyer, ...adminExtra]));
}

export function canTransition(role: ActorRole, from: OrderStatus, to: OrderStatus): boolean {
  return allowedTransitions(role, from).includes(to);
}

export function isTerminalStatus(status: OrderStatus): boolean {
  return status === 'completed' || status === 'cancelled';
}

export interface TransitionAction {
  to: OrderStatus;
  label: string;
  /** Message d'historique enregistré avec la transition. */
  note: string;
  variant: 'primary' | 'outline' | 'danger';
  /** Une confirmation est demandée avant l'action (irréversible). */
  confirm?: string;
}

const ACTIONS: Record<OrderStatus, Omit<TransitionAction, 'to'>> = {
  pending: { label: 'Remettre en attente', note: '', variant: 'outline' },
  confirmed: { label: 'Confirmer la commande', note: 'Commande confirmée par le producteur', variant: 'primary' },
  preparing: { label: 'Commencer la préparation', note: 'Préparation en cours', variant: 'primary' },
  ready: { label: 'Marquer comme prête', note: 'Commande prête', variant: 'primary' },
  in_delivery: { label: 'Démarrer la livraison', note: 'Livraison en cours', variant: 'primary' },
  delivered: { label: 'Confirmer la livraison', note: 'Commande livrée', variant: 'primary' },
  completed: { label: 'Terminer la commande', note: 'Transaction terminée', variant: 'primary' },
  cancelled: {
    label: 'Annuler la commande',
    note: 'Commande annulée',
    variant: 'outline',
    confirm: 'Annuler cette commande ? Le stock réservé sera remis en vente.',
  },
};

/** Actions proposées à l'acteur pour l'état courant, la progression d'abord, l'annulation en dernier. */
export function actionsFor(role: ActorRole, status: OrderStatus): TransitionAction[] {
  const targets = allowedTransitions(role, status);
  const ordered = [...targets.filter((t) => t !== 'cancelled'), ...targets.filter((t) => t === 'cancelled')];
  return ordered.map((to) => {
    const action = ACTIONS[to];
    if (role === 'producer' && to === 'cancelled' && status === 'pending') {
      return { to, ...action, label: 'Refuser la commande', note: 'Commande refusée par le producteur' };
    }
    if (role === 'buyer' && to === 'completed') {
      return { to, ...action, label: 'Confirmer la réception', note: 'Réception confirmée par l\'acheteur' };
    }
    return { to, ...action };
  });
}

/** Statut de livraison correspondant à un statut de commande (mirroir de la RPC). */
export function deliveryStatusFor(status: OrderStatus): DeliveryStatus {
  switch (status) {
    case 'preparing': return 'preparing';
    case 'ready': return 'ready';
    case 'in_delivery': return 'in_delivery';
    case 'delivered':
    case 'completed': return 'delivered';
    case 'cancelled': return 'cancelled';
    default: return 'pending';
  }
}

/** Filtres de la liste des commandes reçues (tableau de bord producteur). */
export type ProducerOrderFilter = 'all' | 'to_confirm' | 'to_prepare' | 'ready' | 'in_delivery' | 'done' | 'cancelled';

export const PRODUCER_FILTERS: { id: ProducerOrderFilter; label: string; statuses: OrderStatus[] | null }[] = [
  { id: 'all', label: 'Toutes', statuses: null },
  { id: 'to_confirm', label: 'À confirmer', statuses: ['pending'] },
  { id: 'to_prepare', label: 'À préparer', statuses: ['confirmed', 'preparing'] },
  { id: 'ready', label: 'Prêtes', statuses: ['ready'] },
  { id: 'in_delivery', label: 'En livraison', statuses: ['in_delivery'] },
  { id: 'done', label: 'Terminées', statuses: ['delivered', 'completed'] },
  { id: 'cancelled', label: 'Annulées', statuses: ['cancelled'] },
];

export function matchesProducerFilter(status: OrderStatus, filter: ProducerOrderFilter): boolean {
  const def = PRODUCER_FILTERS.find((f) => f.id === filter);
  return !def?.statuses || def.statuses.includes(status);
}

/** Filtres de la liste « Mes commandes » côté acheteur (uniquement les statuts réellement présents). */
export type BuyerOrderFilter = 'all' | 'pending' | 'confirmed' | 'preparing' | 'ready' | 'in_delivery' | 'done' | 'cancelled';

export const BUYER_FILTERS: { id: BuyerOrderFilter; label: string; statuses: OrderStatus[] | null }[] = [
  { id: 'all', label: 'Toutes', statuses: null },
  { id: 'pending', label: 'En attente', statuses: ['pending'] },
  { id: 'confirmed', label: 'Confirmées', statuses: ['confirmed'] },
  { id: 'preparing', label: 'En préparation', statuses: ['preparing'] },
  { id: 'ready', label: 'Prêtes', statuses: ['ready'] },
  { id: 'in_delivery', label: 'En livraison', statuses: ['in_delivery'] },
  { id: 'done', label: 'Livrées', statuses: ['delivered', 'completed'] },
  { id: 'cancelled', label: 'Annulées', statuses: ['cancelled'] },
];

/* ------------------------------------------------------------------ */
/*  Paiement                                                           */
/* ------------------------------------------------------------------ */

/** Paiement historique de démonstration (commandes créées avant la Passe 16). */
export function isDemoPayment(status: PaymentStatus, isDemoFlag?: boolean): boolean {
  return isDemoFlag === true || status === 'demo_paid';
}

export function paymentSummary(
  method: PaymentMethod | null,
  status: PaymentStatus,
  orderStatus: OrderStatus,
  /** Dernière demande de remboursement connue (Passe 23). Seul le statut du prestataire fait foi. */
  refundStatus?: 'requested' | 'processing' | 'completed' | 'failed' | null,
): { label: string; tone: 'success' | 'warning' | 'error' | 'neutral' | 'info'; note: string | null } {
  // Commande annulée / expirée APRÈS paiement : jamais « Payé » ni « Remboursé » sans confirmation réelle.
  if (status === 'paid' && orderStatus === 'cancelled') {
    if (refundStatus === 'completed') return { label: 'Remboursé', tone: 'success', note: 'Le remboursement a été confirmé.' };
    if (refundStatus === 'processing') return { label: 'Remboursement en cours', tone: 'info', note: 'Le remboursement est en cours de traitement par l\'équipe AgriFlow.' };
    if (refundStatus === 'failed') return { label: 'Remboursement en échec', tone: 'error', note: 'L\'équipe AgriFlow doit intervenir.' };
    return { label: 'Remboursement à traiter', tone: 'warning', note: 'Votre paiement a été reçu ; une demande de remboursement est enregistrée. Rien n\'est encore remboursé.' };
  }
  if (status === 'demo_paid') {
    return { label: 'Payé (ancienne démonstration)', tone: 'warning', note: 'Commande créée avant la mise en production du paiement réel.' };
  }
  if (status === 'paid') return { label: 'Payé', tone: 'success', note: null };
  if (status === 'processing') {
    return { label: 'Paiement en cours', tone: 'info', note: 'Validez le paiement sur votre téléphone. Nous confirmons dès réception.' };
  }
  if (status === 'refunded') return { label: 'Remboursé', tone: 'neutral', note: null };
  if (status === 'failed') return { label: 'Paiement échoué', tone: 'error', note: 'Vous pouvez réessayer depuis cette page.' };
  if (status === 'expired') return { label: 'Paiement expiré', tone: 'error', note: 'La tentative a expiré. Vous pouvez réessayer.' };
  if (status === 'cancelled') return { label: 'Paiement annulé', tone: 'neutral', note: null };
  if (orderStatus === 'cancelled') return { label: 'Sans objet', tone: 'neutral', note: 'La commande a été annulée.' };
  if (method === 'cash_on_delivery') {
    return { label: 'À payer à la livraison', tone: 'info', note: 'Le règlement se fait en espèces à la réception de la commande.' };
  }
  return { label: 'En attente de paiement', tone: 'warning', note: null };
}
