// Dépendances RÉELLES des fonctions de paiement (Deno + Supabase). Non importé par les tests, qui injectent des doubles.
import { supabaseAdmin, supabaseAsUser } from '../supabaseAdmin.ts';
import { logEvent } from '../http.ts';
import { selectProvider } from './registry.ts';
import type { AdminClient, HandlerDeps, UserClient } from './handlers.ts';

export const realDeps: HandlerDeps = {
  env: (name) => Deno.env.get(name),
  select: selectProvider,
  admin: () => supabaseAdmin() as unknown as AdminClient,
  userClient: (authorization) => supabaseAsUser(authorization) as unknown as UserClient,
  log: logEvent,
};
