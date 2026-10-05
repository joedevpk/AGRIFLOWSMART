import { describe, expect, it } from 'vitest';
import { parseFilters, hasAnyFilter, normalize, comparableQuantity } from './marketplace';
import { accentPattern, quantityClause, searchTokens, tokenClause } from './marketplace-query';
import { PAGE_SIZE, pageRange, sliceHasMore } from './pagination';

describe('filtres du marketplace', () => {
  it('lecture des paramètres d\'URL : valeurs inconnues ignorées', () => {
    const f = parseFilters(new URLSearchParams('q=maïs&sort=zzz&price=inconnu&province=Kinshasa'));
    expect(f.q).toBe('maïs');
    expect(f.province).toBe('Kinshasa');
    expect(hasAnyFilter(f)).toBe(true);
    expect(hasAnyFilter(parseFilters(new URLSearchParams('')))).toBe(false);
  });
  it('normalisation : accents et casse', () => {
    expect(normalize('  MAÏS Éthiopien ')).toBe('mais ethiopien');
  });
  it('quantités comparables (tonne = 1000 kg)', () => {
    expect(comparableQuantity(2, 'tonne')).toBe(2000);
    expect(comparableQuantity(3, 'kg')).toBe(3);
  });
});

describe('recherche côté serveur : jamais d\'injection dans le filtre PostgREST', () => {
  it('chaque mot est réduit à [a-z0-9] (5 mots maximum)', () => {
    expect(searchTokens('maïs, (manioc) ; DROP*')).toEqual(['mais', 'manioc', 'drop']);
    expect(searchTokens('a b c d e f g')).toHaveLength(5);
    expect(searchTokens('%%% ,,, ()')).toEqual([]);
  });
  it('insensible aux accents', () => {
    expect(accentPattern('mais')).toBe('m[aàâä][iîï]s');
    expect(accentPattern('ble')).toBe('bl[eéèêë]');
  });
  it('la clause ne contient aucun caractère de contrôle imprévu', () => {
    const clause = tokenClause('mais');
    expect(clause).toContain('name.imatch.m[aàâä][iîï]s');
    expect(clause.split(',').every((part) => /^[a-z_]+\.(imatch|eq)\.[A-Za-z0-9_[\]àâäçéèêëîïôöùûüÿ]+$/.test(part))).toBe(true);
  });
  it('quantité minimale convertie par unité', () => {
    expect(quantityClause(1000)).toContain('and(unit.eq.kg,quantity.gte.1000)');
    expect(quantityClause(1000)).toContain('and(unit.eq.tonne,quantity.gte.1)');
  });
});

describe('pagination', () => {
  it('range : size + 1 lignes pour détecter la page suivante', () => {
    expect(pageRange(0, 24)).toEqual([0, 24]);
    expect(pageRange(2, 20)).toEqual([40, 60]);
    expect(pageRange(-3, 10)).toEqual([0, 10]);
  });
  it('sliceHasMore', () => {
    expect(sliceHasMore([1, 2, 3], 2)).toEqual({ items: [1, 2], hasMore: true });
    expect(sliceHasMore([1, 2], 2)).toEqual({ items: [1, 2], hasMore: false });
    expect(sliceHasMore(null, 2)).toEqual({ items: [], hasMore: false });
  });
  it('tailles de page raisonnables (jamais des milliers de lignes)', () => {
    for (const size of Object.values(PAGE_SIZE)) expect(size).toBeLessThanOrEqual(50);
  });
});
