import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `--mode single` builds one self-contained HTML file (for quick sharing as a Claude artifact).
export default defineConfig(({ mode }) => ({
  base: './',
  resolve: { alias: { '@bim/sim': fileURLToPath(new URL('../../packages/sim/src/index.ts', import.meta.url)) } },
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist', target: 'es2022' },
  server: { host: true },
}));
