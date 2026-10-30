import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

interface Checks {
  checkEnv(env: Record<string, string | undefined>): string[];
  scanBundle(dir: string): string[];
  checkNativeConfig(root: string): string[];
}
let c: Checks;
beforeAll(async () => {
  const script = '../../scripts/mobile-checks.mjs'; // chemin en variable : script Node (.mjs) sans déclaration de types
  c = (await import(/* @vite-ignore */ script)) as unknown as Checks;
});

const jwt = (role: string) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.sig12345`;
const GOOD = { VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_ANON_KEY: jwt('anon'), VITE_PUBLIC_WEB_URL: 'https://agriflow.example.com' };
const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'agri-mobile-')); dirs.push(d); return d; };
afterEach(() => { while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true }); });

describe('contrôle de l\'environnement du build mobile', () => {
  it('accepte une configuration publique valide', () => { expect(c.checkEnv(GOOD)).toEqual([]); });
  it('refuse l\'absence de variables obligatoires', () => {
    const p = c.checkEnv({});
    expect(p).toHaveLength(3);
  });
  it('refuse une clé service_role dans l\'application — sans jamais afficher la valeur', () => {
    const key = jwt('service_role');
    const p = c.checkEnv({ ...GOOD, VITE_SUPABASE_ANON_KEY: key });
    expect(p.join(' ')).toMatch(/service_role/);
    expect(p.join(' ')).not.toContain(key);
  });
  it('refuse les adresses locales ou de test et le http', () => {
    for (const url of ['https://localhost', 'https://192.168.1.10', 'https://10.0.0.2', 'https://127.0.0.1', 'https://dev.local', 'http://abc.supabase.co']) {
      expect(c.checkEnv({ ...GOOD, VITE_SUPABASE_URL: url }).length, url).toBeGreaterThan(0);
      expect(c.checkEnv({ ...GOOD, VITE_PUBLIC_WEB_URL: url }).length, url).toBeGreaterThan(0);
    }
  });
  it('refuse tout VITE_* au nom de secret (public par construction)', () => {
    for (const name of ['VITE_CINETPAY_SECRET_KEY', 'VITE_SERVICE_ROLE_KEY', 'VITE_DB_PASSWORD', 'VITE_PRIVATE_TOKEN', 'VITE_PAYMENT_API_KEY']) {
      const p = c.checkEnv({ ...GOOD, [name]: 'x' });
      expect(p.join(' ')).toContain(name);
    }
    expect(c.checkEnv({ ...GOOD, VITE_CONTACT_EMAIL: 'a@b.cd' })).toEqual([]);
  });
});

describe('analyse du bundle embarqué', () => {
  it('bundle propre : aucun problème', () => {
    const d = tmp(); mkdirSync(join(d, 'assets'));
    writeFileSync(join(d, 'index.html'), '<html></html>');
    writeFileSync(join(d, 'assets', 'app.js'), `const url="https://abc.supabase.co";const k="${jwt('anon')}";`);
    expect(c.scanBundle(d)).toEqual([]);
  });
  it('détecte secrets et jetons service_role', () => {
    const d = tmp(); mkdirSync(join(d, 'assets'));
    writeFileSync(join(d, 'assets', 'a.js'), `x("SUPABASE_SERVICE_ROLE_KEY")`);
    writeFileSync(join(d, 'assets', 'b.js'), `y("CINETPAY_SECRET_KEY")`);
    writeFileSync(join(d, 'assets', 'c.js'), `z("${jwt('service_role')}")`);
    writeFileSync(join(d, 'assets', 'd.js'), `k("sk_live_abcdefghijklmnop")`);
    const p = c.scanBundle(d).join('\n');
    for (const f of ['a.js', 'b.js', 'c.js', 'd.js']) expect(p).toContain(f);
    expect(p).not.toContain('abcdefghijklmnop');
  });
  it('dossier absent : message clair', () => { expect(c.scanBundle(join(tmpdir(), 'inexistant-agri')).join('')).toMatch(/n'existe pas/); });
});

describe('configuration native embarquée', () => {
  const write = (root: string, platform: 'android' | 'ios', cfg: unknown) => {
    const dir = platform === 'android' ? join(root, 'android/app/src/main/assets') : join(root, 'ios/App/App');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'capacitor.config.json'), JSON.stringify(cfg));
  };
  it('configuration de production saine', () => {
    const r = tmp(); write(r, 'android', { appId: 'cd.agriflow.rdc', webDir: 'dist' }); write(r, 'ios', { appId: 'cd.agriflow.rdc', webDir: 'dist' });
    expect(c.checkNativeConfig(r)).toEqual([]);
  });
  it('détecte une URL de développement, le clair et la navigation externe laissés par erreur', () => {
    const r = tmp();
    write(r, 'android', { server: { url: 'http://192.168.1.5:5173', cleartext: true, allowNavigation: ['*.evil.example'] }, android: { allowMixedContent: true } });
    const p = c.checkNativeConfig(r).join('\n');
    expect(p).toMatch(/server\.url/); expect(p).toMatch(/cleartext/); expect(p).toMatch(/allowNavigation/); expect(p).toMatch(/mixte/);
  });
  it('aucune configuration native : demande de synchroniser', () => { expect(c.checkNativeConfig(tmp()).join('')).toMatch(/cap sync/); });
});
