<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/composables/useAuth'

// Session Logto morte (refresh token expiré, `getAccessToken` lève `stale_session`) :
// le dashboard ne peut plus rien charger — rester dans le shell laisserait un menu
// inerte et des vues vides. On sort donc DU shell et on relance directement le flow
// Logto. Si la session OP est encore vivante, la reconnexion est silencieuse (retour
// immédiat sur la page). Même patron que LoginGate ; repli cliquable si le rebond
// JS traîne.
const { t } = useI18n()
const { login } = useAuth()
const route = useRoute()
const redirecting = ref(false)

function go() {
  redirecting.value = true
  login(route.fullPath) // conserve la destination → on revient ici après reconnexion
}

onMounted(go)
</script>

<template>
  <div class="console-root" style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--color-bg)">
    <section class="card" style="max-width: 380px; width: 100%; text-align: center; padding: 32px 28px">
      <div style="display: flex; flex-direction: column; align-items: center; gap: 14px">
        <span class="o-medallion o-medallion-sm" style="width: 44px; height: 44px" aria-label="Oto" role="img" />
        <div>
          <div style="font-size: 18px; font-weight: 700; letter-spacing: -0.02em">{{ t('auth.sessionExpired.title') }}</div>
          <div class="env" style="font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--color-faint); margin-top: 3px">{{ t('auth.sessionExpired.kicker') }}</div>
        </div>
        <p class="helptext" style="margin: 4px 0 6px">
          {{ t('auth.sessionExpired.body') }}
        </p>
        <a href="#" @click.prevent="go" style="font-size: 13px; color: var(--color-mute); text-decoration: underline">
          {{ t('auth.sessionExpired.fallback') }}
        </a>
      </div>
    </section>
  </div>
</template>
