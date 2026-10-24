import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `--mode single` builds one self-contained HTML file (for quick sharing as a Claude artifact).
export default defineConfig(({ mode }) => ({
  base: './',
  resolve: { alias: { '@bim/sim': fileURLToPath(new URL('../../packages/sim/src/index.ts', import.meta.url)) } },
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist', target: ['es2020', 'safari14', 'chrome90', 'firefox90'] },
  // during development the game server runs separately (npm run dev:server); Vite forwards /ws to it
  server: { host: true, proxy: { '/ws': { target: 'ws://localhost:8787', ws: true } } },
}));
