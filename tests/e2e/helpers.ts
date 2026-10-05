import { expect, test, type Page } from '@playwright/test';

/** Hôtes de production connus : les parcours qui écrivent refusent de s'y exécuter (E2E_FORBIDDEN_HOSTS="app.agriflow.cd,www.agriflow.cd"). */
export function assertSafeTarget(baseURL: string | undefined): void {
  const forbidden = (process.env.E2E_FORBIDDEN_HOSTS ?? '').split(',').map((h) => h.trim()).filter(Boolean);
  const host = new URL(baseURL ?? 'http://localhost').hostname;
  if (forbidden.includes(host)) throw new Error(`Refus : ${host} est listé comme PRODUCTION (E2E_FORBIDDEN_HOSTS).`);
}

export const writesAllowed = process.env.E2E_ALLOW_WRITES === '1';

export function accounts() {
  return {
    buyer: { email: process.env.E2E_BUYER_EMAIL, password: process.env.E2E_BUYER_PASSWORD },
    producer: { email: process.env.E2E_PRODUCER_EMAIL, password: process.env.E2E_PRODUCER_PASSWORD },
    admin: { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD },
  };
}

export function requireAccount(who: 'buyer' | 'producer' | 'admin') {
  const a = accounts()[who];
  test.skip(!a.email || !a.password, `Compte de test ${who} non configuré (E2E_${who.toUpperCase()}_EMAIL / _PASSWORD)`);
  return { email: a.email as string, password: a.password as string };
}

export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/e-?mail/i).fill(email);
  await page.getByLabel(/mot de passe/i).first().fill(password);
  await page.getByRole('button', { name: /se connecter|connexion/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Écran blanc / exception technique brute : jamais acceptable. */
export async function expectNoBrokenScreen(page: Page): Promise<void> {
  await expect(page.locator('body')).not.toContainText(/TypeError|undefined is not|Cannot read properties|stack trace/i);
  await expect(page.locator('#root')).not.toBeEmpty();
}

/** Appel RPC serveur avec la clé service_role d'un STAGING (secret CI, jamais dans le frontend) — simule le cron. */
export async function rpcAsService(name: string, body: Record<string, unknown> = {}): Promise<unknown> {
  const url = process.env.E2E_SUPABASE_URL;
  const key = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
  test.skip(!url || !key, 'E2E_SUPABASE_URL / E2E_SUPABASE_SERVICE_ROLE_KEY (staging) non configurés');
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: key as string, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  expect(res.ok, `RPC ${name} : HTTP ${res.status}`).toBe(true);
  return res.json();
}
