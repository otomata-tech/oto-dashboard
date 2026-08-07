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
const copie = ref(false)
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

// Une app est-elle déjà disponible (la sienne, celle de l'org, ou celle d'oto) ?
// Vient du BACKEND (`connect.app_ready`) : le front ne peut pas le deviner — il ne voit
// ni le coffre ni la cascade. `undefined`/`null` ⟹ question non déclarée : on retombe
// sur la consigne longue plutôt que de promettre à tort.
const appReady = computed(() => flow.value.app_ready === true)

async function copierCallback() {
  await navigator.clipboard.writeText(flow.value.callback_url!)
  copie.value = true
  setTimeout(() => { copie.value = false }, 1800)
}

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
    <p v-else-if="appReady" class="helptext" style="margin: 0 0 12px">
      rien à créer : l'application est déjà en place. choisis ta région, autorise oto,
      et c'est fait — c'est l'autorisation qui produit le jeton.
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
    </div>

    <!-- Apporter SA propre application reste possible — une org qui veut voir la sienne
         dans ses journaux la pose, et elle prime sur celle d'oto. Mais quand une app est
         déjà disponible, mettre ces éléments en avant décrit un travail que l'utilisateur
         n'a pas à faire : on les REPLIE sans jamais les retirer. Ouvert par défaut dans le
         cas inverse, où ils sont l'étape obligatoire.
         L'URL de retour est DÉRIVÉE par le backend (elle vivait en prose dans la doc, avec
         le domaine de prod écrit à la main — donc fausse depuis la preprod). -->
    <details class="cfc-own" :open="!appReady">
      <summary>{{ appReady ? 'utiliser ma propre application' : 'identifiants de l’application' }}</summary>

      <div v-if="flow.callback_url" class="cfc-cb">
        <label>URL de retour à enregistrer dans l'application</label>
        <div class="cfc-cb-row">
          <code>{{ flow.callback_url }}</code>
          <Btn kind="mini" variant="ghost" @click="copierCallback">
            {{ copie ? 'copiée' : 'copier' }}
          </Btn>
        </div>
        <span class="helptext">au caractère près — un espace ou un slash final en trop suffit à faire échouer l'autorisation</span>
      </div>

      <div class="cfc-actions">
        <Btn kind="mini" variant="ghost" @click="configure">identifiants de l'application</Btn>
      </div>
    </details>
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
.cfc-own { display: flex; flex-direction: column; gap: 10px }
.cfc-own > summary {
  cursor: pointer; font-size: 12px; font-weight: 600;
  color: var(--color-ink-soft); list-style-position: inside;
}
.cfc-cb { display: flex; flex-direction: column; gap: 4px }
.cfc-cb label { font-size: 12px; font-weight: 600; color: var(--color-ink-soft) }
.cfc-cb-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap }
.cfc-cb-row code {
  font-family: var(--font-mono); font-size: 11.5px; padding: 4px 8px;
  border-radius: var(--radius-md); background: var(--color-paper-3);
  border: 1px solid var(--color-hair-soft); word-break: break-all;
}
</style>
