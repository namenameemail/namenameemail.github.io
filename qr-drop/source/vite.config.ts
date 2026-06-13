import { defineConfig } from 'vite';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const sourceDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: '/qr-drop/',
  build: {
    outDir: resolve(sourceDir, '..'),
    emptyOutDir: false,
    rollupOptions: {
      input: {
        main: resolve(sourceDir, 'index.html'),
        join: resolve(sourceDir, 'join.html'),
      },
    },
  },
});
