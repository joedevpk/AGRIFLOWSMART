import { describe, expect, it } from 'vitest';
import { favoriteLabel, withFavorite } from './favorites';

describe('favoris — utilitaires', () => {
  it('withFavorite ajoute / retire sans muter l\'ensemble d\'origine', () => {
    const base = new Set(['a']);
    const added = withFavorite(base, 'b', true);
    expect([...added].sort()).toEqual(['a', 'b']);
    expect([...base]).toEqual(['a']);
    const removed = withFavorite(added, 'a', false);
    expect([...removed]).toEqual(['b']);
    expect(added.has('a')).toBe(true);
  });
  it('withFavorite est idempotent (double ajout, retrait d\'un absent)', () => {
    expect([...withFavorite(new Set(['a']), 'a', true)]).toEqual(['a']);
    expect([...withFavorite(new Set(['a']), 'z', false)]).toEqual(['a']);
  });
  it('favoriteLabel : nom accessible dynamique', () => {
    expect(favoriteLabel(false)).toBe('Ajouter aux favoris');
    expect(favoriteLabel(true)).toBe('Retirer des favoris');
    expect(favoriteLabel(false, 'Manioc')).toBe('Ajouter Manioc aux favoris');
    expect(favoriteLabel(true, 'Manioc')).toBe('Retirer Manioc des favoris');
  });
});
