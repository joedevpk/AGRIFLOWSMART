import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBackButtonHandler, createDeepLinkHandler } from '@/lib/native/lifecycle';
import { APP_URL_SCHEME, authRedirectUrl, normalizePublicWebUrl, publicWebUrl, resolveDeepLink } from '@/lib/native/urls';

const native = vi.hoisted(() => ({ value: false }));
vi.mock('@/lib/native/platform', () => ({ isNativeApp: () => native.value, appPlatform: () => (native.value ? 'android' : 'web') }));

afterEach(() => { native.value = false; vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const UUID = '123e4567-e89b-12d3-a456-426614174000';
const ORIGIN = 'https://agriflow.example.com';

describe('URL publique du site (liens des e-mails)', () => {
  it('n\'accepte que https sans identifiants, et ne garde que l\'origine', () => {
    expect(normalizePublicWebUrl('https://agriflow.example.com')).toBe(ORIGIN);
    expect(normalizePublicWebUrl('https://agriflow.example.com/chemin?x=1#y')).toBe(ORIGIN);
    for (const bad of ['http://agriflow.example.com', 'ftp://x.example', 'https://user:pw@agriflow.example.com', 'pas une url', '', undefined, null]) {
      expect(normalizePublicWebUrl(bad as string | undefined)).toBeNull();
    }
  });
  it('Web : l\'origine du site courant', () => {
    vi.stubGlobal('window', { location: { origin: 'https://site.example' } });
    expect(publicWebUrl()).toBe('https://site.example');
    expect(authRedirectUrl('/reset-password')).toBe('https://site.example/reset-password');
  });
  it('application native : jamais l\'origine de la WebView ; URL publique configurée, sinon null (pas de lien cassé)', () => {
    native.value = true;
    vi.stubGlobal('window', { location: { origin: 'https://localhost' } });
    vi.stubEnv('VITE_PUBLIC_WEB_URL', ORIGIN);
    expect(publicWebUrl()).toBe(ORIGIN);
    expect(authRedirectUrl('/reset-password')).toBe(`${ORIGIN}/reset-password`);
    vi.stubEnv('VITE_PUBLIC_WEB_URL', '');
    expect(publicWebUrl()).toBeNull();
    expect(authRedirectUrl('/reset-password')).toBeNull();
    vi.stubEnv('VITE_PUBLIC_WEB_URL', 'http://insecure.example');
    expect(publicWebUrl()).toBeNull();
  });
  it('refuse un chemin de redirection invalide (pas de redirection ouverte)', () => {
    vi.stubGlobal('window', { location: { origin: 'https://site.example' } });
    for (const bad of ['reset', '//evil.example/x', '']) expect(authRedirectUrl(bad)).toBeNull();
  });
});

describe('liens profonds : liste blanche', () => {
  it('schéma de l\'application : pages autorisées', () => {
    expect(resolveDeepLink(`${APP_URL_SCHEME}://payment/result/AGF-PAY-ABC123`, null)).toBe('/payment/result/AGF-PAY-ABC123');
    expect(resolveDeepLink(`${APP_URL_SCHEME}:///orders/${UUID}`, null)).toBe(`/orders/${UUID}`);
    expect(resolveDeepLink(`${APP_URL_SCHEME}://marketplace`, null)).toBe('/marketplace');
    expect(resolveDeepLink(`${APP_URL_SCHEME}://marketplace/${UUID}/`, null)).toBe(`/marketplace/${UUID}`);
    expect(resolveDeepLink(`${APP_URL_SCHEME}://notifications`, null)).toBe('/notifications');
    expect(resolveDeepLink(`${APP_URL_SCHEME}://buyer/orders`, null)).toBe('/buyer/orders');
  });
  it('lien https : uniquement l\'origine publique configurée', () => {
    expect(resolveDeepLink(`${ORIGIN}/payment/result/AGF-PAY-ABC123`, ORIGIN)).toBe('/payment/result/AGF-PAY-ABC123');
    expect(resolveDeepLink('https://evil.example/payment/result/AGF-PAY-ABC123', ORIGIN)).toBeNull();
    expect(resolveDeepLink(`${ORIGIN}/payment/result/AGF-PAY-ABC123`, null)).toBeNull();
    expect(resolveDeepLink('http://agriflow.example.com/login', ORIGIN)).toBeNull();
  });
  it('rejette pages non listées, espaces sensibles, schémas inconnus et tentatives de détournement', () => {
    const bad = [
      `${APP_URL_SCHEME}://admin/finance`, `${APP_URL_SCHEME}://admin`, `${APP_URL_SCHEME}://reset-password`, `${APP_URL_SCHEME}://checkout`,
      `${APP_URL_SCHEME}://payment/result/..%2F..%2Fadmin`, `${APP_URL_SCHEME}://payment/result/../../admin`, `${APP_URL_SCHEME}://payment/result/AB`,
      `${APP_URL_SCHEME}://orders/pas-un-uuid`, 'javascript:alert(1)', 'data:text/html,<script>1</script>', 'file:///etc/passwd',
      'autre.schema://payment/result/AGF-PAY-ABC123', `${APP_URL_SCHEME}://user:pw@payment/result/AGF-PAY-ABC123`, 'pas une url', '',
    ];
    for (const url of bad) expect(resolveDeepLink(url, ORIGIN), url).toBeNull();
  });
  it('ne transporte jamais jeton ni paramètres : requête et fragment sont supprimés', () => {
    expect(resolveDeepLink(`${APP_URL_SCHEME}://payment/result/AGF-PAY-ABC123?access_token=x#refresh_token=y`, null)).toBe('/payment/result/AGF-PAY-ABC123');
    expect(resolveDeepLink(`${ORIGIN}/login#access_token=secret&type=recovery`, ORIGIN)).toBe('/login');
  });
});

describe('événements natifs (logique pure)', () => {
  it('bouton Retour : revient dans l\'historique, sinon ferme l\'application', () => {
    const goBack = vi.fn(); const exitApp = vi.fn();
    createBackButtonHandler({ historyIndex: () => 3, goBack, exitApp })();
    expect(goBack).toHaveBeenCalledTimes(1); expect(exitApp).not.toHaveBeenCalled();
    createBackButtonHandler({ historyIndex: () => 0, goBack, exitApp })();
    expect(exitApp).toHaveBeenCalledTimes(1); expect(goBack).toHaveBeenCalledTimes(1);
  });
  it('lien profond : navigue seulement vers une page autorisée', () => {
    const navigate = vi.fn();
    const open = createDeepLinkHandler({ navigate, publicOrigin: () => ORIGIN });
    expect(open(`${APP_URL_SCHEME}://notifications`)).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/notifications');
    expect(open(`${APP_URL_SCHEME}://admin/finance`)).toBe(false);
    expect(open('https://evil.example/notifications')).toBe(false);
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});
