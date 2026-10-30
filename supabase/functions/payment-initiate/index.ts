// Edge Function : payment-initiate
//
// Reçoit uniquement { order_id, payment_method, idempotency_key, phone_number? }.
// Aucun montant, aucune devise n'est accepté depuis le client : tout est relu
// depuis la commande en base via la RPC `payment_initiate_begin` (qui applique
// aussi l'idempotence : un même `idempotency_key`/tentative en cours renvoie la
// même URL de paiement plutôt que d'en créer une nouvelle).
//
// Secrets requis (supabase secrets set) :
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (fournis par la
//   plateforme), CINETPAY_API_KEY, CINETPAY_SITE_ID, CINETPAY_SECRET_KEY,
//   CINETPAY_BASE_URL (optionnel), FRONTEND_URL.

import { handleInitiate } from '../_shared/payments/handlers.ts';
import { realDeps } from '../_shared/payments/deps.ts';

// Enveloppe mince : toute la logique (et ses tests) est dans _shared/payments/handlers.ts.
Deno.serve((req) => handleInitiate(req, realDeps));
