import { expect, test } from '@playwright/test';
import { assertSafeTarget, expectNoBrokenScreen, login, requireAccount, rpcAsService, writesAllowed } from './helpers';

// Parcours « producteur absent » : la commande est passée par l'acheteur, puis le cron serveur est exécuté (RPC service_role d'un
// STAGING). Prérequis : une commande `pending` avec échéance existe pour E2E_ORDER_ID, dont l'échéance a été avancée dans le passé
// par le script de préparation du staging (voir tests/e2e/README.md).
test.describe('Parcours producteur absent', () => {
  test.skip(!writesAllowed || !process.env.E2E_ORDER_ID, 'E2E_ALLOW_WRITES=1 et E2E_ORDER_ID (commande de staging dont l\'échéance est dépassée) requis');

  test('attente → expiration par le cron → acheteur informé → alternatives (ou message « aucun producteur »)', async ({ page, baseURL }) => {
    assertSafeTarget(baseURL);
    const { email, password } = requireAccount('buyer');
    const orderId = process.env.E2E_ORDER_ID as string;
    await rpcAsService('run_order_confirmation_maintenance');
    await rpcAsService('run_order_confirmation_maintenance');     // 2e passage : sans effet (idempotent)
    await login(page, email, password);
    await page.goto(`/orders/${orderId}`);
    await expectNoBrokenScreen(page);
    await expect(page.locator('body')).toContainText(/commande expirée/i);
    await expect(page.locator('body')).toContainText(/n'a pas confirmé votre commande à temps/i);
    const hasAlternatives = await page.locator('#alternatives li').count();
    if (hasAlternatives > 0) await expect(page.locator('#alternatives')).toContainText(/alternatives/i);
    else await expect(page.locator('body')).toContainText(/Aucun producteur disponible pour cette demande actuellement/i);
    await page.goto('/notifications');
    await expect(page.locator('body')).toContainText(/commande expirée/i);
  });
});
