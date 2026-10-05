import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

// Tests unitaires : fonctions pures + petits serveurs HTTP locaux. Aucun navigateur, aucun réseau externe, aucun Supabase.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
  },
});
