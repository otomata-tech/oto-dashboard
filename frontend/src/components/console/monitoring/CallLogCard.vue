<script setup lang="ts">
// Journal brut d'appels d'outils (récent d'abord) — carte réutilisable. Consomme une
// liste `ToolCall[]` par prop, donc branchable partout : plateforme (tous), fiche user
// admin (via sub), activité perso (mes appels). Filtre ok/erreurs optionnel intégré.
// `showUser` ajoute la colonne « par » (email du caller) — pour les surfaces
// multi-appelants (journal plateforme) ; inutile quand la liste est déjà scopée user.
//
// `loadDetail` (optionnel) rend les lignes DÉPLIABLES : la carte reste présentationnelle
// (elle n'importe aucun client d'API), l'appelant injecte le chargeur. Absent → pas
// d'expansion : les surfaces non-admin (activité perso) n'ont pas accès à la fiche,
// qui est platform-admin — un levier inerte serait pire que pas de levier.
import { computed, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import ConsoleTable from '@/components/console/ConsoleTable.vue'
import Dot from '@/components/console/Dot.vue'
import ErrLabel from '@/components/console/ErrLabel.vue'
import CallDetailPanel from './CallDetailPanel.vue'
import type { ToolCall, ToolCallDetail } from '@/types/api'
import { fmtDateTime } from '@/types/api'
import { fmtMs } from '@/lib/monitoring'
import { humanize } from '@/lib/errors'

const props = withDefaults(defineProps<{
  calls: ToolCall[]
  loaded: boolean
  busy?: boolean
  title?: string
  sub?: string
  filterable?: boolean
  showUser?: boolean
  emptyLabel?: string
  loadDetail?: (id: number) => Promise<ToolCallDetail>
}>(), { filterable: false, showUser: false })

const emit = defineEmits<{
  (e: 'filter', axis: 'run_id' | 'session_id' | 'sub' | 'tool', value: string): void
}>()

type Filter = 'all' | 'ok' | 'errors'
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'tous' }, { key: 'ok', label: 'ok' }, { key: 'errors', label: 'erreurs' },
]
const filter = ref<Filter>('all')
const filtered = computed(() =>
  props.filterable
    ? props.calls.filter((c) => filter.value === 'all' || (filter.value === 'errors' ? !c.ok : c.ok))
    : props.calls,
)
const errCount = computed(() => props.calls.filter((c) => !c.ok).length)

// ── drill-down : une ligne ouverte à la fois, fiche chargée à la demande ──
const openId = ref<number | null>(null)
const detail = ref<ToolCallDetail | null>(null)
const detailLoading = ref(false)
const detailError = ref<string | null>(null)

const colspan = computed(() => (props.showUser ? 6 : 5))

async function toggle(call: ToolCall) {
  if (!props.loadDetail) return
  if (openId.value === call.id) { openId.value = null; return }
  openId.value = call.id
  detail.value = null
  detailError.value = null
  detailLoading.value = true
  try {
    const d = await props.loadDetail(call.id)
    // Course : une autre ligne a pu être ouverte pendant le chargement.
    if (openId.value === call.id) detail.value = d
  } catch (e) {
    if (openId.value === call.id) detailError.value = humanize(e)
  } finally {
    if (openId.value === call.id) detailLoading.value = false
  }
}
</script>

<template>
  <ConsoleCard flush :title="title || 'journal d’appels'" :sub="sub">
    <template #actions>
      <slot name="actions">
        <div v-if="filterable" class="seg">
          <button v-for="f in FILTERS" :key="f.key"
            type="button" :class="{ on: filter === f.key }" @click="filter = f.key">{{ f.label }}</button>
        </div>
        <span v-else class="dim" style="font-size: 11.5px">
          {{ calls.length }} appels · <ErrLabel v-if="errCount">{{ errCount }} err</ErrLabel><span v-else class="dim">0 err</span>
        </span>
      </slot>
    </template>
    <ConsoleTable :rows="filtered" :busy="busy" :loaded="loaded"
      :empty="emptyLabel || 'aucun appel dans la fenêtre'">
      <template #head>
        <th style="width: 18px"></th><th>outil</th>
        <th v-if="showUser">par</th>
        <th>détail</th><th class="num">durée</th><th class="num">quand</th>
      </template>
      <template #row="{ row: c }">
        <tr :class="{ crow: !!loadDetail, sel: openId === c.id }" @click="toggle(c)">
          <td><Dot :tone="c.ok ? 'olive' : 'terra'" :size="7" /></td>
          <td><code class="mono">{{ c.tool_name }}</code></td>
          <td v-if="showUser" class="dim" style="font-size: 12px">{{ c.email || c.name || c.sub || 'anonyme' }}</td>
          <td><ErrLabel v-if="c.error">{{ c.error }}</ErrLabel><span v-else class="dim">ok</span></td>
          <td class="num dim">{{ fmtMs(c.duration_ms) }}</td>
          <td class="num dim">{{ fmtDateTime(c.called_at) }}</td>
        </tr>
        <tr v-if="openId === c.id">
          <td :colspan="colspan" style="background: var(--color-paper-3); padding: 0">
            <p v-if="detailError" class="helptext" style="color: var(--color-terra-ink); padding: 12px 16px">
              {{ detailError }}
            </p>
            <CallDetailPanel v-else :call="detail" :loading="detailLoading"
              @filter="(axis, value) => emit('filter', axis, value)" />
          </td>
        </tr>
      </template>
    </ConsoleTable>
  </ConsoleCard>
</template>
