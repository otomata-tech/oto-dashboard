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
  },
})
