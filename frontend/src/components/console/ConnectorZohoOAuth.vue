<script setup lang="ts">
// Connexion Zoho — le choix du MODE, rendu explicite.
//
// Zoho accepte deux façons d'obtenir le même credential (client_id + client_secret +
// refresh_token + région) : un **self client**, dont on colle le refresh token, ou une
// **app server-based**, où oto demande lui-même l'autorisation. Seule l'acquisition
// change ; le connecteur, la cascade et les outils ne voient aucune différence.
//
// Le mode était IMPLICITE — déduit de « as-tu rempli le refresh token ou pas ». D'où
// un formulaire de 5 champs dont on ne savait pas lesquels remplir, et deux boutons
// concurrents. On demande donc le mode d'abord, et chaque mode dit exactement quoi
// saisir. (Vécu 28/07 : six tentatives de pose, dont plusieurs refusées pour un champ
// vide que rien ne nommait.)
//
// Pourquoi le server-based est recommandé : c'est OTO qui déclare les scopes dans l'URL
// d'autorisation. En self client, l'utilisateur les coche à la main — trois incidents
// sont venus de là, dont un credential Desk limité qui nous a privés de la recherche.
import { computed, onMounted, ref } from 'vue'
import Btn from './Btn.vue'
import Dot from './Dot.vue'
import { getZohoOauthModes, startZohoOauth } from '@/api/console'
import { useToast } from '@/composables/useToast'
import { humanize } from '@/lib/errors'
import type { MyConnector } from '@/types/api'

const props = defineProps<{
  connector: MyConnector
  /** Ouvre le formulaire de credential (le même pour les deux modes). */
  configure: () => void
}>()
const { toast } = useToast()

const REGIONS = [
  { value: 'eu', label: 'Europe (zoho.eu)' },
  { value: 'com', label: 'International (zoho.com)' },
  { value: 'in', label: 'Inde (zoho.in)' },
  { value: 'au', label: 'Australie (zoho.com.au)' },
  { value: 'jp', label: 'Japon (zoho.jp)' },
  { value: 'ca', label: 'Canada (zohocloud.ca)' },
]

const mode = ref<'server' | 'self'>('server')
const region = ref('eu')
const busy = ref(false)
const hasApp = ref<boolean | null>(null)
const scopes = ref<string[]>([])

onMounted(async () => {
  try {
    const m = await getZohoOauthModes(props.connector.name)
    hasApp.value = m.has_app
    scopes.value = m.scopes
  } catch {
    hasApp.value = null   // l'encart reste utilisable, sans la précision
  }
})

// App déjà renseignée ⇒ il ne reste que le consentement.
const appReady = computed(() => hasApp.value === true)

async function consent() {
  busy.value = true
  try {
    const { auth_url } = await startZohoOauth(props.connector.name, region.value)
    window.location.href = auth_url
  } catch (e) {
    toast(humanize(e))
    busy.value = false
  }
}
</script>

<template>
  <div class="zo">
    <div class="eyebrow" style="margin-bottom: 10px">comment connecter {{ connector.label }} ?</div>

    <!-- Mode 1 — server-based -->
    <label class="zo-opt" :class="{ on: mode === 'server' }">
      <input v-model="mode" type="radio" value="server" >
      <div>
        <div class="zo-t">Laisser oto demander les autorisations<span class="zo-tag">recommandé</span></div>
        <p class="helptext zo-h">
          Tu crées une <strong>app server-based</strong> dans la console Zoho et tu renseignes
          <strong>client id</strong>, <strong>client secret</strong> et la <strong>région</strong>.
          Laisse <strong>refresh token</strong> et <strong>org id</strong> vides — oto obtient le
          jeton en te faisant autoriser, et demande lui-même les bonnes autorisations.
        </p>
      </div>
    </label>

    <!-- Mode 2 — self client -->
    <label class="zo-opt" :class="{ on: mode === 'self' }">
      <input v-model="mode" type="radio" value="self" >
      <div>
        <div class="zo-t">J'ai un self client</div>
        <p class="helptext zo-h">
          Tu génères toi-même le jeton dans la console Zoho et tu renseignes les
          <strong>quatre</strong> valeurs : client id, client secret, <strong>refresh token</strong>
          et la région. C'est toi qui choisis les autorisations au moment de le générer.
        </p>
      </div>
    </label>

    <!-- Mode server-based : deux temps, l'étape courante est mise en avant -->
    <template v-if="mode === 'server'">
      <div class="zo-steps">
        <div class="zo-step">
          <Dot :tone="appReady ? 'olive' : 'saffron'" :size="8" />
          <span :class="{ dim: appReady }">1. renseigner l'app</span>
          <Btn v-if="!appReady" kind="mini" @click="configure()">Renseigner l'app</Btn>
          <Btn v-else kind="mini" @click="configure()">Modifier</Btn>
        </div>
        <div class="zo-step">
          <Dot :tone="appReady ? 'saffron' : 'faint'" :size="8" />
          <span :class="{ dim: !appReady }">2. autoriser oto chez Zoho</span>
        </div>
      </div>

      <label v-if="appReady" class="zo-field">
        <span class="eyebrow">région de ton compte Zoho</span>
        <select v-model="region" class="inp sm">
          <option v-for="r in REGIONS" :key="r.value" :value="r.value">{{ r.label }}</option>
        </select>
      </label>

      <p v-if="appReady && scopes.length" class="helptext zo-scopes">
        autorisations demandées : {{ scopes.join(', ') }}
      </p>

      <Btn v-if="appReady" kind="mini" :disabled="busy" style="margin-top: 12px" @click="consent">
        {{ busy ? 'redirection…' : 'Autoriser oto chez Zoho' }}
      </Btn>
    </template>

    <!-- Mode self client : un seul geste -->
    <Btn v-else kind="mini" style="margin-top: 4px" @click="configure()">
      Renseigner les quatre valeurs
    </Btn>
  </div>
</template>

<style scoped>
.zo-opt {
  display: flex; gap: 10px; align-items: flex-start; cursor: pointer;
  padding: 10px 12px; border: 1px solid var(--color-hair); border-radius: var(--radius-md);
  margin-bottom: 8px; background: var(--color-surface);
}
.zo-opt.on { border-color: var(--color-saffron); }
.zo-opt input { margin-top: 3px; flex-shrink: 0; }
.zo-t { font-size: 12.5px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
.zo-tag {
  font-size: 10.5px; font-weight: 600; text-transform: lowercase;
  color: var(--color-olive-ink); background: var(--color-olive-soft);
  padding: 1px 7px; border-radius: var(--radius-pill);
}
.zo-h { margin: 5px 0 0; }
.zo-steps { display: flex; flex-direction: column; gap: 9px; margin: 14px 0 12px; }
.zo-step { display: flex; align-items: center; gap: 9px; font-size: 12.5px; font-weight: 600; }
.zo-field { display: flex; flex-direction: column; gap: 6px; max-width: 280px; }
.zo-scopes { margin: 10px 0 0; color: var(--color-mute); }
.dim { color: var(--color-faint); font-weight: 500; }
</style>
