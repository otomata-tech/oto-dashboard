<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/composables/useAuth'

const { t } = useI18n()
const { login } = useAuth()
const route = useRoute()
// Arrivée depuis « rejoindre la waitlist » (oto.ninja, ?join) → on enchaîne
// DIRECTEMENT sur l'écran d'inscription Logto, sans interstitiel à bouton
// (l'ancien écran « créer mon compte » était un double écran inutile). On garde
// un état de redirection minimal + un repli cliquable si le rebond JS traîne.
// Arrivée avec ?otl (magic link, ex. email d'approbation waitlist) → connexion
// silencieuse avec l'OTT (pas de saisie de code).
const join = computed(() => route.query.join !== undefined)
const otl = computed(() => (route.query.otl as string) || '')
const loginHint = computed(() => (route.query.login_hint as string) || '')
const redirecting = ref(false)

function go() {
  redirecting.value = true
  if (otl.value) login(undefined, 'sign_in', loginHint.value || undefined, otl.value)
  else login(undefined, 'register')
}

onMounted(() => {
  if (join.value || otl.value) go()
})
</script>

<template>
  <div class="console-root" style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--color-bg)">
    <section class="card" style="max-width: 380px; width: 100%; text-align: center; padding: 32px 28px">
      <div style="display: flex; flex-direction: column; align-items: center; gap: 14px">
        <span class="o-medallion o-medallion-sm" style="width: 44px; height: 44px" aria-label="Oto" role="img" />

        <template v-if="join || otl">
          <div>
            <div style="font-size: 18px; font-weight: 700; letter-spacing: -0.02em">{{ otl ? t('auth.login.titleConnect') : t('auth.login.titleJoin') }}</div>
            <div class="env" style="font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--color-faint); margin-top: 3px">{{ otl ? t('auth.login.envInvite') : t('auth.login.envJoin') }}</div>
          </div>
          <p class="helptext" style="margin: 4px 0 6px">
            {{ otl ? t('auth.login.connecting') : t('auth.login.redirectingSignup') }}
          </p>
          <a href="#" @click.prevent="go" style="font-size: 13px; color: var(--color-mute); text-decoration: underline">
            {{ t('auth.login.fallbackPrefix') }} {{ otl ? t('auth.login.signIn') : t('auth.login.createAccount') }}
          </a>
        </template>

        <template v-else>
          <div>
            <div style="font-size: 18px; font-weight: 700; letter-spacing: -0.02em">{{ t('auth.login.consoleTitle') }}</div>
            <div class="env" style="font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--color-faint); margin-top: 3px">{{ t('auth.login.consoleEnv') }}</div>
          </div>
          <p class="helptext" style="margin: 4px 0 6px">
            {{ t('auth.login.consoleHelp') }}
          </p>
          <button class="btn" @click="() => login()">{{ t('auth.login.signInBtn') }}</button>
        </template>
      </div>
    </section>
  </div>
</template>
