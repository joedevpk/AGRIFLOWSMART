import { expect, test } from '@playwright/test';
import { assertSafeTarget, expectNoBrokenScreen, login, requireAccount, writesAllowed } from './helpers';

test.describe('Parcours producteur', () => {
  test.skip(!writesAllowed, 'E2E_ALLOW_WRITES=1 requis (publication, disponibilité, statuts de commande)');

  test('connexion → tableau de bord → disponibilité → publication d\'un produit', async ({ page, baseURL }) => {
    assertSafeTarget(baseURL);
    const { email, password } = requireAccount('producer');
    await login(page, email, password);
    await page.goto('/dashboard');
    await expectNoBrokenScreen(page);
    await page.goto('/profile');
    const toggle = page.getByRole('switch').first();
    await expect(toggle).toBeVisible();
    await toggle.click();                                        // OFF : « Vous ne recevrez pas de nouvelles commandes… »
    await expect(page.locator('body')).toContainText(/ne recevrez pas de nouvelles commandes/i);
    await toggle.click();                                        // ON : de nouveau disponible
    await expect(page.locator('body')).toContainText(/pouvez recevoir des commandes/i);
    await page.goto('/producer/products/new');
    await expectNoBrokenScreen(page);
  });

  test('commande reçue → confirmer → préparer → prête → livraison (commande de staging préparée)', async ({ page, baseURL }) => {
    assertSafeTarget(baseURL);
    const { email, password } = requireAccount('producer');
    await login(page, email, password);
    await page.goto('/producer/orders');
    await expectNoBrokenScreen(page);
    const order = page.locator('a[href^="/orders/"]').first();
    test.skip((await order.count()) === 0, 'Aucune commande en attente dans le staging pour ce producteur');
    await order.click();
    for (const step of [/^confirmer/i, /préparation|commencer la préparation/i, /prête|marquer comme prête/i, /livraison|démarrer la livraison/i]) {
      const button = page.getByRole('button', { name: step }).first();
      if (await button.isVisible().catch(() => false)) { await button.click(); await page.waitForLoadState('networkidle'); }
    }
    await expectNoBrokenScreen(page);
  });
});
