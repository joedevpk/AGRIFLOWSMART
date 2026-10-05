import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

/** Remplace `__BUILD_ID__` dans dist/sw.js par une empreinte du build (version de cache unique par déploiement). */
function swBuildId(): Plugin {
  let outDir = 'dist';
  return {
    name: 'sw-build-id',
    apply: 'build',
    configResolved(config) { outDir = config.build.outDir; },
    closeBundle() {
      const file = `${outDir}/sw.js`;
      if (!existsSync(file)) return;
      const index = existsSync(`${outDir}/index.html`) ? readFileSync(`${outDir}/index.html`, 'utf8') : '';
      // Le HTML référence les fichiers hachés : son empreinte change dès qu'un fichier change. Pas de date → build reproductible.
      const id = createHash('sha256').update(index).digest('hex').slice(0, 10);
      writeFileSync(file, readFileSync(file, 'utf8').replace(/__BUILD_ID__/g, id));
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), swBuildId()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
