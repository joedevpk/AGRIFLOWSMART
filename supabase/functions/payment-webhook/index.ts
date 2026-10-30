// Edge Function : payment-webhook
//
// URL de notification CinetPay (`notify_url`). CinetPay appelle cette URL en
// POST (form-urlencoded) à chaque changement de statut d'une transaction, et en
// GET pour un simple ping de disponibilité (doit répondre 200).
//
// Étapes (voir docs.cinetpay.com/api/1.0-fr/checkout/notification + hmac) :
//   1. Vérifier l'en-tête `x-token` (HMAC SHA-256 avec la clé secrète marchand).
//   2. NE JAMAIS faire confiance au corps du webhook pour le montant/statut :
//      rappeler /v2/payment/check pour obtenir la valeur réelle.
//   3. Appliquer le résultat de façon idempotente via `payment_apply_result`
//      (service_role) — qui revérifie elle-même montant/devise/commande.
//   4. Répondre 200 pour tout résultat DÉFINITIF (accepté, refusé, signature invalide, montant incohérent…) afin
//      d'éviter des réessais inutiles ; répondre 503 uniquement pour une panne TEMPORAIRE (timeout / 5xx du
//      prestataire, erreur base) afin que le prestataire puisse renvoyer la notification. Le comportement exact
//      de réessai de CinetPay n'a pas été vérifié ici : la page de résultat et la tâche de réconciliation du cron
//      (order-confirmation-cron) rattrapent de toute façon un webhook perdu.

import { handleWebhook } from '../_shared/payments/handlers.ts';
import { realDeps } from '../_shared/payments/deps.ts';

// Enveloppe mince : toute la logique (et ses tests) est dans _shared/payments/handlers.ts.
Deno.serve((req) => handleWebhook(req, realDeps));
