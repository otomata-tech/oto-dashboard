import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// Config de test séparée de `vite.config.ts` (build) : pas de plugin Sentry/vue
// devtools au moment des tests, juste l'alias `@` et l'environnement DOM (jsdom)
// dont `viewOrg` a besoin (localStorage). Les suites unitaires ciblent la logique
// pure de `src/lib` et `src/composables` ; les tests de composants (@vue/test-utils)
// pourront ajouter le plugin vue ici quand on en écrira.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.ts'],
    globals: false,
  },
})
