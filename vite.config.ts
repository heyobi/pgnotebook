import { defineConfig } from 'vite';

export default defineConfig({
  // PGlite loads its .wasm/.data/.tar.gz files itself; keep them out of Vite's dependency pre-bundling.
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  worker: { format: 'es' },
  build: { target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 4000 },
  server: { port: 5199 },
});
