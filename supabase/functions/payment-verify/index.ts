// Edge Function : payment-verify
//
// Appelée par la page /payment/result/:reference (et en polling de secours
// limité) pour interroger l'état RÉEL d'une transaction auprès de CinetPay,
// indépendamment du webhook (qui peut être retardé). N'importe qui ne peut pas
// vérifier n'importe quelle référence : seul l'acheteur de la commande (ou un
// producteur/admin concerné, via RLS sur `payments`) peut le faire.

import { handleVerify } from '../_shared/payments/handlers.ts';
import { realDeps } from '../_shared/payments/deps.ts';

// Enveloppe mince : toute la logique (et ses tests) est dans _shared/payments/handlers.ts.
Deno.serve((req) => handleVerify(req, realDeps));
