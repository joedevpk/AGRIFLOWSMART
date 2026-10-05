import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TRANSLATIONS, translate, translationCoverage, type LanguageCode } from './i18n/translations';

const LANGS: LanguageCode[] = ['fr', 'ln', 'kg', 'sw', 'lu'];
const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');

describe('traductions', () => {
  it('le français est la référence complète', () => {
    expect(translationCoverage('fr')).toBe(1);
  });
  it('aucune langue n\'est déclarée complète si elle ne l\'est pas', () => {
    for (const l of LANGS.filter((x) => x !== 'fr')) expect(translationCoverage(l)).toBeLessThan(1);
  });
  it('aucune clé n\'existe dans une langue sans exister en français', () => {
    for (const l of LANGS) for (const k of Object.keys(TRANSLATIONS[l])) expect(TRANSLATIONS.fr[k], `${l}:${k}`).toBeDefined();
  });
  it('les marqueurs {param} sont identiques dans toutes les langues', () => {
    for (const l of LANGS.filter((x) => x !== 'fr')) for (const [k, v] of Object.entries(TRANSLATIONS[l])) expect(placeholders(v), `${l}:${k}`).toBe(placeholders(TRANSLATIONS.fr[k]));
  });
  it('repli propre : une traduction manquante retombe sur le français, jamais sur la clé brute', () => {
    const missing = Object.keys(TRANSLATIONS.fr).find((k) => !(k in TRANSLATIONS.ln))!;
    expect(translate('ln', missing)).toBe(TRANSLATIONS.fr[missing]);
    expect(translate('ln', missing)).not.toBe(missing);
  });
  it('interpolation', () => {
    expect(translate('fr', 'confirm.remaining', { time: '5 h' })).toBe('Temps restant : 5 h');
    expect(translate('fr', 'confirm.remaining')).toContain('{time}'); // paramètre oublié : visible dans les tests, pas de plantage
  });

  it('toute clé utilisée via t(\'...\') dans le code existe en français (aucune clé brute affichée)', () => {
    const used = new Map<string, string>();
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) && !full.includes('i18n')) {
          for (const m of readFileSync(full, 'utf8').matchAll(/\bt\('([a-zA-Z]+(?:\.[a-zA-Z0-9]+)+)'/g)) used.set(m[1], full);
        }
      }
    };
    walk('src');
    expect(used.size).toBeGreaterThan(20);
    const missing = [...used].filter(([k]) => !(k in TRANSLATIONS.fr)).map(([k, f]) => `${k} (${f})`);
    expect(missing).toEqual([]);
  });
});
