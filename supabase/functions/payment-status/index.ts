// Edge Function : payment-status
//
// Indique au checkout si le paiement en ligne est RÉELLEMENT activé côté serveur (secrets présents ET activation explicite).
// Ne renvoie jamais de configuration : uniquement { state, online_enabled, methods }. Sans cette confirmation, le frontend
// n'offre pas de moyen de paiement en ligne et affiche « le paiement en ligne n'est pas encore activé ».

import { handleStatus } from '../_shared/payments/handlers.ts';
import { realDeps } from '../_shared/payments/deps.ts';

Deno.serve((req) => handleStatus(req, realDeps));
