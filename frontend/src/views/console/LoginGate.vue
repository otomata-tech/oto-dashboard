<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth'

const { login } = useAuth()
const route = useRoute()
// Arrivée depuis « créer un compte » (oto.cx, ?signup) → on enchaîne DIRECTEMENT
// sur l'écran d'inscription Logto, sans interstitiel à bouton. On garde un état de
// redirection minimal + un repli cliquable si le rebond JS traîne.
// Arrivée avec ?otl (magic link Logto) → connexion silencieuse avec l'OTT (pas de
// saisie de code).
const signup = computed(() => route.query.signup !== undefined)
const otl = computed(() => (route.query.otl as string) || '')
const loginHint = computed(() => (route.query.login_hint as string) || '')
const redirecting = ref(false)

function go() {
  redirecting.value = true
  if (otl.value) login(undefined, 'sign_in', loginHint.value || undefined, otl.value)
  else login(undefined, 'register')
}

onMounted(() => {
  if (signup.value || otl.value) go()
})
</script>

<template>
  <div class="console-root" style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--color-bg)">
    <section class="card" style="max-width: 380px; width: 100%; text-align: center; padding: 32px 28px">
      <div style="display: flex; flex-direction: column; align-items: center; gap: 14px">
        <span class="o-medallion o-medallion-sm" style="width: 44px; height: 44px" aria-label="Oto" role="img" />

        <template v-if="signup || otl">
          <div>
            <div style="font-size: 18px; font-weight: 700; letter-spacing: -0.02em">{{ otl ? 'connexion à oto' : 'rejoindre oto' }}</div>
            <div class="env" style="font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--color-faint); margin-top: 3px">{{ otl ? 'sur invitation' : 'création de compte' }}</div>
          </div>
          <p class="helptext" style="margin: 4px 0 6px">
            {{ otl ? 'connexion en cours…' : 'redirection vers la création de compte…' }}
          </p>
          <a href="#" @click.prevent="go" style="font-size: 13px; color: var(--color-mute); text-decoration: underline">
            la redirection ne se lance pas ? {{ otl ? 'Se connecter' : 'Créer mon compte' }}
          </a>
        </template>

        <template v-else>
          <div>
            <div style="font-size: 18px; font-weight: 700; letter-spacing: -0.02em">oto console</div>
            <div class="env" style="font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--color-faint); margin-top: 3px">app.oto.ninja</div>
          </div>
          <p class="helptext" style="margin: 4px 0 6px">
            connectez-vous avec votre compte otomata pour gérer vos connecteurs, vos procédures et votre org.
          </p>
          <button class="btn" @click="() => login()">Se connecter</button>
        </template>
      </div>
    </section>
  </div>
</template>
