import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// Config de test séparée de `vite.config.ts` (build) : pas de plugin Sentry/vue
// devtools au moment des tests, juste le plugin vue (tests de composants), l'alias
// `@` et l'environnement DOM (jsdom) dont `viewOrg` a besoin (localStorage).
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.ts'],
    globals: false,
    // La couche API lit `VITE_OTO_MCP_BASE` au CHARGEMENT du module (`api.ts`) ;
    // l'env de test n'a pas de `.env` (contrairement au poste dev) → défaut factice,
    // sinon tout spec important `@/api` casse en CI seulement (local-vert / CI-rouge).
    env: { VITE_OTO_MCP_BASE: 'http://localhost:9103' },
  },
})
