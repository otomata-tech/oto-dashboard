import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// Upload des source maps Sentry : actif UNIQUEMENT si SENTRY_AUTH_TOKEN est présent
// dans l'env de build (posé sur la box). No-op en dev local / CI sans token → le
// build reste identique. Région EU (de.sentry.io). Les maps sont générées en
// `hidden` (pas de //# sourceMappingURL dans le bundle = pas exposées au public)
// puis supprimées du dist après upload.
const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    tailwindcss(),
    ...(SENTRY_AUTH_TOKEN
      ? [
          sentryVitePlugin({
            org: 'otomata-vz',
            project: 'oto-dashboard',
            url: 'https://de.sentry.io/',
            authToken: SENTRY_AUTH_TOKEN,
            telemetry: false,
            sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
          }),
        ]
      : []),
  ],
  // Feature flags vue-i18n (build esm-bundler) : on n'utilise que l'API Composition
  // (legacy:false) → tree-shake l'API legacy et coupe le warning runtime du bundler.
  define: {
    __VUE_I18N_FULL_INSTALL__: true,
    __VUE_I18N_LEGACY_API__: false,
    __INTLIFY_PROD_DEVTOOLS__: false,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // Générer les source maps seulement quand on les uploade (sinon inutile).
    sourcemap: SENTRY_AUTH_TOKEN ? 'hidden' : false,
  },
  server: {
    port: 5192,
    allowedHosts: ['dashboard.otoninja.dev'],
  },
})
