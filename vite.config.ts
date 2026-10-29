import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    react(),
    {
      // Browser-only SQLite (jeep-sqlite) needs its wasm at /assets; serve it in dev instead of shipping it in the APK.
      name: 'dev-sql-wasm',
      configureServer(server) {
        server.middlewares.use('/assets/sql-wasm.wasm', (_req, res) => {
          res.setHeader('Content-Type', 'application/wasm');
          res.end(readFileSync(createRequire(import.meta.url).resolve('sql.js/dist/sql-wasm.wasm', { paths: ['node_modules/jeep-sqlite'] })));
        });
      },
    },
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});
