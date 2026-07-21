<script setup lang="ts">
// VUE UNIQUE de gestion des connecteurs, paramétrée par scope (user/team/org/plateforme).
// Le scope est dérivé de `useScope().level` ; tout ce qui diffère vit dans l'adaptateur
// (`pickAdapter`). Socle réutilisé tel quel : `ConnectorList` (table + recherche + chips +
// tri) + `ConnectorScopeDrawer` (détail). FRAGMENT sans `.content-inner` : chaque vue
// d'entrée (TeamConnectorsView, AdminConnectorsView…) fournit le wrapper + ses cartes
// header/footer propres au scope.
import { computed, onMounted, ref } from 'vue'
import ConnectorList from '@/components/console/ConnectorList.vue'
import ConnectorIdentityCell from '@/components/console/ConnectorIdentityCell.vue'
import FormDialog from '@/components/console/FormDialog.vue'
import CredentialFieldsDialog from '@/components/console/CredentialFieldsDialog.vue'
import OtoSelect from '@/components/console/OtoSelect.vue'
import ConnectorScopeCell from './ConnectorScopeCell.vue'
import ConnectorScopeDrawer from './ConnectorScopeDrawer.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useFormDialog } from '@/composables/useFormDialog'
import { useScope } from '@/composables/useScope'
import { pickAdapter } from './registry'
import type { CredentialDialogSpec, ScopeCtx } from './adapter'

const { toast } = useToast()
const { confirmAction } = usePrompt()
const { formDialog, formDialogOpen, openForm } = useFormDialog()

// CredentialFieldsDialog hébergé ici, ouvert par l'adaptateur via ctx.openCredential.
const credSpec = ref<CredentialDialogSpec | null>(null)
const credOpen = ref(false)
function openCredential(spec: CredentialDialogSpec) { credSpec.value = spec; credOpen.value = true }

const ctx: ScopeCtx = { openForm, openCredential, confirmAction, toast }
const { level } = useScope()
const adapter = pickAdapter(level.value, ctx)

const selectedKey = ref<string | null>(null)
const selectedRow = computed(() => adapter.rows.value.find((r) => adapter.key(r) === selectedKey.value) ?? null)

// Lentilles (pré-filtre segmenté, scope USER) : la vue tient l'état + filtre en amont
// (ConnectorList fait ensuite recherche/chips/tri sur les lignes filtrées).
const lensKey = ref<string>(adapter.lenses?.[0]?.key ?? '')
const shownRows = computed(() => {
  const l = adapter.lenses?.find((x) => x.key === lensKey.value)
  return l ? adapter.rows.value.filter((r) => l.match(r)) : adapter.rows.value
})
const lensCount = (key: string) => {
  const l = adapter.lenses?.find((x) => x.key === key)
  return l ? adapter.rows.value.filter((r) => l.match(r)).length : 0
}
// Options du dropdown « Statut » (remplace le sélecteur segmenté all/connected/…).
const lensOptions = computed(() => (adapter.lenses ?? []).map((l) => ({ value: l.key, label: `${l.label} (${lensCount(l.key)})` })))

onMounted(async () => {
  await adapter.load()
  // Lentille par défaut (P5) : atterrir sur MES connecteurs (« connectés » = installés)
  // si j'en ai, sinon le catalogue complet (« tous ») — un compte neuf (socle vide, 0
  // installé) voit tout pour choisir. Scope USER seulement (seul à porter ces lentilles).
  if (adapter.scope === 'user' && adapter.lenses?.some((l) => l.key === 'connected'))
    lensKey.value = lensCount('connected') > 0 ? 'connected' : 'all'
  // Retour d'un flux de connexion (oauth google/fédéré, hosted unipile) : ?<x>=connected|error
  // (scope USER seulement — les autres surfaces ne déclenchent pas de redirect d'auth).
  if (adapter.scope !== 'user') return
  const sp = new URLSearchParams(window.location.search)
  let touched = false
  for (const [k, v] of sp.entries()) {
    if (k === 'channel') continue
    if (v === 'connected' || v === 'subscribed') { toast(`${k} connecté`); touched = true }
    else if (v === 'error' || v === 'failed') { toast(`échec de la connexion ${k}`); touched = true }
    else if (v === 'cancel') touched = true
  }
  if (touched) window.history.replaceState({}, '', window.location.pathname)
})
</script>

<template>
  <p v-if="adapter.error.value" class="helptext" style="color: var(--color-terra-ink)">{{ adapter.error.value }}</p>

  <ConnectorList :items="shownRows" :item-key="adapter.key" :label="adapter.label"
    :search-text="adapter.searchText" :category="adapter.category" :sort-rank="adapter.sortRank"
    :title="adapter.listTitle" :sub="adapter.listSub" :search-placeholder="adapter.searchPlaceholder"
    :category-values="adapter.categoryValues?.()" :selectable="adapter.hasDrawer"
    v-model:selected-key="selectedKey">
    <template v-if="adapter.lenses" #controls>
      <OtoSelect v-model="lensKey" :options="lensOptions" placeholder="Statut" aria-label="Statut" size="sm" />
    </template>
    <template #head>
      <th style="width: 42%">connecteur</th>
      <th v-for="col in adapter.columns" :key="col.key" :style="col.width ? { width: col.width } : undefined">{{ col.label }}</th>
      <th v-if="adapter.hasDrawer" style="width: 22px"></th>
    </template>
    <template #row="{ item }">
      <td><ConnectorIdentityCell :meta="adapter.meta(item)" :label="adapter.label(item)" /></td>
      <td v-for="col in adapter.columns" :key="col.key">
        <ConnectorScopeCell :vm="adapter.cell(item, col.key)" />
      </td>
      <td v-if="adapter.hasDrawer" class="csv-chev">›</td>
    </template>
    <template #empty>
      <p v-if="adapter.ready.value" class="helptext" style="text-align: center; padding: 18px">{{ adapter.emptyText }}</p>
    </template>
  </ConnectorList>

  <ConnectorScopeDrawer v-if="selectedRow" :adapter="adapter" :row="selectedRow" @close="selectedKey = null" />

  <FormDialog v-if="formDialog" v-model:open="formDialogOpen"
    :title="formDialog.title" :description="formDialog.description"
    :fields="formDialog.fields" :submit-label="formDialog.submitLabel" :on-confirm="formDialog.onConfirm" />
  <CredentialFieldsDialog v-if="credSpec" v-model:open="credOpen"
    :label="credSpec.label" :fields="credSpec.fields" :single="credSpec.single"
    :on-confirm="credSpec.onConfirm" :verify="credSpec.verify" />
</template>

<style scoped>
.csv-chev { text-align: right; color: var(--color-faint); font-size: 15px; }
</style>
