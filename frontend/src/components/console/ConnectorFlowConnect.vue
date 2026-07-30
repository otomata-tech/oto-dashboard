<script setup lang="ts">
// Le geste « connecter » d'un connecteur, rendu depuis son DESCRIPTEUR — jamais depuis
// son nom.
//
// Ce composant remplace `ConnectorZohoOAuth.vue`, qui était monté derrière un
// `['zoho','zohodesk','zohoanalytics'].includes(name)`. Salesforce avait exactement la
// même forme côté backend et n'était pas dans la liste : aucun bouton, et un client ne
// pouvait pas finir sa connexion. Ici, tout ce qui variait d'un connecteur à l'autre —
// le libellé du geste, les valeurs à fournir, leurs options — vient de
// `connector.connect` (backend `connector_flow`).
import { computed, ref } from 'vue'
import Btn from '@/components/console/Btn.vue'
import Dot from '@/components/console/Dot.vue'
import { startConnectorFlow } from '@/api/console'
import { useToast } from '@/composables/useToast'
import { humanize } from '@/lib/errors'
import type { MyConnector, ProviderStatus } from '@/types/api'

const props = defineProps<{
  connector: MyConnector
  /** Ouvre le formulaire de credential — les prérequis se posent là. */
  configure: () => void
  /** L'état backend de CE connecteur pour l'utilisateur (`me.providers[name]`). */
  status?: ProviderStatus | null
}>()

const { toast } = useToast()
const busy = ref(false)
const flow = computed(() => props.connector.connect!)

// Valeurs du formulaire, initialisées aux défauts DÉCLARÉS.
const values = ref<Record<string, string>>(
  Object.fromEntries(flow.value.params.map((p) => [p.name, p.default])))

// ⚠️ « il reste une étape » vient du BACKEND (`pending_action`, seam status_hints), il
// n'est jamais recalculé ici. Surtout pas depuis la présence d'une clé : poser
// client_id + client_secret CRÉE le credential, donc `user_key_configured` devient vrai
// AVANT le consentement — gater là-dessus masquerait le bouton exactement au moment où
// il est nécessaire. Le code précédent portait déjà cet avertissement en commentaire.
const pending = computed(() => !!props.status?.pending_action)

async function start() {
  busy.value = true
  try {
    const { auth_url } = await startConnectorFlow(props.connector.name, values.value)
    window.location.href = auth_url
  } catch (e) {
    toast(humanize(e))
    busy.value = false
  }
}
</script>

<template>
  <div class="cfc dr-box">
    <div class="eyebrow" style="margin-bottom: 10px">{{ flow.label.toLowerCase() }}</div>

    <p v-if="pending" class="cfc-pending">
      <Dot tone="saffron" />{{ status?.pending_action }}
    </p>
    <p v-else class="helptext" style="margin: 0 0 12px">
      pose d'abord les identifiants de l'application sur la fiche, puis autorise oto —
      c'est l'autorisation qui produit le jeton, il ne se colle pas à la main.
    </p>

    <div v-for="p in flow.params" :key="p.name" class="cfc-field">
      <label :for="`cfc-${p.name}`">{{ p.label }}</label>
      <select v-if="p.options.length" :id="`cfc-${p.name}`" v-model="values[p.name]" class="inp sm">
        <option v-for="o in p.options" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
      <input v-else :id="`cfc-${p.name}`" v-model="values[p.name]" class="inp sm" type="text" >
      <span v-if="p.help" class="helptext">{{ p.help }}</span>
    </div>

    <div class="cfc-actions">
      <Btn kind="mini" :disabled="busy" @click="start">
        {{ busy ? 'ouverture…' : flow.label }}
      </Btn>
      <Btn kind="mini" variant="ghost" @click="configure">identifiants de l'application</Btn>
    </div>
  </div>
</template>

<style scoped>
.cfc { display: flex; flex-direction: column; gap: 10px }
.cfc-pending {
  display: flex; align-items: center; gap: 8px; margin: 0 0 4px;
  font-size: 12.5px; font-weight: 600; color: var(--color-ink-soft);
}
.cfc-field { display: flex; flex-direction: column; gap: 4px }
.cfc-field label { font-size: 12px; font-weight: 600; color: var(--color-ink-soft) }
.cfc-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px }
</style>
