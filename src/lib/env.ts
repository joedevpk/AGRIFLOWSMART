/**
 * Validation des variables PUBLIQUES de build (Vite) au démarrage.
 * Seules `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` sont obligatoires. Aucune valeur n'est jamais affichée ni journalisée :
 * on ne journalise que le NOM des variables en cause.
 *
 * Tout ce qui commence par `VITE_` est embarqué dans le JavaScript public. Une variable `VITE_*` qui ressemble à un secret
 * (service_role, CinetPay, mot de passe…) ou une clé « anon » qui est en réalité une clé service_role bloque le démarrage.
 */
export interface EnvCheck {
  ok: boolean;
  /** Variables obligatoires absentes ou vides. */
  missing: string[];
  /** Variables présentes mais invalides (URL illisible, valeur d'exemple…). */
  invalid: string[];
  /** Variables `VITE_*` qui ressemblent à des secrets : ne doivent jamais être publiques. */
  forbidden: string[];
}

export const REQUIRED_PUBLIC_ENV = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'] as const;
const FORBIDDEN_NAME = /(SERVICE_ROLE|SECRET|CINETPAY|PASSWORD|PRIVATE|CRON_)/i;
const PLACEHOLDER = /^(your[-_ ]|xxx|changeme|todo|<)/i;

/** Lit le rôle déclaré dans le payload d'un JWT Supabase (sans vérifier la signature : simple garde-fou). */
export function jwtRole(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof atob === 'function' ? atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '=')) : Buffer.from(b64, 'base64').toString('utf8');
    const role = (JSON.parse(json) as { role?: unknown }).role;
    return typeof role === 'string' ? role : null;
  } catch {
    return null;
  }
}

export function checkPublicEnv(env: Record<string, unknown> = import.meta.env as Record<string, unknown>): EnvCheck {
  const missing: string[] = [];
  const invalid: string[] = [];
  const forbidden = Object.keys(env).filter((k) => k.startsWith('VITE_') && FORBIDDEN_NAME.test(k) && String(env[k] ?? '').length > 0);

  for (const name of REQUIRED_PUBLIC_ENV) {
    const value = typeof env[name] === 'string' ? (env[name] as string).trim() : '';
    if (!value) { missing.push(name); continue; }
    if (PLACEHOLDER.test(value)) { invalid.push(name); continue; }
    if (name === 'VITE_SUPABASE_URL') {
      try {
        const u = new URL(value);
        if (u.protocol !== 'https:' && u.protocol !== 'http:') invalid.push(name);
      } catch { invalid.push(name); }
    }
    if (name === 'VITE_SUPABASE_ANON_KEY' && jwtRole(value) === 'service_role') forbidden.push(name);
  }
  return { ok: missing.length === 0 && invalid.length === 0 && forbidden.length === 0, missing, invalid, forbidden };
}

export const ENV_STATUS: EnvCheck = checkPublicEnv();
