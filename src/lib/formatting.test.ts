import { describe, expect, it } from 'vitest';
import { formatPrice, formatQuantity, UNIT_LABELS } from './constants';
import { checkPublicEnv, jwtRole } from './env';
import { buildEvent, redactText, redactValue } from './logger';
import { fileExtension, sniffImageType, validateDimensions } from './image-upload';

describe('formats', () => {
  it('prix et quantités', () => {
    expect(formatPrice(1250.5, 'USD').replace(/\s/g, ' ')).toMatch(/^1 250,5 USD$/);
    expect(formatPrice(0.5, 'USD')).toBe('0,5 USD');
    expect(formatQuantity(200, 'kg')).toContain(UNIT_LABELS.kg);
    expect(formatQuantity(3, 'unité_inconnue')).toContain('unité_inconnue');
  });
});

describe('journalisation : aucune donnée sensible', () => {
  const FAKE_JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJlc2lnbmF0dXJl';
  it('masque les clés sensibles quel que soit le niveau d\'imbrication', () => {
    const out = redactValue({ ok: 'visible', password: 'x', nested: { apiKey: 'k', token: 't', cinetpay_secret: 's', phone: '+243812345678', deep: { authorization: 'Bearer abc' } } }) as Record<string, unknown>;
    expect(JSON.stringify(out)).not.toMatch(/"x"|"k"|"t"|"s"|243812345678|Bearer abc/);
    expect(out.ok).toBe('visible');
  });
  it('masque les motifs sensibles dans le texte libre (JWT, Bearer, numéro de carte)', () => {
    expect(redactText(`échec avec ${FAKE_JWT}`)).not.toContain('eyJ');
    expect(redactText('Authorization: Bearer abcdefghijklmnop')).not.toContain('abcdefghijklmnop');
    expect(redactText('carte 4111 1111 1111 1111 refusée')).not.toContain('4111');
  });
  it('événement structuré : horodatage, contexte, identifiant de requête, pas de fuite', () => {
    const e = buildEvent('error', 'paymentService.initiate', new Error(`boom ${FAKE_JWT}`), { fn: 'initiate', requestId: 'AF-PAY-123', apiKey: 'secret-value' }, new Date('2026-10-02T12:00:00Z'));
    expect(e).toMatchObject({ timestamp: '2026-10-02T12:00:00.000Z', level: 'error', context: 'paymentService.initiate', requestId: 'AF-PAY-123' });
    expect(JSON.stringify(e)).not.toMatch(/eyJ|secret-value/);
  });
  it('profondeur et taille bornées', () => {
    expect(JSON.stringify(redactValue({ a: { b: { c: { d: { e: 'trop profond' } } } } }))).not.toContain('trop profond');
    expect(String(redactValue('x'.repeat(5000))).length).toBeLessThanOrEqual(500);
  });
});

describe('configuration publique', () => {
  const ok = { VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.c2lnbmF0dXJlc2lnbmF0dXJl' };
  it('valide une configuration correcte', () => {
    expect(checkPublicEnv(ok)).toEqual({ ok: true, missing: [], invalid: [], forbidden: [] });
  });
  it('variables manquantes / vides / valeurs d\'exemple / URL illisible', () => {
    expect(checkPublicEnv({}).missing).toEqual(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']);
    expect(checkPublicEnv({ ...ok, VITE_SUPABASE_URL: '   ' }).missing).toEqual(['VITE_SUPABASE_URL']);
    expect(checkPublicEnv({ ...ok, VITE_SUPABASE_ANON_KEY: 'your-anon-key' }).invalid).toEqual(['VITE_SUPABASE_ANON_KEY']);
    expect(checkPublicEnv({ ...ok, VITE_SUPABASE_URL: 'pas une url' }).invalid).toEqual(['VITE_SUPABASE_URL']);
  });
  it('bloque une clé service_role placée dans la variable « anon » et toute variable VITE_ qui ressemble à un secret', () => {
    const serviceRole = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJlc2lnbmF0dXJl';
    expect(jwtRole(serviceRole)).toBe('service_role');
    expect(checkPublicEnv({ ...ok, VITE_SUPABASE_ANON_KEY: serviceRole }).forbidden).toEqual(['VITE_SUPABASE_ANON_KEY']);
    expect(checkPublicEnv({ ...ok, VITE_CINETPAY_SECRET_KEY: 'abc' }).forbidden).toEqual(['VITE_CINETPAY_SECRET_KEY']);
    expect(checkPublicEnv({ ...ok, VITE_SUPABASE_SERVICE_ROLE_KEY: 'abc' }).ok).toBe(false);
  });
  it('le résultat ne contient jamais de valeur, seulement des noms', () => {
    expect(JSON.stringify(checkPublicEnv({ ...ok, VITE_CINETPAY_SECRET_KEY: 'valeur-secrete' }))).not.toContain('valeur-secrete');
  });
});

describe('téléversement d\'images', () => {
  const bytes = (...b: number[]) => new Uint8Array(b);
  it('type réel d\'après la signature (le type déclaré se falsifie)', () => {
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
    expect(sniffImageType(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))).toBe('image/webp');
    expect(sniffImageType(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode('MZ executable'))).toBeNull();
    expect(sniffImageType(bytes())).toBeNull();
  });
  it('extension et dimensions', () => {
    expect(fileExtension('Photo.JPG')).toBe('jpg');
    expect(fileExtension('sans_extension')).toBe('');
    expect(validateDimensions(50, 800)).toMatch(/trop petite/);
    expect(validateDimensions(8000, 8000)).toMatch(/trop grande/);
    expect(validateDimensions(1600, 1200)).toBeNull();
  });
});
