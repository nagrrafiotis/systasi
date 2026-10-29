import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
const fake = fileURLToPath(new URL('./fake-supabase.js', import.meta.url));
export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  build: { outDir: 'tests/e2e/dist', emptyOutDir: true, target: 'es2020', chunkSizeWarningLimit: 5000 },
  plugins: [{ name: 'fake-supabase', enforce: 'pre', resolveId(src, imp) { if (src === './supabase.js' && imp && /src[\\/](store|main)\.js$/.test(imp)) return fake; } }],
});
