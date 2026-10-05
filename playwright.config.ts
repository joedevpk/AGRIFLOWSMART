import { defineConfig, devices } from '@playwright/test';

/**
 * Tests E2E (navigateur) — À EXÉCUTER CONTRE UN ENVIRONNEMENT DE STAGING / LOCAL, JAMAIS contre la production.
 *  E2E_BASE_URL  : URL du frontend de test (défaut http://localhost:4173 = `npm run build && npm run preview`).
 * Les parcours qui ÉCRIVENT des données exigent E2E_ALLOW_WRITES=1 et des comptes de test dédiés (voir tests/e2e/README.md).
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'mobile-390', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    { name: 'desktop-1280', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
});
