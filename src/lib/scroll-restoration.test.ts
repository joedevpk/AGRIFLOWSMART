import { describe, expect, it } from 'vitest';
import { decideScroll, entryKey, readPositions, writePositions } from './scroll-restoration';

const home = { pathname: '/', search: '', hash: '' };
const market = { pathname: '/marketplace', search: '', hash: '' };

describe('decideScroll', () => {
  it('nouvelle route (PUSH) : haut de page', () => {
    expect(decideScroll('PUSH', home, market)).toBe('top');
    expect(decideScroll('PUSH', market, { pathname: '/marketplace/42', search: '', hash: '' })).toBe('top');
    expect(decideScroll('PUSH', market, { pathname: '/checkout', search: '', hash: '' })).toBe('top');
  });
  it('REPLACE vers une autre page (ex. checkout -> confirmation) : haut de page', () => {
    expect(decideScroll('REPLACE', { pathname: '/checkout', search: '', hash: '' }, { pathname: '/checkout/confirmation/x', search: '', hash: '' })).toBe('top');
  });
  it('première navigation sans page précédente : haut de page', () => {
    expect(decideScroll('PUSH', null, market)).toBe('top');
  });
  it('mêmes page, filtres différents : position conservée', () => {
    expect(decideScroll('PUSH', market, { ...market, search: '?cat=mais' })).toBe('keep');
    expect(decideScroll('REPLACE', { ...market, search: '?q=a' }, { ...market, search: '?q=ab' })).toBe('keep');
  });
  it('clic sur le lien de la page courante (même URL) : haut de page', () => {
    expect(decideScroll('PUSH', market, market)).toBe('top');
  });
  it('ancre : défilement vers la section, y compris depuis une autre page', () => {
    expect(decideScroll('PUSH', home, { pathname: '/confidentialite', search: '', hash: '#droits' })).toBe('hash');
    expect(decideScroll('PUSH', market, { ...market, hash: '#top' })).toBe('hash');
  });
  it('Précédent / Suivant : restauration', () => {
    expect(decideScroll('POP', market, home)).toBe('restore');
    expect(decideScroll('POP', null, { pathname: '/cart', search: '', hash: '' })).toBe('restore');
  });
});

describe('positions enregistrées', () => {
  const mem = () => {
    const data: Record<string, string> = {};
    return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v; } };
  };
  it('clé d\'entrée = key + URL (la première entrée a toujours la key « default »)', () => {
    expect(entryKey({ key: 'default', pathname: '/a', search: '?x=1', hash: '' })).not.toBe(entryKey({ key: 'default', pathname: '/b', search: '', hash: '' }));
  });
  it('aller-retour de stockage', () => {
    const s = mem();
    writePositions(s, { a: 120, b: 0 });
    expect(readPositions(s)).toEqual({ a: 120, b: 0 });
  });
  it('ignore un contenu corrompu ou non numérique', () => {
    expect(readPositions({ getItem: () => '{oops' })).toEqual({});
    expect(readPositions({ getItem: () => JSON.stringify({ a: 'x', b: -4, c: 50 }) })).toEqual({ c: 50 });
    expect(readPositions(null)).toEqual({});
  });
  it('plafonne le nombre d\'entrées conservées', () => {
    const s = mem();
    const many = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`k${i}`, i]));
    writePositions(s, many);
    const back = readPositions(s);
    expect(Object.keys(back).length).toBe(60);
    expect(back.k199).toBe(199);
  });
});
