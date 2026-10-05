import { createClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Client Supabase utilisant la clé `service_role`. NE JAMAIS exposer cette clé
 * au frontend : elle contourne RLS et n'existe que dans les secrets Supabase de
 * cette Edge Function (configurés via `supabase secrets set`).
 */
export function supabaseAdmin() {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants dans les secrets de la fonction.');
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Client Supabase agissant AU NOM de l'utilisateur appelant (respecte RLS) :
 * utilisé pour authentifier la requête et lire l'identité de l'utilisateur, sans
 * jamais lui accorder plus que ce que RLS autorise déjà côté client.
 */
export function supabaseAsUser(authorizationHeader: string | null) {
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anonKey) {
    throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY manquants dans les secrets de la fonction.');
  }
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: authorizationHeader ? { Authorization: authorizationHeader } : {} },
  });
}
