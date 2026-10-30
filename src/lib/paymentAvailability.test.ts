import { describe, expect, it } from 'vitest';
import {
  applyAvailability, CARD_UNAVAILABLE_MESSAGE, ONLINE_NOT_ACTIVATED_MESSAGE, ONLINE_STATUS_UNKNOWN_MESSAGE, parseAvailability, UNKNOWN_AVAILABILITY,
} from '@/lib/paymentAvailability';

interface Opt { id: string; mode: string; selectable: boolean; unavailableReason?: string }
const opts = (): Opt[] => [
  { id: 'mobile_money', mode: 'online', selectable: true },
  { id: 'card', mode: 'online', selectable: true },
  { id: 'cash_on_delivery', mode: 'offline', selectable: true },
];
const on = { state: 'enabled' as const, methods: { mobile_money: true, card: false } };

describe('disponibilité du paiement en ligne côté acheteur', () => {
  it('non configuré : aucun moyen en ligne proposable, message « pas encore activé », paiement à la livraison intact', () => {
    const r = applyAvailability(opts(), { state: 'not_configured', methods: { mobile_money: false, card: false } });
    expect(r.find((o) => o.id === 'mobile_money')).toMatchObject({ selectable: false, unavailableReason: ONLINE_NOT_ACTIVATED_MESSAGE });
    expect(r.find((o) => o.id === 'card')?.selectable).toBe(false);
    expect(r.find((o) => o.id === 'cash_on_delivery')).toMatchObject({ selectable: true });
    expect(r.find((o) => o.id === 'cash_on_delivery')?.unavailableReason).toBeUndefined();
  });
  it('désactivé ou prestataire inconnu : même refus', () => {
    for (const state of ['disabled', 'unsupported_provider'] as const) {
      const r = applyAvailability(opts(), { state, methods: { mobile_money: false, card: false } });
      expect(r.filter((o) => o.mode === 'online').every((o) => !o.selectable && o.unavailableReason === ONLINE_NOT_ACTIVATED_MESSAGE)).toBe(true);
    }
  });
  it('statut impossible à obtenir : rien n\'est proposé en ligne (jamais de faux bouton)', () => {
    const r = applyAvailability(opts(), UNKNOWN_AVAILABILITY);
    expect(r.filter((o) => o.mode === 'online').every((o) => !o.selectable && o.unavailableReason === ONLINE_STATUS_UNKNOWN_MESSAGE)).toBe(true);
  });
  it('activé : mobile money proposable ; la carte reste indisponible sans confirmation explicite', () => {
    const r = applyAvailability(opts(), on);
    expect(r.find((o) => o.id === 'mobile_money')?.selectable).toBe(true);
    expect(r.find((o) => o.id === 'card')).toMatchObject({ selectable: false, unavailableReason: CARD_UNAVAILABLE_MESSAGE });
    expect(applyAvailability(opts(), { state: 'enabled', methods: { mobile_money: true, card: true } }).find((o) => o.id === 'card')?.selectable).toBe(true);
  });
  it('un moyen déjà refusé par la configuration admin / la devise le reste, même si le serveur est activé', () => {
    const o: Opt[] = [{ id: 'card', mode: 'online', selectable: false, unavailableReason: 'Indisponible en CDF' }];
    expect(applyAvailability(o, { state: 'enabled', methods: { mobile_money: true, card: true } })[0]).toMatchObject({ selectable: false, unavailableReason: 'Indisponible en CDF' });
  });
  it('ne modifie pas les options d\'origine', () => {
    const o = opts(); applyAvailability(o, UNKNOWN_AVAILABILITY);
    expect(o.every((x) => x.selectable)).toBe(true);
  });
  it('réponse du serveur : toute valeur inattendue vaut « inconnu » ; la carte exige un état activé', () => {
    for (const bad of [null, undefined, 'x', 42, {}, { ok: false }, { ok: true }, { ok: true, state: 'hacked' }, { ok: true, state: 'enabled' }.state]) {
      expect(parseAvailability(bad)).toEqual(UNKNOWN_AVAILABILITY);
    }
    expect(parseAvailability({ ok: true, state: 'enabled', methods: { mobile_money: true, card: true } })).toEqual({ state: 'enabled', methods: { mobile_money: true, card: true } });
    expect(parseAvailability({ ok: true, state: 'disabled', methods: { mobile_money: true, card: true } })).toEqual({ state: 'disabled', methods: { mobile_money: false, card: false } });
    expect(parseAvailability({ ok: true, state: 'enabled', methods: { mobile_money: 'true', card: 1 } }).methods).toEqual({ mobile_money: false, card: false });
  });
});
