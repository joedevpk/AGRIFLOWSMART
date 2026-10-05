import { expect, test } from '@playwright/test';
import { assertSafeTarget, expectNoBrokenScreen, login, requireAccount, writesAllowed } from './helpers';

test.describe('Parcours acheteur', () => {
  test('accueil → marketplace → recherche → produit → panier (lecture seule, sans compte)', async ({ page, baseURL }) => {
    await page.goto('/');
    await expectNoBrokenScreen(page);
    await page.goto('/marketplace');
    await expectNoBrokenScreen(page);
    const search = page.getByRole('searchbox').first();
    await search.fill('maïs');
    await expect(page).toHaveURL(/q=ma/);                       // la recherche est dans l'URL après le debounce (300 ms)
    const first = page.locator('a[href^="/marketplace/"]').first();
    if (await first.count()) {
      await first.click();
      await expect(page).toHaveURL(/\/marketplace\/[0-9a-f-]{36}/);
      await expectNoBrokenScreen(page);
    } else {
      await expect(page.locator('body')).toContainText(/aucun|résultat|produit/i);  // état vide propre
    }
    await page.goto('/cart');
    await expectNoBrokenScreen(page);
    expect(baseURL).toBeTruthy();
  });

  test('connexion → panier → checkout → commande → résultat → suivi (ÉCRIT des données de staging)', async ({ page, baseURL }) => {
    test.skip(!writesAllowed, 'E2E_ALLOW_WRITES=1 requis (le parcours crée une commande)');
    assertSafeTarget(baseURL);
    const { email, password } = requireAccount('buyer');
    await login(page, email, password);
    await page.goto('/marketplace');
    await page.locator('a[href^="/marketplace/"]').first().click();
    await page.getByRole('button', { name: /ajouter au panier/i }).first().click();
    await page.goto('/cart');
    await page.getByRole('link', { name: /commander|passer la commande|checkout/i }).first().click();
    await expect(page).toHaveURL(/\/checkout/);
    await page.getByRole('button', { name: /confirmer la commande|valider|payer/i }).first().click();
    await expect(page).toHaveURL(/\/checkout\/confirmation\/|\/payment\/result\//, { timeout: 20_000 });
    await expectNoBrokenScreen(page);
    // Après un paiement réussi : « Paiement confirmé » + « Confirmation du producteur en attente » (jamais « commande confirmée »)
    if (/\/payment\/result\//.test(page.url())) {
      await expect(page.locator('body')).not.toContainText(/votre commande est confirmée/i);
    }
  });
});
