import { describe, expect, it } from 'vitest';
import { hasBottomNav } from './bottom-nav';
import { navFor, ADMIN_NAV, BUYER_NAV, PRODUCER_NAV } from '@/components/layout/dashboard-nav';

describe('navigation basse mobile', () => {
  it('est masquée sur le checkout (elle recouvrait le bouton Continuer / Confirmer)', () => {
    expect(hasBottomNav('/checkout')).toBe(false);
    expect(hasBottomNav('/checkout/')).toBe(false);
  });
  it('reste affichée sur la confirmation de commande et le résultat de paiement', () => {
    expect(hasBottomNav('/checkout/confirmation/abc')).toBe(true);
    expect(hasBottomNav('/payment/result/ref-1')).toBe(true);
  });
  it('reste affichée sur le panier et la marketplace', () => {
    expect(hasBottomNav('/cart')).toBe(true);
    expect(hasBottomNav('/marketplace')).toBe(true);
    expect(hasBottomNav('/')).toBe(true);
  });
  it('reste masquée sur l\'authentification et l\'administration', () => {
    for (const p of ['/login', '/register', '/forgot-password', '/admin']) expect(hasBottomNav(p)).toBe(false);
  });
});

describe('navigation du tableau de bord par rôle', () => {
  it('donne un accès à /admin à l\'administrateur (aucun lien n\'existait)', () => {
    const paths = navFor('admin').flatMap((s) => s.items.map((i) => i.path));
    expect(paths).toContain('/admin');
    expect(navFor('admin')).toBe(ADMIN_NAV);
  });
  it('ne montre pas /admin aux autres rôles', () => {
    for (const nav of [PRODUCER_NAV, BUYER_NAV]) {
      expect(nav.flatMap((s) => s.items.map((i) => i.path))).not.toContain('/admin');
    }
    expect(navFor('buyer')).toBe(BUYER_NAV);
    expect(navFor('producer')).toBe(PRODUCER_NAV);
    expect(navFor('cooperative')).toBe(PRODUCER_NAV);
  });
});
