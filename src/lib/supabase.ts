import { createClient } from '@supabase/supabase-js';
import { ENV_STATUS } from '@/lib/env';

// Si la configuration publique est incomplète, `main.tsx` n'affiche PAS l'application (page « Configuration incomplète »).
// Le client reçoit alors des valeurs inertes pour que l'import ne lève pas d'exception avant l'affichage de cette page.
const supabaseUrl = ENV_STATUS.ok ? (import.meta.env.VITE_SUPABASE_URL as string).trim() : 'http://localhost:54321';
const supabaseAnonKey = ENV_STATUS.ok ? (import.meta.env.VITE_SUPABASE_ANON_KEY as string).trim() : 'configuration-incomplete';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: ENV_STATUS.ok,
    autoRefreshToken: ENV_STATUS.ok,
    detectSessionInUrl: ENV_STATUS.ok,
  },
});
