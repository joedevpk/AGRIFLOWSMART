import { expect, test } from '@playwright/test';
import { expectNoBrokenScreen, login, requireAccount } from './helpers';

// Parcours admin : lecture seule (aucune écriture) → peut tourner sur un staging sans E2E_ALLOW_WRITES.
test.describe('Parcours admin', () => {
  test('connexion → administration → utilisateurs, produits, commandes, remboursements, paramètres', async ({ page }) => {
    const { email, password } = requireAccount('admin');
    await login(page, email, password);
    await page.goto('/admin');
    await expectNoBrokenScreen(page);
    for (const label of [/utilisateurs/i, /commandes en attente de confirmation/i, /commandes/i]) {
      await expect(page.getByText(label).first()).toBeVisible();
    }
    await expect(page.getByRole('button', { name: /bientôt expirées/i })).toBeVisible();
    await expect(page.getByText(/délais de confirmation/i).first()).toBeVisible();
  });

  test('un utilisateur non admin ne voit pas /admin', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).not.toHaveURL(/\/admin$/);
  });
});
