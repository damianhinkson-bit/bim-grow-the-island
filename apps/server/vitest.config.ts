import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({ resolve: { alias: { '@bim/sim': fileURLToPath(new URL('../../packages/sim/src/index.ts', import.meta.url)) } } });
