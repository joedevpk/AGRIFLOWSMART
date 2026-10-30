import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  DOC_HMAC_FIELDS, SIMULATED_CHECK_STATUS, SIMULATED_ENV_ENABLED, SIMULATED_INIT_CREATED, SIMULATED_SECRETS, signNotification, simulatedNotification,
} from './fixtures/cinetpay-simulated';

// Les Edge Functions tournent sous Deno ; les modules partagés n'utilisent que fetch / crypto / Deno.env (lu à l'appel).
interface Availability { state: string; provider: string; configured: boolean; methods: { mobile_money: boolean; card: boolean }; missing: string[] }
interface Provider {
  id: string;
  validateAmount(currency: string, amount: number): { ok: boolean; code?: string };
  initPayment(i: Record<string, unknown>): Promise<{ ok: boolean; code: string; paymentUrl?: string; paymentToken?: string; failure?: string; message: string }>;
  verifyTransaction(ref: string): Promise<{ ok: boolean; status?: string; amount?: number; currency?: string; operatorId?: string; failure?: string }>;
  verifyNotification(f: Record<string, string>, h: { get(n: string): string | null }): Promise<boolean>;
  extractReference(f: Record<string, string>): string | undefined;
}
interface Mods {
  cinetpayAvailability(env: (n: string) => string | undefined): Availability;
  selectProvider(env: (n: string) => string | undefined): { availability: Availability; provider: Provider | null };
  cinetpay: {
    verifyCinetpayHmac(secret: string, f: Record<string, string>, token: string | null): Promise<boolean>;
    validateCinetpayAmount(currency: string, amount: number): { ok: boolean; code?: string };
    loadCinetpayConfig(): unknown; isPlaceholderSecret(v: string | undefined): boolean;
  };
}
let m: Mods;
const envOf = (o: Record<string, string>) => (n: string) => o[n];
const headers = (token: string | null) => ({ get: (n: string) => (n.toLowerCase() === 'x-token' ? token : null) });

beforeAll(async () => {
  (globalThis as unknown as { Deno: unknown }).Deno = { env: { get: () => undefined } };
  const base = '../../supabase/functions/_shared/';
  const prov = (await import(/* @vite-ignore */ base + 'payments/cinetpayProvider.ts')) as unknown as Pick<Mods, 'cinetpayAvailability'>;
  const reg = (await import(/* @vite-ignore */ base + 'payments/registry.ts')) as unknown as Pick<Mods, 'selectProvider'>;
  const cp = (await import(/* @vite-ignore */ base + 'cinetpay.ts')) as unknown as Mods['cinetpay'];
  m = { ...prov, ...reg, cinetpay: cp };
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('signature de notification (x-token) — conforme à la documentation CinetPay', () => {
  const secret = SIMULATED_SECRETS.CINETPAY_SECRET_KEY;
  it('accepte une notification authentique signée selon la liste complète des 16 champs', async () => {
    const f = simulatedNotification();
    expect(await m.cinetpay.verifyCinetpayHmac(secret, f, signNotification(f))).toBe(true);
  });
  it('REGRESSION : la liste de champs inclut cpm_designation et cpm_error_message (sans eux, toute notification authentique était rejetée)', async () => {
    expect(DOC_HMAC_FIELDS.slice(-2)).toEqual(['cpm_designation', 'cpm_error_message']);
    const f = simulatedNotification({ cpm_designation: 'Désignation non vide', cpm_error_message: 'SUCCES' });
    const tokenWithAll = signNotification(f);
    const old14 = DOC_HMAC_FIELDS.slice(0, 14).map((k) => f[k] ?? '').join('');
    const { createHmac } = await import('node:crypto');
    const oldToken = createHmac('sha256', secret).update(old14).digest('hex');
    expect(oldToken).not.toBe(tokenWithAll);
    expect(await m.cinetpay.verifyCinetpayHmac(secret, f, tokenWithAll)).toBe(true);
    expect(await m.cinetpay.verifyCinetpayHmac(secret, f, oldToken)).toBe(false);
  });
  it('rejette un montant, une devise ou une référence modifiés après signature', async () => {
    const f = simulatedNotification();
    const token = signNotification(f);
    const tamperedList: Record<string, string>[] = [{ cpm_amount: '1' }, { cpm_currency: 'USD' }, { cpm_trans_id: 'AGF-PAY-AUTRE' }, { cpm_error_message: 'REFUSED' }];
    for (const tampered of tamperedList) {
      expect(await m.cinetpay.verifyCinetpayHmac(secret, { ...f, ...tampered }, token)).toBe(false);
    }
  });
  it('rejette un jeton absent, vide, mal formé ou signé avec une autre clé', async () => {
    const f = simulatedNotification();
    expect(await m.cinetpay.verifyCinetpayHmac(secret, f, null)).toBe(false);
    expect(await m.cinetpay.verifyCinetpayHmac(secret, f, '')).toBe(false);
    expect(await m.cinetpay.verifyCinetpayHmac(secret, f, 'zz')).toBe(false);
    expect(await m.cinetpay.verifyCinetpayHmac(secret, f, signNotification(f, 'autre-cle'))).toBe(false);
  });
});

describe('activation : jamais de production implicite', () => {
  it('sans aucun secret : not_configured, aucun prestataire, aucun moyen proposable', () => {
    const s = m.selectProvider(envOf({}));
    expect(s.availability.state).toBe('not_configured');
    expect(s.provider).toBeNull();
    expect(s.availability.methods).toEqual({ mobile_money: false, card: false });
    expect(s.availability.missing).toEqual(['CINETPAY_API_KEY', 'CINETPAY_SITE_ID', 'CINETPAY_SECRET_KEY']);
  });
  it('un secret manquant suffit à désactiver, et seuls les NOMS manquants sont listés', () => {
    const a = m.cinetpayAvailability(envOf({ ...SIMULATED_ENV_ENABLED, CINETPAY_SECRET_KEY: '' }));
    expect(a.state).toBe('not_configured');
    expect(a.missing).toEqual(['CINETPAY_SECRET_KEY']);
    expect(JSON.stringify(a)).not.toContain(SIMULATED_SECRETS.CINETPAY_API_KEY);
  });
  it('des valeurs factices (modèle copié tel quel) ne comptent jamais comme de vraies clés', () => {
    for (const fake of ['xxx', 'XXXXXXXX', 'changeme', 'your-api-key', '<API_KEY>', 'test', 'fake-key', 'TODO', '   ']) {
      expect(m.cinetpay.isPlaceholderSecret(fake)).toBe(true);
      expect(m.cinetpayAvailability(envOf({ ...SIMULATED_ENV_ENABLED, CINETPAY_API_KEY: fake })).state).toBe('not_configured');
    }
    expect(m.cinetpay.isPlaceholderSecret(SIMULATED_SECRETS.CINETPAY_API_KEY)).toBe(false);
  });
  it('secrets présents mais interrupteur absent ou différent de « true » : disabled (aucun nouveau paiement)', () => {
    for (const flag of [undefined, '', 'false', '1', 'yes', 'on']) {
      const env = { ...SIMULATED_ENV_ENABLED }; if (flag === undefined) delete env.PAYMENTS_ONLINE_ENABLED; else env.PAYMENTS_ONLINE_ENABLED = flag;
      const a = m.cinetpayAvailability(envOf(env));
      expect(a.state).toBe('disabled');
      expect(a.configured).toBe(true);
      expect(a.methods).toEqual({ mobile_money: false, card: false });
    }
  });
  it('enabled seulement avec secrets ET activation explicite ; la carte exige un opt-in distinct', () => {
    expect(m.cinetpayAvailability(envOf(SIMULATED_ENV_ENABLED)).methods).toEqual({ mobile_money: true, card: false });
    expect(m.cinetpayAvailability(envOf({ ...SIMULATED_ENV_ENABLED, CINETPAY_CARD_ENABLED: 'true' })).methods).toEqual({ mobile_money: true, card: true });
    expect(m.cinetpayAvailability(envOf({ ...SIMULATED_ENV_ENABLED, CINETPAY_CARD_ENABLED: 'true', PAYMENTS_ONLINE_ENABLED: 'false' })).methods.card).toBe(false);
  });
  it('prestataire inconnu : unsupported_provider ; aucun prestataire de simulation n\'existe dans le code déployé', () => {
    for (const id of ['mock', 'demo', 'fake', 'stripe']) {
      const s = m.selectProvider(envOf({ ...SIMULATED_ENV_ENABLED, PAYMENT_PROVIDER: id }));
      expect(s.availability.state).toBe('unsupported_provider');
      expect(s.provider).toBeNull();
    }
    expect(m.selectProvider(envOf(SIMULATED_ENV_ENABLED)).provider?.id).toBe('cinetpay');
  });
  it('l\'erreur de chargement de configuration ne contient aucune valeur secrète', () => {
    (globalThis as unknown as { Deno: unknown }).Deno = { env: { get: (n: string) => (n === 'CINETPAY_API_KEY' ? 'SIMULATED-only-key' : undefined) } };
    try { m.cinetpay.loadCinetpayConfig(); expect.unreachable(); } catch (e) {
      expect((e as Error).message).not.toContain('SIMULATED-only-key');
      expect((e as Error).message).toContain('CINETPAY_SITE_ID');
    } finally { (globalThis as unknown as { Deno: unknown }).Deno = { env: { get: () => undefined } }; }
  });
});

describe('règles de montant du prestataire (documentation CinetPay 1.0)', () => {
  const v = (c: string, a: number) => m.cinetpay.validateCinetpayAmount(c, a);
  it('CDF : entier, multiple de 5, entre 100 et 2 000 000', () => {
    expect(v('CDF', 1500).ok).toBe(true);
    expect(v('CDF', 100).ok).toBe(true);
    expect(v('CDF', 2_000_000).ok).toBe(true);
    expect(v('CDF', 99)).toMatchObject({ ok: false, code: 'AMOUNT_NOT_MULTIPLE_OF_5' });
    expect(v('CDF', 95)).toMatchObject({ ok: false, code: 'AMOUNT_BELOW_MIN' });
    expect(v('CDF', 2_000_005)).toMatchObject({ ok: false, code: 'AMOUNT_ABOVE_MAX' });
    expect(v('CDF', 1502)).toMatchObject({ ok: false, code: 'AMOUNT_NOT_MULTIPLE_OF_5' });
    expect(v('CDF', 1500.5)).toMatchObject({ ok: false, code: 'AMOUNT_NOT_INTEGER' });
  });
  it('USD : la restriction « multiple de 5 » ne s\'applique pas ; les décimales sont refusées par prudence (non documentées)', () => {
    expect(v('USD', 34).ok).toBe(true);
    expect(v('USD', 7).ok).toBe(true);
    expect(v('USD', 99.99)).toMatchObject({ ok: false, code: 'AMOUNT_NOT_INTEGER' });
  });
  it('refuse devise non prise en charge, montant nul, négatif ou non numérique', () => {
    expect(v('EUR', 100)).toMatchObject({ ok: false, code: 'CURRENCY_UNSUPPORTED' });
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) expect(v('CDF', bad)).toMatchObject({ ok: false, code: 'AMOUNT_INVALID' });
  });
});

describe('appels au prestataire (fetch simulé)', () => {
  const provider = () => m.selectProvider(envOf(SIMULATED_ENV_ENABLED)).provider as Provider;
  const initInput = { transactionId: 'AGF-PAY-SIM0001', amount: 1500, currency: 'CDF', description: 'Commande SIM', customerName: 'Jean', customerSurname: 'Test', notifyUrl: 'https://n.example/hook', returnUrl: 'https://r.example/ret', channel: 'mobile_money', metadata: 'p1' };
  const stubFetch = (status: number, body: unknown, capture?: (url: string, init: RequestInit) => void) => vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => { capture?.(url, init); return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }); }));

  it('initialisation : endpoint documenté, montant transmis tel quel (jamais arrondi), user-agent présent', async () => {
    let seen: { url: string; body: Record<string, unknown>; headers: Record<string, string> } | null = null;
    stubFetch(200, SIMULATED_INIT_CREATED, (url, init) => { seen = { url, body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> }; });
    const r = await provider().initPayment(initInput);
    expect(r.ok).toBe(true);
    expect(r.paymentUrl).toBe('https://checkout.simulated.example/payment/sim0001');
    expect(seen!.url).toBe('https://api-checkout.cinetpay.com/v2/payment');
    expect(seen!.body.amount).toBe(1500);
    expect(seen!.body.transaction_id).toBe('AGF-PAY-SIM0001');
    expect(seen!.body.channels).toBe('MOBILE_MONEY');
    expect(seen!.headers['User-Agent']).toMatch(/AgriFlow/);
  });
  it('initialisation : réponse invalide, code ≠ 201, 4xx, 5xx → jamais « ok »', async () => {
    stubFetch(200, '<html>pas du json</html>'); expect(await provider().initPayment(initInput)).toMatchObject({ ok: false, failure: 'invalid_response' });
    stubFetch(200, { code: '624', message: 'ERREUR' }); expect(await provider().initPayment(initInput)).toMatchObject({ ok: false, code: '624' });
    stubFetch(200, { code: '201', message: 'CREATED', data: {} }); expect((await provider().initPayment(initInput)).paymentUrl).toBeUndefined();
    stubFetch(400, { code: '608', message: 'MINIMUM_REQUIRED_FIELDS' }); expect(await provider().initPayment(initInput)).toMatchObject({ ok: false, failure: 'http_4xx' });
    stubFetch(503, { message: 'down' }); expect(await provider().initPayment(initInput)).toMatchObject({ ok: false, failure: 'http_5xx' });
  });
  it('initialisation : jamais de nouvelle tentative automatique (pas de double initiation)', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 503 })); vi.stubGlobal('fetch', f);
    await provider().initPayment(initInput);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('vérification : statut, montant et devise lus chez le prestataire', async () => {
    stubFetch(200, SIMULATED_CHECK_STATUS('ACCEPTED', '1500', 'CDF'));
    expect(await provider().verifyTransaction('AGF-PAY-SIM0001')).toMatchObject({ ok: true, status: 'ACCEPTED', amount: 1500, currency: 'CDF' });
    stubFetch(200, SIMULATED_CHECK_STATUS('REFUSED')); expect((await provider().verifyTransaction('x')).status).toBe('REFUSED');
    stubFetch(200, SIMULATED_CHECK_STATUS('WAITING_FOR_CUSTOMER')); expect((await provider().verifyTransaction('x')).status).toBe('WAITING_FOR_CUSTOMER');
    stubFetch(200, SIMULATED_CHECK_STATUS('CANCELLED')); expect((await provider().verifyTransaction('x')).status).toBe('CANCELLED');
  });
  it('vérification : réponse sans statut ou erreur prestataire → pas de statut (rien ne sera appliqué)', async () => {
    stubFetch(200, { code: '00', message: 'x', data: {} }); expect((await provider().verifyTransaction('x')).status).toBeUndefined();
    stubFetch(404, { code: '627' }); expect(await provider().verifyTransaction('x')).toMatchObject({ ok: false, failure: 'http_4xx' });
  });
  it('les secrets ne figurent que dans le corps de la requête au prestataire, jamais dans l\'URL', async () => {
    let seenUrl = ''; stubFetch(200, SIMULATED_INIT_CREATED, (url) => { seenUrl = url; });
    await provider().initPayment(initInput);
    expect(seenUrl).not.toContain(SIMULATED_SECRETS.CINETPAY_API_KEY);
    expect(seenUrl).not.toContain(SIMULATED_SECRETS.CINETPAY_SECRET_KEY);
  });
  it('extrait la référence de la notification (cpm_trans_id)', () => {
    expect(provider().extractReference(simulatedNotification())).toBe('AGF-PAY-SIM0001');
    expect(provider().extractReference({})).toBeUndefined();
    expect(provider().verifyNotification).toBeTypeOf('function');
    void headers; // utilisé par les tests de gestionnaires
  });
});
