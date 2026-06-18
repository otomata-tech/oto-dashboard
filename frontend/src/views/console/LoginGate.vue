<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth'

const { login } = useAuth()
const route = useRoute()
// Arrivée depuis « rejoindre la waitlist » (oto.ninja, ?join) → accueil orienté
// création de compte / alpha, et on ouvre direct l'écran d'inscription Logto.
const join = computed(() => route.query.join !== undefined)
</script>

<template>
  <div class="console-root" style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--color-bg)">
    <section class="card" style="max-width: 380px; width: 100%; text-align: center; padding: 32px 28px">
      <div style="display: flex; flex-direction: column; align-items: center; gap: 14px">
        <span class="o-medallion o-medallion-sm" style="width: 44px; height: 44px; font-size: 22px">o</span>

        <template v-if="join">
          <div>
            <div style="font-size: 18px; font-weight: 700; letter-spacing: -0.02em">rejoindre oto</div>
            <div class="env" style="font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--color-faint); margin-top: 3px">alpha · sur invitation</div>
          </div>
          <p class="helptext" style="margin: 4px 0 6px">
            crée ton compte otomata pour rejoindre l'alpha d'oto. l'accès s'ouvre par vagues —
            tu es ajouté à la liste d'attente et on te prévient dès l'ouverture.
          </p>
          <button class="btn" @click="() => login(undefined, 'register')">créer mon compte</button>
          <a href="#" @click.prevent="() => login()" style="font-size: 13px; color: var(--color-mute); text-decoration: underline">
            déjà un compte ? se connecter
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
