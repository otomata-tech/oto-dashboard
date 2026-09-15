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
    // Le défaut de Vitest (5 s) est calibré pour de l'unitaire, pas pour 42 specs
    // qui MONTENT des composants dans un pool parallèle. Mesuré le 15/09/2026 :
    // `BillingView.spec.ts` et `AdminOrgView.spec.ts` passent 17/17 en isolation
    // (le test le plus lent : 1 325 ms) et rougissent dans la suite complète —
    // jamais sur une assertion, toujours sur `Test timed out in 5000ms`, et sur un
    // jeu de fichiers qui change d'un run à l'autre selon la charge de la machine.
    // Ce n'est donc pas un test qui attend l'impossible (il finirait rouge en
    // isolation aussi), c'est la contention : ~4x de ralentissement sous pool.
    // 15 s laisse passer cette contention en gardant 11x de marge sur le plus lent
    // mesuré — un test réellement bloqué, lui, n'aboutit à aucun budget.
    // Enjeu : cette suite est la SEULE du parc qui barre la mise en production
    // (`deploy: needs: test`, préprod et prod) ; rougir au hasard y apprend à
    // relancer plutôt qu'à croire.
    testTimeout: 15000,
    hookTimeout: 15000,
  },
})
