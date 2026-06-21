<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth'

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
        <span class="o-medallion o-medallion-sm" style="width: 44px; height: 44px; font-size: 22px">o</span>

        <template v-if="join || otl">
          <div>
            <div style="font-size: 18px; font-weight: 700; letter-spacing: -0.02em">{{ otl ? 'connexion à oto' : 'rejoindre oto' }}</div>
            <div class="env" style="font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--color-faint); margin-top: 3px">alpha · sur invitation</div>
          </div>
          <p class="helptext" style="margin: 4px 0 6px">
            {{ otl ? 'connexion en cours…' : 'redirection vers la création de compte…' }}
          </p>
          <a href="#" @click.prevent="go" style="font-size: 13px; color: var(--color-mute); text-decoration: underline">
            la redirection ne se lance pas ? {{ otl ? 'se connecter' : 'créer mon compte' }}
          </a>
        </template>

        <template v-else>
          <div>
            <div style="font-size: 18px; font-weight: 700; letter-spacing: -0.02em">oto console</div>
            <div class="env" style="font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--color-faint); margin-top: 3px">app.oto.ninja</div>
          </div>
          <p class="helptext" style="margin: 4px 0 6px">
            sign in with your otomata account to manage connectors, doctrine and your org.
          </p>
          <button class="btn" @click="() => login()">sign in</button>
        </template>
      </div>
    </section>
  </div>
</template>
