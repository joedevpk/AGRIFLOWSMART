import { describe, expect, it } from 'vitest';
import {
  addDays, autoGranularity, buildCsv, csvCell, isValidYmd, kinshasaToday, periodDays, periodFromDates, presetDates,
  TX_CSV_COLUMNS, validatePeriod,
} from '@/lib/finance';

describe('périodes (heure de Kinshasa, UTC+1)', () => {
  it('convertit des dates inclusives en instants [début, fin[ à minuit Kinshasa', () => {
    expect(periodFromDates('2026-03-01', '2026-03-31')).toEqual({ from: '2026-03-01T00:00:00+01:00', to: '2026-04-01T00:00:00+01:00' });
    expect(periodFromDates('2026-12-31', '2026-12-31')).toEqual({ from: '2026-12-31T00:00:00+01:00', to: '2027-01-01T00:00:00+01:00' });
  });
  it('la fin exclue couvre exactement le dernier jour entier', () => {
    const { from, to } = periodFromDates('2026-03-10', '2026-03-10');
    expect((Date.parse(to) - Date.parse(from)) / 3_600_000).toBe(24);
  });
  it('le « jour » est celui de Kinshasa, pas celui du navigateur', () => {
    expect(kinshasaToday(new Date('2026-03-15T23:30:00Z'))).toBe('2026-03-16');
    expect(kinshasaToday(new Date('2026-03-15T22:59:59Z'))).toBe('2026-03-15');
  });
  it('compte les jours inclus et gère les mois/années', () => {
    expect(periodDays('2026-03-01', '2026-03-31')).toBe(31);
    expect(periodDays('2026-02-01', '2026-02-28')).toBe(28);
    expect(periodDays('2024-02-01', '2024-02-29')).toBe(29);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('valide les dates et la période', () => {
    expect(isValidYmd('2026-02-30')).toBe(false);
    expect(isValidYmd('2026-2-3')).toBe(false);
    expect(validatePeriod('2026-03-02', '2026-03-01')).toMatch(/postérieure/);
    expect(validatePeriod('', '2026-03-01')).toMatch(/valides/);
    expect(validatePeriod('2020-01-01', '2026-01-01')).toMatch(/800 jours/);
    expect(validatePeriod('2026-03-01', '2026-03-31')).toBeNull();
    expect(() => periodFromDates('2026-03-02', '2026-03-01')).toThrow(RangeError);
  });
  it('préréglages calculés à la date de Kinshasa', () => {
    const now = new Date('2026-03-15T23:30:00Z'); // 16 mars à Kinshasa
    expect(presetDates('7d', now)).toEqual({ from: '2026-03-10', to: '2026-03-16' });
    expect(presetDates('30d', now)).toEqual({ from: '2026-02-15', to: '2026-03-16' });
    expect(presetDates('month', now)).toEqual({ from: '2026-03-01', to: '2026-03-16' });
    expect(presetDates('prevMonth', now)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(presetDates('prevMonth', new Date('2026-01-10T12:00:00Z'))).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });
  it('choisit une granularité lisible', () => {
    expect(autoGranularity(7)).toBe('day');
    expect(autoGranularity(62)).toBe('day');
    expect(autoGranularity(63)).toBe('week');
    expect(autoGranularity(400)).toBe('week');
    expect(autoGranularity(401)).toBe('month');
  });
});

describe('export CSV', () => {
  it('neutralise l\'injection de formules dans les cellules texte', () => {
    for (const evil of ['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\tx', '\rx', '  =HYPERLINK("x")']) {
      expect(csvCell(evil).replace(/^"/, '').startsWith("'")).toBe(true);
    }
    expect(csvCell('=1+1')).toBe("'=1+1");
  });
  it('ne préfixe jamais un vrai nombre', () => {
    expect(csvCell(-5.5)).toBe('-5.5');
    expect(csvCell(0)).toBe('0');
    expect(csvCell(Number.NaN)).toBe('');
  });
  it('échappe guillemets, virgules, points-virgules et retours à la ligne', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('dit "oui"')).toBe('"dit ""oui"""');
    expect(csvCell('l1\nl2')).toBe('"l1\nl2"');
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('simple')).toBe('simple');
  });
  it('gère null, booléens et tableaux', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(true)).toBe('oui');
    expect(csvCell(['refund_stuck', 'payment_stale'])).toBe('refund_stuck | payment_stale');
  });
  it('produit un CSV UTF-8 avec BOM, en-têtes français et lignes CRLF', () => {
    const csv = buildCsv([{ order_number: 'AF-001', currency: 'USD', items_subtotal: 99.99, platform_commission: null, review_reasons: [] }], TX_CSV_COLUMNS);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe(TX_CSV_COLUMNS.map((c) => (/[",;]/.test(c.label) ? `"${c.label}"` : c.label)).join(','));
    expect(lines[1].startsWith('AF-001,')).toBe(true);
    expect(lines[1]).toContain(',USD,99.99,');
    expect(lines.length).toBe(3); // en-tête + 1 ligne + fin vide
  });
  it('n\'exporte que les colonnes déclarées (aucune donnée personnelle par défaut)', () => {
    const csv = buildCsv([{ order_number: 'AF-1', buyer_name: 'Jean Dupont', phone: '+243...' }], TX_CSV_COLUMNS);
    expect(csv).not.toContain('Jean');
    expect(csv).not.toContain('+243');
  });
});
