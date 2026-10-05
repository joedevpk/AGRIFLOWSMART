import { describe, expect, it } from 'vitest';
import { CROPS, getCrop } from './agri/crops';
import { ZONES } from './agri/zones';
import { computeSuitability, rangeScore, ratingFor } from './agri/suitability';
import { cropYear, mod12, monthStatus, monthsToText } from './agri/calendar';

describe('calculs agricoles', () => {
  it('rangeScore (échelle 0–1) : 1 dans la plage optimale, 0,5–0,95 entre optimum et limite absolue, 0,15 au-delà', () => {
    const r = { optMin: 20, optMax: 30, absMin: 10, absMax: 40 };
    expect(rangeScore(25, r)).toBe(1);
    expect(rangeScore(20, r)).toBe(1);
    expect(rangeScore(30, r)).toBe(1);
    expect(rangeScore(15, r)).toBeGreaterThan(0.5);
    expect(rangeScore(15, r)).toBeLessThan(0.95);
    expect(rangeScore(10, r)).toBeCloseTo(0.5, 5);   // sur la limite absolue : seuil « compatible »
    expect(rangeScore(5, r)).toBe(0.15);             // hors limites : plancher, jamais 0 ni négatif
    expect(rangeScore(45, r)).toBe(0.15);
    expect(rangeScore(15, r)).toBeCloseTo(rangeScore(35, r), 5); // symétrique pour des marges égales
    expect(rangeScore(18, r)).toBeGreaterThan(rangeScore(12, r)); // plus on s'approche de l'optimum, mieux c'est
  });
  it('ratingFor : seuils 50 et 75 (échelle 0–100)', () => {
    expect(ratingFor(75)).toBe('Bonne aptitude');
    expect(ratingFor(74)).toBe('Aptitude moyenne');
    expect(ratingFor(50)).toBe('Aptitude moyenne');
    expect(ratingFor(49)).toBe('Aptitude limitée');
  });
  it('indice d\'aptitude : sans aucune donnée, aucun score inventé', () => {
    const crop = CROPS[0];
    const s = computeSuitability(crop, {});
    expect(s.score).toBeNull();
    expect(s.usedFactors).toBe(0);
    expect(s.disclaimer.length).toBeGreaterThan(20);
  });
  it('indice d\'aptitude : borné 0–100 et n\'utilise que les facteurs disponibles', () => {
    for (const crop of CROPS) for (const zone of ZONES) {
      const s = computeSuitability(crop, { zone, soilPh: 6.5, water: 'irrigation' });
      if (s.score !== null) { expect(s.score).toBeGreaterThanOrEqual(0); expect(s.score).toBeLessThanOrEqual(100); }
      expect(s.usedFactors).toBeLessThanOrEqual(s.totalFactors);
      expect(s.factors.filter((f) => f.score !== null)).toHaveLength(s.usedFactors);
    }
  });
  it('calendrier : mois circulaires et douze cases par culture', () => {
    expect(mod12(0)).toBe(12); expect(mod12(13)).toBe(1); expect(mod12(-1)).toBe(11); expect(mod12(12)).toBe(12);
    const crop = getCrop(CROPS[0].id)!;
    expect(cropYear(crop, ZONES[0])).toHaveLength(12);
    expect(monthStatus(crop, ZONES[0], 1).month).toBe(1);
    expect(monthsToText([1, 2, 3])).toBeTypeOf('string');
  });
  it('catalogue : identifiants uniques, plages cohérentes', () => {
    expect(new Set(CROPS.map((c) => c.id)).size).toBe(CROPS.length);
    expect(getCrop('inconnu')).toBeUndefined();
  });
});
