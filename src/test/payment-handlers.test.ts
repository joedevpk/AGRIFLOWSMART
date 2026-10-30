import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SIMULATED_CHECK_ACCEPTED, SIMULATED_CHECK_STATUS, SIMULATED_ENV_ENABLED, SIMULATED_SECRETS, signNotification, simulatedNotification } from './fixtures/cinetpay-simulated';

// ---- Types locaux minimaux (les modules Deno ne sont pas typés par la config frontend) ----
type Obj = Record<string, unknown>;
interface Selection { availability: { state: string; provider: string; configured: boolean; methods: { mobile_money: boolean; card: boolean }; missing: string[] }; provider: unknown }
interface Deps { env: (n: string) => string | undefined; select: (e: (n: string) => string | undefined) => Selection; admin: () => unknown; userClient: (a: string | null) => unknown; log: (...a: unknown[]) => void }
interface Handlers {
  handleStatus(r: Request, d: Deps): Promise<Response>; handleInitiate(r: Request, d: Deps): Promise<Response>;
  handleWebhook(r: Request, d: Deps): Promise<Response>; handleVerify(r: Request, d: Deps): Promise<Response>;
}
let H: Handlers;
let selectProvider: (e: (n: string) => string | undefined) => Selection;

beforeAll(async () => {
  (globalThis as unknown as { Deno: unknown }).Deno = { env: { get: () => undefined } };
  const base = '../../supabase/functions/_shared/payments/';
  H = (await import(/* @vite-ignore */ base + 'handlers.ts')) as unknown as Handlers;
  selectProvider = ((await import(/* @vite-ignore */ base + 'registry.ts')) as unknown as { selectProvider: typeof selectProvider }).selectProvider;
});
afterEach(() => { vi.unstubAllGlobals(); });

// ---- Doubles SIMULÉS (aucun n'existe dans le code déployé) ----
const AV = (state: string, methods = { mobile_money: state === 'enabled', card: false }, configured = state !== 'not_configured') =>
  ({ state, provider: 'simulated', configured, methods, missing: state === 'not_configured' ? ['CINETPAY_API_KEY'] : [] });

function simulatedProvider(over: Obj = {}) {
  return {
    id: 'simulated',
    validateAmount: vi.fn(() => ({ ok: true })),
    initPayment: vi.fn(async () => ({ ok: true, code: '201', message: '', paymentUrl: 'https://pay.simulated.example/p1', paymentToken: 'SIM-TOKEN', raw: { simulated: true } })),
    verifyTransaction: vi.fn(async () => ({ ok: true, code: '00', message: '', status: 'ACCEPTED', amount: 1500, currency: 'CDF', operatorId: 'SIM-OP', raw: { simulated: true } })),
    verifyNotification: vi.fn(async () => true),
    extractReference: (f: Record<string, string>) => f['cpm_trans_id'] || undefined,
    ...over,
  };
}

interface Rig { deps: Deps; admin: { name: string; args: Obj }[]; user: { name: string; args: Obj }[]; logs: unknown[][]; provider: ReturnType<typeof simulatedProvider> | null }
function rig(o: { state?: string; methods?: { mobile_money: boolean; card: boolean }; provider?: ReturnType<typeof simulatedProvider> | null; env?: Record<string, string>;
  adminRpc?: (name: string, args: Obj) => { data: unknown; error: { message: string } | null }; userRpc?: (name: string, args: Obj) => { data: unknown; error: { message: string } | null };
  user?: { id: string } | null; payment?: Obj | null; paymentError?: boolean } = {}): Rig {
  const state = o.state ?? 'enabled';
  const provider = o.provider === undefined ? (state === 'not_configured' ? null : simulatedProvider()) : o.provider;
  const r: Rig = { deps: null as unknown as Deps, admin: [], user: [], logs: [], provider };
  const env = o.env ?? { FRONTEND_URL: 'https://front.simulated.example', SUPABASE_URL: 'https://sb.simulated.example' };
  r.deps = {
    env: (n) => env[n],
    select: () => ({ availability: AV(state, o.methods), provider }),
    admin: () => ({ rpc: async (name: string, args: Obj) => { r.admin.push({ name, args }); return o.adminRpc ? o.adminRpc(name, args) : { data: { ok: true, status: 'paid' }, error: null }; } }),
    userClient: () => ({
      auth: { getUser: async () => ({ data: { user: o.user === undefined ? { id: 'buyer-1' } : o.user }, error: null }) },
      rpc: async (name: string, args: Obj) => { r.user.push({ name, args }); return o.userRpc ? o.userRpc(name, args) : { data: null, error: null }; },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: o.payment === undefined ? null : o.payment, error: o.paymentError ? { message: 'x' } : null }) }) }) }),
    }),
    log: (...a) => { r.logs.push(a); },
  };
  return r;
}
const post = (url: string, body: unknown, headers: Record<string, string> = {}) => new Request(`https://edge.example/${url}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const auth = { Authorization: 'Bearer simulated-user-jwt' };
const j = async (res: Response): Promise<Obj> => (await res.json()) as Obj;
const BEGIN_OK = { ok: true, payment_id: 'pay-1', internal_reference: 'AGF-PAY-SIM0001', order_number: 'AF-001', amount: 1500, currency: 'CDF', buyer_name: 'Jean Test', buyer_email: 'j@sim.example', buyer_phone: '+243000000000', already_initiated: false };
const initBody = { order_id: 'o1', payment_method: 'mobile_money', idempotency_key: 'k1' };
const secrets = Object.values(SIMULATED_SECRETS);
const noSecretsIn = (x: unknown) => { const s = JSON.stringify(x); for (const v of secrets) expect(s).not.toContain(v); };

describe('payment-status : état d\'activation public, sans configuration', () => {
  it('non configuré : online_enabled=false, aucun nom de secret ni configuration dans la réponse', async () => {
    const res = await H.handleStatus(new Request('https://e/x', { method: 'POST' }), rig({ state: 'not_configured' }).deps);
    const b = await j(res);
    expect(b).toMatchObject({ ok: true, state: 'not_configured', online_enabled: false, methods: { mobile_money: false, card: false } });
    expect(JSON.stringify(b)).not.toMatch(/CINETPAY|missing|secret/i);
  });
  it('activé : online_enabled=true ; désactivé : false ; méthode non autorisée refusée', async () => {
    expect((await j(await H.handleStatus(new Request('https://e/x', { method: 'GET' }), rig({ state: 'enabled' }).deps))).online_enabled).toBe(true);
    expect((await j(await H.handleStatus(new Request('https://e/x', { method: 'GET' }), rig({ state: 'disabled' }).deps))).online_enabled).toBe(false);
    expect((await H.handleStatus(new Request('https://e/x', { method: 'DELETE' }), rig().deps)).status).toBe(405);
  });
});

describe('payment-initiate', () => {
  it('sans authentification : 401, rien n\'est appelé', async () => {
    const r = rig();
    expect((await H.handleInitiate(post('payment-initiate', initBody), r.deps)).status).toBe(401);
    expect(r.user).toHaveLength(0); expect(r.admin).toHaveLength(0);
  });
  it('paiement en ligne NON ACTIVÉ (secrets absents) : 503 PAYMENTS_NOT_ACTIVATED, AUCUNE tentative de paiement créée, aucun appel prestataire', async () => {
    const r = rig({ state: 'not_configured' });
    const res = await H.handleInitiate(post('payment-initiate', initBody, auth), r.deps);
    expect(res.status).toBe(503);
    expect(await j(res)).toMatchObject({ ok: false, code: 'PAYMENTS_NOT_ACTIVATED' });
    expect(r.user.find((c) => c.name === 'payment_initiate_begin')).toBeUndefined();
    expect(r.admin).toHaveLength(0);
  });
  it('secrets présents mais activation coupée : même refus, avant toute écriture', async () => {
    const r = rig({ state: 'disabled' });
    const res = await H.handleInitiate(post('payment-initiate', initBody, auth), r.deps);
    expect(await j(res)).toMatchObject({ code: 'PAYMENTS_NOT_ACTIVATED' });
    expect(r.user).toHaveLength(0);
  });
  it('carte sans opt-in explicite : METHOD_UNAVAILABLE, aucune écriture', async () => {
    const r = rig({ methods: { mobile_money: true, card: false } });
    const res = await H.handleInitiate(post('payment-initiate', { ...initBody, payment_method: 'card' }, auth), r.deps);
    expect(await j(res)).toMatchObject({ code: 'METHOD_UNAVAILABLE' });
    expect(r.user).toHaveLength(0);
  });
  it('requêtes invalides : JSON illisible, champs manquants, méthode inconnue → 400', async () => {
    const r = rig();
    expect((await H.handleInitiate(new Request('https://e/x', { method: 'POST', headers: auth, body: '{pas du json' }), r.deps)).status).toBe(400);
    expect((await H.handleInitiate(post('x', { order_id: 'o1' }, auth), r.deps)).status).toBe(400);
    expect(await j(await H.handleInitiate(post('x', { ...initBody, payment_method: 'bitcoin' }, auth), r.deps))).toMatchObject({ code: 'INVALID_PAYMENT_METHOD' });
    expect(r.user).toHaveLength(0);
  });
  it('session invalide : 401 et aucune tentative créée', async () => {
    const r = rig({ user: null });
    expect((await H.handleInitiate(post('x', initBody, auth), r.deps)).status).toBe(401);
    expect(r.user).toHaveLength(0);
  });
  it('montant et devise viennent de la base : ceux envoyés par le navigateur sont ignorés', async () => {
    const r = rig({ userRpc: () => ({ data: BEGIN_OK, error: null }) });
    const res = await H.handleInitiate(post('x', { ...initBody, amount: 1, currency: 'USD', status: 'paid', total: 1 }, auth), r.deps);
    expect(await j(res)).toMatchObject({ ok: true, replayed: false, checkout_url: 'https://pay.simulated.example/p1', internal_reference: 'AGF-PAY-SIM0001' });
    const begin = r.user.find((c) => c.name === 'payment_initiate_begin')!;
    expect(Object.keys(begin.args).sort()).toEqual(['p_idempotency_key', 'p_order_id', 'p_payment_method', 'p_phone_number']);
    expect(r.provider!.initPayment).toHaveBeenCalledWith(expect.objectContaining({ amount: 1500, currency: 'CDF', transactionId: 'AGF-PAY-SIM0001', channel: 'mobile_money' }));
    expect(r.admin.find((c) => c.name === 'payment_provider_attach')!.args).toMatchObject({ p_payment_id: 'pay-1', p_provider_transaction_id: 'SIM-TOKEN' });
  });
  it('URLs de retour et de notification construites côté serveur', async () => {
    const r = rig({ userRpc: () => ({ data: BEGIN_OK, error: null }) });
    await H.handleInitiate(post('x', initBody, auth), r.deps);
    expect(r.provider!.initPayment).toHaveBeenCalledWith(expect.objectContaining({
      notifyUrl: 'https://sb.simulated.example/functions/v1/payment-webhook', returnUrl: 'https://front.simulated.example/payment/result/AGF-PAY-SIM0001' }));
  });
  it('rejeu (double clic) : même URL renvoyée sans rappeler le prestataire', async () => {
    const r = rig({ userRpc: () => ({ data: { ...BEGIN_OK, already_initiated: true, checkout_url: 'https://pay.simulated.example/old' }, error: null }) });
    const b = await j(await H.handleInitiate(post('x', initBody, auth), r.deps));
    expect(b).toMatchObject({ ok: true, replayed: true, checkout_url: 'https://pay.simulated.example/old' });
    expect(r.provider!.initPayment).not.toHaveBeenCalled();
  });
  it('initiation déjà en cours : 409 ; refus métier (déjà payée…) : 400 avec le code', async () => {
    expect((await H.handleInitiate(post('x', initBody, auth), rig({ userRpc: () => ({ data: { ok: false, code: 'INITIATION_IN_PROGRESS' }, error: null }) }).deps)).status).toBe(409);
    const res = await H.handleInitiate(post('x', initBody, auth), rig({ userRpc: () => ({ data: { ok: false, code: 'ALREADY_PAID' }, error: null }) }).deps);
    expect(res.status).toBe(400); expect(await j(res)).toMatchObject({ code: 'ALREADY_PAID' });
  });
  it('erreur base lors de l\'ouverture : 503 sans fuite de détail', async () => {
    const res = await H.handleInitiate(post('x', initBody, auth), rig({ userRpc: () => ({ data: null, error: { message: 'relation "payments" secret detail' } }) }).deps);
    expect(res.status).toBe(503);
    expect(JSON.stringify(await j(res))).not.toContain('relation');
  });
  it('montant refusé par les règles du prestataire : 422, bail libéré, AUCUN appel prestataire (jamais d\'arrondi silencieux)', async () => {
    const p = simulatedProvider({ validateAmount: vi.fn(() => ({ ok: false, code: 'AMOUNT_NOT_MULTIPLE_OF_5', message: 'multiple de 5' })) });
    const r = rig({ provider: p, userRpc: () => ({ data: { ...BEGIN_OK, amount: 1502 }, error: null }) });
    const res = await H.handleInitiate(post('x', initBody, auth), r.deps);
    expect(res.status).toBe(422);
    expect(await j(res)).toMatchObject({ code: 'AMOUNT_NOT_SUPPORTED', reason: 'AMOUNT_NOT_MULTIPLE_OF_5' });
    expect(p.initPayment).not.toHaveBeenCalled();
    expect(r.admin.find((c) => c.name === 'payment_initiation_release')!.args).toMatchObject({ p_payment_id: 'pay-1' });
  });
  it('échec du prestataire : temporaire → 503 PROVIDER_UNAVAILABLE, définitif → 502 PROVIDER_ERROR ; bail libéré dans les deux cas', async () => {
    for (const [failure, status, code] of [['timeout', 503, 'PROVIDER_UNAVAILABLE'], ['http_5xx', 503, 'PROVIDER_UNAVAILABLE'], ['http_4xx', 502, 'PROVIDER_ERROR'], ['invalid_response', 502, 'PROVIDER_ERROR']] as const) {
      const p = simulatedProvider({ initPayment: vi.fn(async () => ({ ok: false, code: '', message: '', raw: {}, failure })) });
      const r = rig({ provider: p, userRpc: () => ({ data: BEGIN_OK, error: null }) });
      const res = await H.handleInitiate(post('x', initBody, auth), r.deps);
      expect(res.status).toBe(status); expect(await j(res)).toMatchObject({ code });
      expect(r.admin.some((c) => c.name === 'payment_initiation_release')).toBe(true);
    }
  });
  it('réponse prestataire sans URL de paiement : jamais présentée comme un succès', async () => {
    const p = simulatedProvider({ initPayment: vi.fn(async () => ({ ok: true, code: '201', message: '', raw: {} })) });
    const res = await H.handleInitiate(post('x', initBody, auth), rig({ provider: p, userRpc: () => ({ data: BEGIN_OK, error: null }) }).deps);
    expect((await j(res)).ok).toBe(false);
  });
  it('URL frontend manquante : CONFIG_MISSING, bail libéré, prestataire non appelé', async () => {
    const r = rig({ env: {}, userRpc: () => ({ data: BEGIN_OK, error: null }) });
    expect(await j(await H.handleInitiate(post('x', initBody, auth), r.deps))).toMatchObject({ code: 'CONFIG_MISSING' });
    expect(r.provider!.initPayment).not.toHaveBeenCalled();
    expect(r.admin.some((c) => c.name === 'payment_initiation_release')).toBe(true);
  });
  it('échec de l\'enregistrement en base : l\'URL est tout de même rendue (le webhook rattrape), anomalie journalisée', async () => {
    const r = rig({ userRpc: () => ({ data: BEGIN_OK, error: null }), adminRpc: (n) => (n === 'payment_provider_attach' ? { data: null, error: { message: 'x' } } : { data: { ok: true }, error: null }) });
    expect((await j(await H.handleInitiate(post('x', initBody, auth), r.deps))).ok).toBe(true);
    expect(r.logs.some((l) => l[0] === 'error')).toBe(true);
  });
  it('journaux : jamais de téléphone, d\'e-mail ni de secret', async () => {
    const r = rig({ userRpc: () => ({ data: BEGIN_OK, error: null }), provider: simulatedProvider({ initPayment: vi.fn(async () => ({ ok: false, code: '', message: '', raw: {}, failure: 'http_4xx' })) }) });
    await H.handleInitiate(post('x', { ...initBody, phone_number: '+243999999999' }, auth), r.deps);
    const s = JSON.stringify(r.logs);
    expect(s).not.toContain('+243999999999'); expect(s).not.toContain('+243000000000'); expect(s).not.toContain('j@sim.example');
    noSecretsIn(r.logs);
  });
});

describe('payment-webhook', () => {
  const notif = simulatedNotification();
  const formRequest = (fields: Record<string, string>, token: string | null) => new Request('https://e/x', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', ...(token ? { 'x-token': token } : {}) }, body: new URLSearchParams(fields).toString(),
  });

  it('GET (ping de disponibilité) : 200 sans traitement', async () => {
    const r = rig();
    expect((await H.handleWebhook(new Request('https://e/x', { method: 'GET' }), r.deps)).status).toBe(200);
    expect(r.admin).toHaveLength(0); expect(r.provider!.verifyTransaction).not.toHaveBeenCalled();
  });
  it('prestataire non configuré : 503 (la notification pourra être rejouée), aucune écriture', async () => {
    const r = rig({ state: 'not_configured' });
    expect((await H.handleWebhook(formRequest(notif, 'x'), r.deps)).status).toBe(503);
    expect(r.admin).toHaveLength(0);
  });
  it('corps sans référence : 200 sans traitement', async () => {
    const r = rig();
    expect((await H.handleWebhook(formRequest({ cpm_amount: '1' }, 't'), r.deps)).status).toBe(200);
    expect(r.admin).toHaveLength(0); expect(r.provider!.verifyNotification).not.toHaveBeenCalled();
  });
  it('NOTIFICATION FALSIFIÉE (signature invalide) : 200, ni vérification prestataire ni écriture', async () => {
    const p = simulatedProvider({ verifyNotification: vi.fn(async () => false) });
    const r = rig({ provider: p });
    expect((await H.handleWebhook(formRequest(notif, 'faux'), r.deps)).status).toBe(200);
    expect(p.verifyTransaction).not.toHaveBeenCalled(); expect(r.admin).toHaveLength(0);
    expect(r.logs.some((l) => String(l[2]).includes('signature invalide'))).toBe(true);
  });
  it('panne temporaire du prestataire à la vérification : 503, aucune écriture ; refus définitif : 200, aucune écriture', async () => {
    for (const [failure, status] of [['timeout', 503], ['network', 503], ['http_5xx', 503], ['http_4xx', 200], ['invalid_response', 200]] as const) {
      const p = simulatedProvider({ verifyTransaction: vi.fn(async () => ({ ok: false, code: '', message: '', raw: {}, failure })) });
      const r = rig({ provider: p });
      expect((await H.handleWebhook(formRequest(notif, 't'), r.deps)).status).toBe(status);
      expect(r.admin).toHaveLength(0);
    }
  });
  it('vérification sans statut : rien n\'est appliqué', async () => {
    const r = rig({ provider: simulatedProvider({ verifyTransaction: vi.fn(async () => ({ ok: true, code: '00', message: '', raw: {} })) }) });
    expect((await H.handleWebhook(formRequest(notif, 't'), r.deps)).status).toBe(200);
    expect(r.admin).toHaveLength(0);
  });
  it('le montant et le statut appliqués viennent de la VÉRIFICATION prestataire, jamais du corps de la notification', async () => {
    const r = rig();
    await H.handleWebhook(formRequest({ ...notif, cpm_amount: '1', cpm_currency: 'USD', cpm_error_message: 'SUCCES' }, 't'), r.deps);
    const apply = r.admin.find((c) => c.name === 'payment_apply_result')!;
    expect(apply.args).toMatchObject({ p_internal_reference: 'AGF-PAY-SIM0001', p_provider_status: 'ACCEPTED', p_amount: 1500, p_currency: 'CDF', p_source: 'webhook', p_provider_event_id: 'SIM-OP' });
  });
  it('notifications répétées : arguments identiques à chaque rejeu ; la base (idempotente) ne confirme qu\'une fois', async () => {
    let confirmations = 0; const seen = new Set<string>();
    const r = rig({ adminRpc: (_n, a) => { const k = String(a.p_provider_event_id) + String(a.p_provider_status); if (!seen.has(k)) { seen.add(k); confirmations += 1; return { data: { ok: true, status: 'paid' }, error: null }; } return { data: { ok: true, duplicate: true, status: 'paid' }, error: null }; } });
    for (let i = 0; i < 4; i++) expect((await H.handleWebhook(formRequest(notif, 't'), r.deps)).status).toBe(200);
    expect(r.admin).toHaveLength(4);
    expect(new Set(r.admin.map((c) => JSON.stringify(c.args))).size).toBe(1);
    expect(confirmations).toBe(1);
  });
  it('notifications désordonnées : chaque statut vérifié est transmis tel quel (la base arbitre les transitions)', async () => {
    const r = rig();
    for (const status of ['ACCEPTED', 'WAITING_FOR_CUSTOMER', 'REFUSED']) {
      r.provider!.verifyTransaction.mockResolvedValueOnce({ ok: true, code: '', message: '', status, amount: 1500, currency: 'CDF', operatorId: 'SIM-OP', raw: {} } as never);
      await H.handleWebhook(formRequest(notif, 't'), r.deps);
    }
    expect(r.admin.map((c) => c.args.p_provider_status)).toEqual(['ACCEPTED', 'WAITING_FOR_CUSTOMER', 'REFUSED']);
  });
  it('erreur base : 503 (rejouable) ; refus de la base : 200 journalisé avec le code', async () => {
    expect((await H.handleWebhook(formRequest(notif, 't'), rig({ adminRpc: () => ({ data: null, error: { message: 'x' } }) }).deps)).status).toBe(503);
    const r = rig({ adminRpc: () => ({ data: { ok: false, code: 'AMOUNT_MISMATCH' }, error: null }) });
    expect((await H.handleWebhook(formRequest(notif, 't'), r.deps)).status).toBe(200);
    expect(r.logs.some((l) => (l[3] as Obj | undefined)?.code === 'AMOUNT_MISMATCH')).toBe(true);
  });
  it('corps JSON accepté comme corps formulaire', async () => {
    const r = rig();
    const req = new Request('https://e/x', { method: 'POST', headers: { 'content-type': 'application/json', 'x-token': 't' }, body: JSON.stringify(notif) });
    expect((await H.handleWebhook(req, r.deps)).status).toBe(200);
    expect(r.admin).toHaveLength(1);
  });

  // ---- Bout en bout avec le VRAI adaptateur CinetPay (signature réelle, réseau simulé) ----
  describe('avec l\'adaptateur CinetPay réel (fetch simulé)', () => {
    const realDeps = (env: Record<string, string>, calls: { name: string; args: Obj }[], logs: unknown[][]): Deps => ({
      env: (n) => env[n], select: selectProvider, log: (...a) => { logs.push(a); },
      admin: () => ({ rpc: async (name: string, args: Obj) => { calls.push({ name, args }); return { data: { ok: true, status: 'paid' }, error: null }; } }),
      userClient: () => { throw new Error('inutilisé'); },
    });
    const stubCheck = (body: unknown, hits: { n: number }) => vi.stubGlobal('fetch', vi.fn(async () => { hits.n += 1; return new Response(JSON.stringify(body), { status: 200 }); }));

    it('notification authentique signée → vérification → application avec le montant du prestataire (le corps falsifié est ignoré)', async () => {
      const calls: { name: string; args: Obj }[] = []; const logs: unknown[][] = []; const hits = { n: 0 };
      stubCheck(SIMULATED_CHECK_ACCEPTED('1500', 'CDF'), hits);
      const forged = simulatedNotification({ cpm_amount: '5', cpm_currency: 'CDF' });
      const res = await H.handleWebhook(formRequest(forged, signNotification(forged)), realDeps(SIMULATED_ENV_ENABLED, calls, logs));
      expect(res.status).toBe(200);
      expect(hits.n).toBe(1);
      expect(calls[0].args).toMatchObject({ p_amount: 1500, p_currency: 'CDF', p_provider_status: 'ACCEPTED' });
      noSecretsIn(logs); noSecretsIn(calls);
    });
    it('signature falsifiée → aucun appel réseau, aucune écriture', async () => {
      const calls: { name: string; args: Obj }[] = []; const hits = { n: 0 };
      stubCheck(SIMULATED_CHECK_ACCEPTED('1500', 'CDF'), hits);
      const f = simulatedNotification();
      const res = await H.handleWebhook(formRequest({ ...f, cpm_amount: '1' }, signNotification(f)), realDeps(SIMULATED_ENV_ENABLED, calls, []));
      expect(res.status).toBe(200); expect(hits.n).toBe(0); expect(calls).toHaveLength(0);
    });
    it('paiements désactivés (interrupteur coupé) : une confirmation d\'argent déjà payé est quand même traitée', async () => {
      const calls: { name: string; args: Obj }[] = []; const hits = { n: 0 };
      stubCheck(SIMULATED_CHECK_ACCEPTED('1500', 'CDF'), hits);
      const f = simulatedNotification();
      const env = { ...SIMULATED_ENV_ENABLED, PAYMENTS_ONLINE_ENABLED: 'false' };
      expect((await H.handleWebhook(formRequest(f, signNotification(f)), realDeps(env, calls, []))).status).toBe(200);
      expect(calls).toHaveLength(1);
    });
    it('secrets absents : 503, aucune écriture, aucun appel réseau', async () => {
      const calls: { name: string; args: Obj }[] = []; const hits = { n: 0 };
      stubCheck({}, hits);
      const f = simulatedNotification();
      expect((await H.handleWebhook(formRequest(f, signNotification(f)), realDeps({}, calls, []))).status).toBe(503);
      expect(calls).toHaveLength(0); expect(hits.n).toBe(0);
    });
    it('réponse de vérification invalide (HTML) : aucune écriture', async () => {
      const calls: { name: string; args: Obj }[] = [];
      vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>erreur</html>', { status: 200 })));
      const f = simulatedNotification();
      await H.handleWebhook(formRequest(f, signNotification(f)), realDeps(SIMULATED_ENV_ENABLED, calls, []));
      expect(calls).toHaveLength(0);
    });
    it('journaux : ni numéro de téléphone de la notification ni secret', async () => {
      const logs: unknown[][] = []; const f = simulatedNotification({ cel_phone_num: '0899999999' });
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(SIMULATED_CHECK_STATUS('REFUSED')), { status: 503 })));
      await H.handleWebhook(formRequest(f, signNotification(f)), realDeps(SIMULATED_ENV_ENABLED, [], logs));
      expect(JSON.stringify(logs)).not.toContain('0899999999'); noSecretsIn(logs);
    });
  });
});

describe('payment-verify (retour du navigateur)', () => {
  const PAYMENT = { id: 'pay-1', order_id: 'o1', status: 'pending', amount: 1500, currency: 'CDF', method: 'mobile_money' };
  it('sans authentification / session invalide / référence absente', async () => {
    expect((await H.handleVerify(post('x', { internal_reference: 'R' }), rig().deps)).status).toBe(401);
    expect((await H.handleVerify(post('x', { internal_reference: 'R' }, auth), rig({ user: null }).deps)).status).toBe(401);
    expect((await H.handleVerify(post('x', {}, auth), rig().deps)).status).toBe(400);
  });
  it('référence inconnue OU appartenant à un autre utilisateur (RLS renvoie rien) : 404, ni prestataire ni écriture', async () => {
    const r = rig({ payment: null });
    expect((await H.handleVerify(post('x', { internal_reference: 'AGF-PAY-AUTRE' }, auth), r.deps)).status).toBe(404);
    expect(r.provider!.verifyTransaction).not.toHaveBeenCalled(); expect(r.admin).toHaveLength(0);
  });
  it('erreur de lecture : 503', async () => {
    expect((await H.handleVerify(post('x', { internal_reference: 'R' }, auth), rig({ paymentError: true }).deps)).status).toBe(503);
  });
  it('paiement déjà confirmé : état renvoyé sans rappeler le prestataire', async () => {
    const r = rig({ payment: { ...PAYMENT, status: 'paid' } });
    expect(await j(await H.handleVerify(post('x', { internal_reference: 'R' }, auth), r.deps))).toMatchObject({ ok: true, status: 'paid' });
    expect(r.provider!.verifyTransaction).not.toHaveBeenCalled();
  });
  it('prestataire non configuré : 503 CONFIG_MISSING (le navigateur n\'obtient aucun statut inventé)', async () => {
    const res = await H.handleVerify(post('x', { internal_reference: 'R' }, auth), rig({ state: 'not_configured', payment: PAYMENT }).deps);
    expect(res.status).toBe(503); expect(await j(res)).toMatchObject({ code: 'CONFIG_MISSING' });
  });
  it('prestataire indisponible : état connu renvoyé avec provider_unavailable, aucune écriture', async () => {
    const p = simulatedProvider({ verifyTransaction: vi.fn(async () => ({ ok: false, code: '', message: '', raw: {}, failure: 'timeout' })) });
    const r = rig({ provider: p, payment: PAYMENT });
    expect(await j(await H.handleVerify(post('x', { internal_reference: 'R' }, auth), r.deps))).toMatchObject({ ok: true, status: 'pending', provider_unavailable: true });
    expect(r.admin).toHaveLength(0);
  });
  it('RETOUR NAVIGATEUR FALSIFIÉ : statut/montant envoyés par le client ignorés ; seule la vérification serveur compte', async () => {
    const r = rig({ payment: PAYMENT, provider: simulatedProvider({ verifyTransaction: vi.fn(async () => ({ ok: true, code: '', message: '', status: 'REFUSED', amount: 1500, currency: 'CDF', raw: {} })) }),
      adminRpc: () => ({ data: { ok: true, status: 'failed' }, error: null }) });
    const b = await j(await H.handleVerify(post('x', { internal_reference: 'R', status: 'paid', amount: 1, payment_status: 'ACCEPTED' }, auth), r.deps));
    expect(b).toMatchObject({ ok: true, status: 'failed' });
    expect(r.admin[0].args).toMatchObject({ p_provider_status: 'REFUSED', p_amount: 1500, p_currency: 'CDF', p_source: 'verify' });
    expect(JSON.stringify(r.admin[0].args)).not.toContain('"p_status"');
  });
  it('vérification répétable : mêmes arguments à chaque appel (idempotence portée par la base)', async () => {
    const r = rig({ payment: PAYMENT });
    for (let i = 0; i < 3; i++) await H.handleVerify(post('x', { internal_reference: 'R' }, auth), r.deps);
    expect(new Set(r.admin.map((c) => JSON.stringify(c.args))).size).toBe(1);
  });
  it('refus de la base (montant/devise incohérents) : état connu + code, jamais « payé »', async () => {
    const r = rig({ payment: PAYMENT, adminRpc: () => ({ data: { ok: false, code: 'AMOUNT_MISMATCH' }, error: null }) });
    expect(await j(await H.handleVerify(post('x', { internal_reference: 'R' }, auth), r.deps))).toMatchObject({ ok: true, status: 'pending', mismatch: 'AMOUNT_MISMATCH' });
  });
  it('erreur base à l\'application : état connu, pas d\'erreur bloquante', async () => {
    const r = rig({ payment: PAYMENT, adminRpc: () => ({ data: null, error: { message: 'x' } }) });
    expect(await j(await H.handleVerify(post('x', { internal_reference: 'R' }, auth), r.deps))).toMatchObject({ ok: true, status: 'pending' });
  });
});
