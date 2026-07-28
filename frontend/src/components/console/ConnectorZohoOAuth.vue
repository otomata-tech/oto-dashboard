<script setup lang="ts">
// Connexion Zoho « server-based » — SECOND mode, à côté du Self Client (qui reste).
// Les deux produisent le même credential : seule l'acquisition change. Ici l'utilisateur
// ne colle rien, il consent chez Zoho et revient connecté.
//
// L'intérêt : c'est OTO qui déclare les scopes dans l'URL d'autorisation. En Self Client
// c'est l'utilisateur qui les coche à la main, et trois incidents sont venus de là (un
// credential Desk limité à `articles.READ` nous a privés de la recherche native).
//
// La RÉGION est demandée avant tout : l'app OAuth et le token sont liés à leur data
// center — un client `.eu` sur `accounts.zoho.com` est rejeté par un `invalid_client`
// opaque. On ne peut donc pas la deviner.
import { computed, ref, watch } from 'vue'
import Btn from './Btn.vue'
import Dot from './Dot.vue'
import { getZohoOauthModes, startZohoOauth } from '@/api/console'
import { useToast } from '@/composables/useToast'
import { humanize } from '@/lib/errors'
import type { MyConnector } from '@/types/api'

const props = defineProps<{ connector: MyConnector }>()
const { toast } = useToast()

const REGIONS = [
  { value: 'eu', label: 'Europe (zoho.eu)' },
  { value: 'com', label: 'International (zoho.com)' },
  { value: 'in', label: 'Inde (zoho.in)' },
  { value: 'au', label: 'Australie (zoho.com.au)' },
  { value: 'jp', label: 'Japon (zoho.jp)' },
  { value: 'ca', label: 'Canada (zohocloud.ca)' },
]

const region = ref<string>('eu')
const busy = ref(false)
const platformApp = ref<boolean | null>(null)
const scopes = ref<string[]>([])

async function loadModes() {
  try {
    const m = await getZohoOauthModes(props.connector.name, region.value)
    platformApp.value = m.platform_app
    scopes.value = m.scopes
  } catch {
    platformApp.value = null   // l'encart reste utilisable, sans la précision
  }
}
watch(region, loadModes, { immediate: true })

// Sans app de plateforme pour cette région, on s'appuie sur l'app de l'org : il faut
// donc que client_id + client_secret soient déjà posés. Le dire AVANT le clic.
const needsOrgApp = computed(() => platformApp.value === false)

async function connect() {
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
    <div class="zo-head">
      <Dot tone="cobalt" :size="8" />
      <span class="zo-title">ou connecte-toi directement à Zoho</span>
    </div>
    <p class="helptext" style="margin: 8px 0 12px">
      Tu n'as rien à copier : tu autorises oto chez Zoho et tu reviens connecté.
      oto demande lui-même les autorisations nécessaires.
    </p>

    <label class="zo-field">
      <span class="eyebrow">région de ton compte Zoho</span>
      <select v-model="region" class="inp sm">
        <option v-for="r in REGIONS" :key="r.value" :value="r.value">{{ r.label }}</option>
      </select>
    </label>

    <p v-if="scopes.length" class="helptext zo-scopes">
      autorisations demandées : {{ scopes.join(', ') }}
    </p>

    <p v-if="needsOrgApp" class="helptext zo-warn">
      Aucune app oto n'est publiée pour cette région : renseigne d'abord
      <strong>client id</strong> et <strong>client secret</strong> de ton app Zoho
      ci-dessus, puis reviens ici — oto se chargera des autorisations.
    </p>

    <Btn kind="mini" :disabled="busy" style="margin-top: 12px" @click="connect">
      {{ busy ? 'redirection…' : 'Se connecter avec Zoho' }}
    </Btn>
  </div>
</template>

<style scoped>
.zo { margin-top: 14px; padding-top: 14px; border-top: 1px dashed var(--color-hair-classic); }
.zo-head { display: flex; align-items: center; gap: 9px; }
.zo-title { font-size: 12.5px; font-weight: 600; }
.zo-field { display: flex; flex-direction: column; gap: 6px; max-width: 280px; }
.zo-scopes { margin: 10px 0 0; color: var(--color-mute); }
.zo-warn { margin: 10px 0 0; color: var(--color-terra); }
</style>
