/**
 * Interface commune d'un prestataire de paiement. Le métier (commandes, commissions, idempotence, statuts) vit en base
 * (RPC `payment_*`) et dans `handlers.ts` : un prestataire n'expose ici QUE les appels réseau et la vérification d'authenticité.
 * Ajouter un prestataire = implémenter cette interface + l'enregistrer dans `registry.ts`. Rien d'autre n'est à changer.
 *
 * Remboursement : volontairement absent. Aucune API de remboursement n'est documentée pour l'API CinetPay 1.0 utilisée ici ;
 * le cycle de remboursement reste manuel (fonction `payment-refund` → RPC `admin_process_refund`).
 */
import type { ExternalFailure } from '../http.ts';

export type EnvReader = (name: string) => string | undefined;

/**
 * - not_configured : secrets du prestataire absents ou factices → AUCUN appel prestataire, paiement en ligne indisponible.
 * - disabled       : secrets présents mais interrupteur d'activation (PAYMENTS_ONLINE_ENABLED) ≠ « true » → pas de NOUVEAU paiement ;
 *                    les notifications et vérifications de paiements déjà initiés restent traitées.
 * - unsupported_provider : PAYMENT_PROVIDER inconnu.
 * - enabled        : secrets présents ET activation explicite.
 */
export type AvailabilityState = 'not_configured' | 'disabled' | 'unsupported_provider' | 'enabled';

export interface Availability {
  state: AvailabilityState;
  provider: string;
  /** Les secrets sont présents (même si l'activation est coupée) : permet de traiter les notifications en cours. */
  configured: boolean;
  /** Moyens réellement proposables côté serveur (vide tant que l'état n'est pas `enabled`). */
  methods: { mobile_money: boolean; card: boolean };
  /** Noms (jamais valeurs) des secrets manquants — réservé aux journaux serveur, jamais renvoyé au navigateur. */
  missing: string[];
}

export type AmountCheck =
  | { ok: true }
  | { ok: false; code: string; message: string };

export interface InitInput {
  transactionId: string;
  amount: number;
  currency: string;
  description: string;
  customerName: string;
  customerSurname: string;
  customerEmail?: string;
  customerPhoneNumber?: string;
  notifyUrl: string;
  returnUrl: string;
  channel: 'mobile_money' | 'card';
  metadata?: string;
}

export interface InitResult {
  ok: boolean;
  code: string;
  message: string;
  paymentToken?: string;
  paymentUrl?: string;
  raw: unknown;
  failure?: ExternalFailure;
}

export interface VerifyResult {
  ok: boolean;
  code: string;
  message: string;
  /** Statut brut du prestataire (transmis tel quel à la base, qui décide). */
  status?: string;
  amount?: number;
  currency?: string;
  paymentMethod?: string;
  operatorId?: string;
  raw: unknown;
  failure?: ExternalFailure;
}

export interface PaymentProvider {
  readonly id: string;
  validateAmount(currency: string, amount: number): AmountCheck;
  initPayment(input: InitInput): Promise<InitResult>;
  /** Seule source de vérité du statut / montant / devise réels (appel serveur à serveur). */
  verifyTransaction(reference: string): Promise<VerifyResult>;
  /** Authenticité d'une notification (signature). `false` → rejet sans aucune écriture. */
  verifyNotification(fields: Record<string, string>, headers: { get(name: string): string | null }): Promise<boolean>;
  /** Référence de transaction contenue dans une notification (notre `internal_reference`). */
  extractReference(fields: Record<string, string>): string | undefined;
}

export interface ProviderSelection {
  availability: Availability;
  /** `null` si le prestataire n'est pas configuré / inconnu : aucun appel réseau possible. */
  provider: PaymentProvider | null;
}
