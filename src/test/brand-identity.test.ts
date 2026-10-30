import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import mark from '@/components/brand/mark.json';
import { FOUNDER } from '@/lib/founder';

const BRAND_SVGS = ['agriflow-logo', 'agriflow-logo-dark', 'agriflow-logo-tagline', 'agriflow-logo-mono', 'agriflow-mark', 'agriflow-mark-glyph', 'agriflow-mark-mono'];

describe('identité visuelle AgriFlow RDC', () => {
  it('toutes les déclinaisons vectorielles existent et sont des SVG valides, sans police externe', () => {
    for (const n of BRAND_SVGS) {
      const f = join('public/brand', `${n}.svg`);
      expect(existsSync(f), f).toBe(true);
      const s = readFileSync(f, 'utf8');
      expect(s.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'), n).toBe(true);
      expect(s).toMatch(/viewBox="0 0 \d+ \d+"/);
      expect(s, `${n} : texte converti en tracés`).not.toMatch(/<text|font-family/);
    }
    expect(readFileSync('public/favicon.svg', 'utf8')).toBe(readFileSync('public/brand/agriflow-mark.svg', 'utf8'));
  });
  it('la géométrie unique du logo est complète', () => {
    for (const k of ['leaf', 'vein', 'flow', 'star'] as const) expect(mark[k].length).toBeGreaterThan(10);
    expect(mark.colors.forest).toBe('#163A24'); // couleur historique conservée
  });
  it('icône Android, icônes de repli et image de partage générées aux bonnes dimensions', async () => {
    const dims = async (f: string) => { const m = await sharp(f).metadata(); return `${m.width}x${m.height}`; };
    expect(await dims('assets/icon-only.png')).toBe('1024x1024');
    expect(await dims('assets/icon-foreground.png')).toBe('1024x1024');
    expect(await dims('assets/splash.png')).toBe('2732x2732');
    expect(await dims('public/brand/og-image.png')).toBe('1200x630');
    expect(await dims('public/apple-touch-icon.png')).toBe('180x180');
    expect(await dims('public/favicon-32.png')).toBe('32x32');
    expect(existsSync('android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png')).toBe(true);
  });
  it('identifiant et nom de l\'application Android inchangés', () => {
    const cfg = readFileSync('capacitor.config.ts', 'utf8');
    expect(cfg).toContain("appId: 'cd.agriflow.rdc'");
    expect(cfg).toContain("appName: 'AgriFlow RDC'");
    expect(cfg).not.toMatch(/server:\s*\{[^}]*url/);
  });
});

describe('photo et présentation du créateur', () => {
  it('la photo existe en WebP et JPEG, au ratio 4:5 déclaré (jamais déformée)', async () => {
    for (const f of [FOUNDER.photo.webp, FOUNDER.photo.jpg]) {
      const path = join('public', f);
      expect(existsSync(path), path).toBe(true);
      const m = await sharp(path).metadata();
      expect(m.width).toBe(FOUNDER.photo.width); expect(m.height).toBe(FOUNDER.photo.height);
    }
    expect(FOUNDER.photo.width / FOUNDER.photo.height).toBeCloseTo(0.8, 5);
    expect(statSync(join('public', FOUNDER.photo.webp)).size).toBeLessThan(150 * 1024);
  });
  it('l\'original est conservé hors du dossier public (non embarqué dans le site ni l\'APK)', () => {
    expect(existsSync('assets/source/createur-original.jpg')).toBe(true);
    expect(readdirSync('public/images/createur').some((f) => f.includes('original'))).toBe(false);
  });
  it('nom, fonction et texte ne contiennent que les informations fournies', () => {
    expect(FOUNDER.name).toBe('Joël Piako');
    expect(FOUNDER.role).toBe('Créateur et développeur d\'AgriFlow RDC');
    expect(FOUNDER.photo.alt).toContain(FOUNDER.name);
    const text = FOUNDER.bio.join(' ');
    expect(text).not.toMatch(/\d{2,}|diplôm|master|licence|prix|lauréat|ingénieur|année/i);
    expect(FOUNDER.links).toHaveLength(0);
  });
});

describe('aucune promesse de paiement en ligne non activé dans les textes visibles', () => {
  const files = ['src/lib/faq.ts', 'src/pages/HowItWorksPage.tsx', 'src/pages/LandingPage.tsx', 'src/lib/i18n/translations.ts', 'src/pages/AboutPage.tsx'];
  it('plus de « paiement sécurisé via CinetPay » ni de carte annoncée comme disponible', () => {
    for (const f of files) {
      const s = readFileSync(f, 'utf8');
      expect(s, f).not.toMatch(/Paiements? sécurisés? (via|par|\(CinetPay)/i);
      expect(s, f).not.toMatch(/Mobile Money,? (ou )?carte|Mobile Money, carte/i);
    }
  });
});
