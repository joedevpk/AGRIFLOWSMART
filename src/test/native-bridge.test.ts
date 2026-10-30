import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Plugins Capacitor SIMULÉS (aucun appareil) ----
const native = vi.hoisted(() => ({ value: true }));
const m = vi.hoisted(() => ({
  browser: { open: vi.fn(), addListener: vi.fn() },
  camera: { getPhoto: vi.fn() },
  geo: { checkPermissions: vi.fn(), requestPermissions: vi.fn(), getCurrentPosition: vi.fn() },
  fs: { writeFile: vi.fn(), deleteFile: vi.fn() },
  share: { share: vi.fn() },
}));
vi.mock('@/lib/native/platform', () => ({ isNativeApp: () => native.value, appPlatform: () => (native.value ? 'android' : 'web') }));
vi.mock('@capacitor/browser', () => ({ Browser: m.browser }));
vi.mock('@capacitor/camera', () => ({ Camera: m.camera, CameraResultType: { Uri: 'uri' }, CameraSource: { Prompt: 'PROMPT' } }));
vi.mock('@capacitor/geolocation', () => ({ Geolocation: m.geo }));
vi.mock('@capacitor/filesystem', () => ({ Filesystem: m.fs, Directory: { Cache: 'CACHE' }, Encoding: { UTF8: 'utf8' } }));
vi.mock('@capacitor/share', () => ({ Share: m.share }));

import { isSafeCheckoutUrl, openCheckoutPage } from '@/lib/native/browser';
import { NativePermissionError, pickPhotoFiles } from '@/lib/native/camera';
import { downloadTextFile, safeFilename } from '@/lib/native/files';
import { GeoError, getCurrentCoordinates } from '@/lib/native/geolocation';
import { cleanupNativeServiceWorker, registerServiceWorker } from '@/lib/native/serviceWorker';

beforeEach(() => {
  native.value = true;
  Object.values(m).forEach((o) => Object.values(o).forEach((f) => f.mockReset()));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('page de paiement (le retour n\'est jamais une preuve de paiement)', () => {
  it('n\'ouvre que du https sans identifiants', () => {
    expect(isSafeCheckoutUrl('https://checkout.simulated.example/pay/1')).toBe(true);
    for (const bad of ['http://x.example', 'javascript:alert(1)', 'data:text/html,x', 'https://u:p@x.example', 'x', '']) expect(isSafeCheckoutUrl(bad)).toBe(false);
  });
  it('URL refusée : rien n\'est ouvert', async () => {
    const navigate = vi.fn();
    expect(await openCheckoutPage({ url: 'javascript:alert(1)', reference: 'REF123', navigate })).toBe(false);
    expect(m.browser.open).not.toHaveBeenCalled(); expect(m.browser.addListener).not.toHaveBeenCalled();
  });
  it('Web : la page courante est remplacée (comportement historique)', async () => {
    native.value = false;
    const loc = { href: '' }; vi.stubGlobal('window', { location: loc });
    expect(await openCheckoutPage({ url: 'https://checkout.simulated.example/pay/1', reference: 'REF123', navigate: vi.fn() })).toBe(true);
    expect(loc.href).toBe('https://checkout.simulated.example/pay/1');
    expect(m.browser.open).not.toHaveBeenCalled();
  });
  it('native : navigateur intégré (jamais la WebView) ; à la fermeture, la page de résultat qui VÉRIFIE côté serveur', async () => {
    const navigate = vi.fn(); const remove = vi.fn();
    let finished: () => void = () => undefined;
    m.browser.addListener.mockImplementation(async (_e: string, cb: () => void) => { finished = cb; return { remove }; });
    m.browser.open.mockResolvedValue(undefined);
    expect(await openCheckoutPage({ url: 'https://checkout.simulated.example/pay/1', reference: 'AGF-PAY-ABC123', navigate })).toBe(true);
    expect(m.browser.addListener).toHaveBeenCalledWith('browserFinished', expect.any(Function));
    expect(m.browser.open).toHaveBeenCalledWith({ url: 'https://checkout.simulated.example/pay/1', presentationStyle: 'fullscreen' });
    expect(navigate).not.toHaveBeenCalled(); // l'ouverture seule ne présume de rien
    finished();
    expect(navigate).toHaveBeenCalledWith('/payment/result/AGF-PAY-ABC123');
    expect(remove).toHaveBeenCalledTimes(1);
  });
  it('native : échec d\'ouverture → écouteur retiré, erreur propagée, aucune navigation', async () => {
    const navigate = vi.fn(); const remove = vi.fn();
    m.browser.addListener.mockResolvedValue({ remove });
    m.browser.open.mockRejectedValue(new Error('boom'));
    await expect(openCheckoutPage({ url: 'https://checkout.simulated.example/pay/1', reference: 'REF123', navigate })).rejects.toThrow('boom');
    expect(remove).toHaveBeenCalledTimes(1); expect(navigate).not.toHaveBeenCalled();
  });
  it('la référence est encodée dans la route de retour', async () => {
    const navigate = vi.fn(); let finished: () => void = () => undefined;
    m.browser.addListener.mockImplementation(async (_e: string, cb: () => void) => { finished = cb; return { remove: vi.fn() }; });
    await openCheckoutPage({ url: 'https://c.example/p', reference: 'a/b c', navigate });
    finished();
    expect(navigate).toHaveBeenCalledWith('/payment/result/a%2Fb%20c');
  });
});

describe('photos (appareil photo / galerie)', () => {
  it('Web : rien (les pages gardent leur champ fichier)', async () => {
    native.value = false;
    expect(await pickPhotoFiles()).toEqual([]);
    expect(m.camera.getPhoto).not.toHaveBeenCalled();
  });
  it('native : une photo devient un File avec type et nom', async () => {
    m.camera.getPhoto.mockResolvedValue({ webPath: 'capacitor://localhost/_capacitor_file_/p.jpeg', format: 'jpeg' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }))));
    const [file] = await pickPhotoFiles();
    expect(file.type).toBe('image/jpeg'); expect(file.name).toMatch(/^photo-\d+\.jpg$/); expect(file.size).toBe(3);
    expect(m.camera.getPhoto).toHaveBeenCalledWith(expect.objectContaining({ source: 'PROMPT', resultType: 'uri' }));
  });
  it('annulation : liste vide, pas d\'erreur', async () => {
    m.camera.getPhoto.mockRejectedValue(new Error('User cancelled photos app'));
    expect(await pickPhotoFiles()).toEqual([]);
  });
  it('permission refusée : erreur explicite pour l\'utilisateur', async () => {
    m.camera.getPhoto.mockRejectedValue(new Error('User denied access to camera'));
    await expect(pickPhotoFiles()).rejects.toBeInstanceOf(NativePermissionError);
  });
  it('autre erreur : propagée, jamais avalée', async () => {
    m.camera.getPhoto.mockRejectedValue(new Error('disque plein'));
    await expect(pickPhotoFiles()).rejects.toThrow('disque plein');
  });
});

describe('géolocalisation (ponctuelle, à la demande)', () => {
  const pos = { coords: { latitude: -4.3217, longitude: 15.3125 } };
  it('native : permission déjà accordée → position, sans nouvelle demande', async () => {
    m.geo.checkPermissions.mockResolvedValue({ location: 'granted', coarseLocation: 'granted' });
    m.geo.getCurrentPosition.mockResolvedValue(pos);
    expect(await getCurrentCoordinates()).toEqual({ latitude: -4.3217, longitude: 15.3125 });
    expect(m.geo.requestPermissions).not.toHaveBeenCalled();
    expect(m.geo.getCurrentPosition).toHaveBeenCalledWith(expect.objectContaining({ enableHighAccuracy: false }));
  });
  it('native : permission demandée au moment de l\'usage, puis position', async () => {
    m.geo.checkPermissions.mockResolvedValue({ location: 'prompt', coarseLocation: 'prompt' });
    m.geo.requestPermissions.mockResolvedValue({ location: 'granted', coarseLocation: 'granted' });
    m.geo.getCurrentPosition.mockResolvedValue(pos);
    await getCurrentCoordinates();
    expect(m.geo.requestPermissions).toHaveBeenCalledWith({ permissions: ['location'] });
  });
  it('native : refus → GeoError « denied », aucune lecture de position', async () => {
    m.geo.checkPermissions.mockResolvedValue({ location: 'denied', coarseLocation: 'denied' });
    m.geo.requestPermissions.mockResolvedValue({ location: 'denied', coarseLocation: 'denied' });
    await expect(getCurrentCoordinates()).rejects.toMatchObject({ code: 'denied' });
    expect(m.geo.getCurrentPosition).not.toHaveBeenCalled();
  });
  it('native : erreurs classées (délai, indisponible, autre)', async () => {
    m.geo.checkPermissions.mockResolvedValue({ location: 'granted', coarseLocation: 'granted' });
    for (const [msg, code] of [['Timeout expired', 'timeout'], ['Location services are not enabled', 'unavailable'], ['bizarre', 'failed']] as const) {
      m.geo.getCurrentPosition.mockRejectedValueOnce(new Error(msg));
      await expect(getCurrentCoordinates()).rejects.toMatchObject({ code });
    }
  });
  it('Web : API du navigateur, erreurs classées', async () => {
    native.value = false;
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: (ok: (p: unknown) => void) => ok(pos) } });
    expect(await getCurrentCoordinates()).toEqual({ latitude: -4.3217, longitude: 15.3125 });
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: (_o: unknown, ko: (e: { code: number }) => void) => ko({ code: 1 }) } });
    await expect(getCurrentCoordinates()).rejects.toBeInstanceOf(GeoError);
    vi.stubGlobal('navigator', {});
    await expect(getCurrentCoordinates()).rejects.toMatchObject({ code: 'unavailable' });
    expect(m.geo.getCurrentPosition).not.toHaveBeenCalled();
  });
});

describe('téléchargements (export CSV, données personnelles)', () => {
  it('nom de fichier sûr : aucun séparateur de chemin ni caractère spécial', () => {
    expect(safeFilename('../../etc/passwd')).toBe('etc_passwd');
    expect(safeFilename('agriflow mes données.json')).toBe('agriflow_mes_donn_es.json');
    expect(safeFilename('...')).toBe('fichier');
    expect(safeFilename('')).toBe('fichier');
    expect(safeFilename('a'.repeat(300)).length).toBe(100);
  });
  it('native : écrit dans le cache privé, partage, puis supprime le fichier', async () => {
    m.fs.writeFile.mockResolvedValue({ uri: 'file:///cache/exports/1-x.csv' });
    m.share.share.mockResolvedValue({}); m.fs.deleteFile.mockResolvedValue(undefined);
    await downloadTextFile({ filename: 'x.csv', mimeType: 'text/csv', content: 'a,b', shareTitle: 'Export' });
    expect(m.fs.writeFile).toHaveBeenCalledWith(expect.objectContaining({ directory: 'CACHE', encoding: 'utf8', data: 'a,b', path: expect.stringMatching(/^exports\/\d+-x\.csv$/) }));
    expect(m.share.share).toHaveBeenCalledWith(expect.objectContaining({ url: 'file:///cache/exports/1-x.csv', title: 'Export' }));
    expect(m.fs.deleteFile).toHaveBeenCalledWith(expect.objectContaining({ directory: 'CACHE' }));
  });
  it('native : une tentative de traversée dans le nom ne sort jamais du cache', async () => {
    m.fs.writeFile.mockResolvedValue({ uri: 'file:///c/x' }); m.share.share.mockResolvedValue({}); m.fs.deleteFile.mockResolvedValue(undefined);
    await downloadTextFile({ filename: '../../../data/secret.json', mimeType: 'application/json', content: '{}' });
    const path = m.fs.writeFile.mock.calls[0][0].path as string;
    expect(path.startsWith('exports/')).toBe(true); expect(path.slice('exports/'.length)).not.toContain('/'); expect(path).not.toContain('..');
  });
  it('native : fermer la feuille de partage n\'est pas une erreur ; le fichier est tout de même supprimé', async () => {
    m.fs.writeFile.mockResolvedValue({ uri: 'file:///c/x' }); m.fs.deleteFile.mockResolvedValue(undefined);
    m.share.share.mockRejectedValue(new Error('Share canceled'));
    await expect(downloadTextFile({ filename: 'x.csv', mimeType: 'text/csv', content: 'a' })).resolves.toBeUndefined();
    expect(m.fs.deleteFile).toHaveBeenCalledTimes(1);
  });
  it('native : une vraie erreur de partage est propagée ET le fichier supprimé', async () => {
    m.fs.writeFile.mockResolvedValue({ uri: 'file:///c/x' }); m.fs.deleteFile.mockResolvedValue(undefined);
    m.share.share.mockRejectedValue(new Error('aucune application disponible'));
    await expect(downloadTextFile({ filename: 'x.csv', mimeType: 'text/csv', content: 'a' })).rejects.toThrow('aucune application');
    expect(m.fs.deleteFile).toHaveBeenCalledTimes(1);
  });
  it('Web : téléchargement par lien temporaire, sans plugin', async () => {
    native.value = false;
    const a = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
    vi.stubGlobal('document', { createElement: () => a, body: { appendChild: vi.fn() } });
    const created = vi.fn(() => 'blob:x'); const revoked = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: created, revokeObjectURL: revoked }));
    await downloadTextFile({ filename: 'x.csv', mimeType: 'text/csv', content: 'a' });
    expect(a.download).toBe('x.csv'); expect(a.click).toHaveBeenCalledTimes(1); expect(revoked).toHaveBeenCalledWith('blob:x');
    expect(m.fs.writeFile).not.toHaveBeenCalled(); expect(m.share.share).not.toHaveBeenCalled();
  });
});

describe('Service Worker', () => {
  const stubSw = (regs: { unregister: () => Promise<boolean> }[], keys: string[]) => {
    const del = vi.fn(async () => true);
    vi.stubGlobal('navigator', { serviceWorker: { getRegistrations: async () => regs, register: vi.fn(async () => ({})) } });
    vi.stubGlobal('caches', { keys: async () => keys, delete: del });
    return del;
  };
  it('native : aucun enregistrement ; Service Worker et caches de coquille existants supprimés (pas de version périmée)', async () => {
    const unreg = vi.fn(async () => true);
    const del = stubSw([{ unregister: unreg }, { unregister: unreg }], ['agriflow-shell-abc', 'autre-cache', 'agriflow-shell-old']);
    vi.stubGlobal('window', { addEventListener: vi.fn() });
    registerServiceWorker();
    await vi.waitFor(() => expect(unreg).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(del).toHaveBeenCalledTimes(2));
    expect(del).toHaveBeenCalledWith('agriflow-shell-abc'); expect(del).toHaveBeenCalledWith('agriflow-shell-old');
    expect(del).not.toHaveBeenCalledWith('autre-cache');
    expect((navigator.serviceWorker as unknown as { register: ReturnType<typeof vi.fn> }).register).not.toHaveBeenCalled();
  });
  it('nettoyage : jamais d\'erreur si le navigateur n\'expose rien', async () => {
    vi.stubGlobal('navigator', {});
    await expect(cleanupNativeServiceWorker()).resolves.toBeUndefined();
  });
  it('Web hors production : rien n\'est enregistré', () => {
    native.value = false;
    stubSw([], []);
    const add = vi.fn(); vi.stubGlobal('window', { addEventListener: add });
    registerServiceWorker();
    expect(add).not.toHaveBeenCalled(); // import.meta.env.PROD est faux en test
  });
});
