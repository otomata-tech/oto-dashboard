<script setup lang="ts">
// Table d'agrégat de signaux d'usage (ADR 0017) — « manques signalés » (gap) et
// « qualité des outils » (tool_feedback) ont la MÊME forme : un libellé, un `kind`
// coloré, un compteur, une date + les rapporteurs. Deux niveaux les affichent
// désormais (plateforme et org), soit quatre tables : d'où un composant plutôt
// qu'un copier-coller de plus.
//
// Présentationnel. Le drill-down (signaux bruts) est OPTIONNEL — il n'existe qu'au
// niveau plateforme, où l'API sert les signaux ligne à ligne : un parent qui ne
// passe pas `expandedKey` obtient des lignes non cliquables, pas un clic mort.
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import ConsoleTable from '@/components/console/ConsoleTable.vue'
import Tag from '@/components/console/Tag.vue'

export interface SignalAggRow {
  /** libellé de la 1re colonne : l'intention (gap) ou le nom d'outil (tool_feedback) */
  label: string | null
  kind: string
  n: number
  last_at: string
  users: string[]
}

withDefaults(defineProps<{
  title: string
  sub: string
  rows: SignalAggRow[]
  loaded: boolean
  empty: string
  labelHead: string
  kindHead: string
  /** ton par `kind` ; défaut si absent de la table */
  tones?: Record<string, 'olive' | 'saffron' | 'terra' | 'cobalt' | 'ink'>
  defaultTone?: 'olive' | 'saffron' | 'terra' | 'cobalt' | 'ink'
  /** le libellé est-il un identifiant technique (rendu en mono) ? */
  mono?: boolean
  /** clé de la ligne dépliée — omis ⇒ pas de drill-down, lignes non cliquables */
  expandedKey?: string | null
}>(), { tones: () => ({}), defaultTone: 'ink', mono: false, expandedKey: undefined })

const emit = defineEmits<{ (e: 'open', row: SignalAggRow): void }>()

const key = (r: SignalAggRow) => `${r.label}:${r.kind}`
const fmt = (ts: string | null) => (ts ? ts.replace('T', ' ').slice(0, 16) : '—')
// Rapporteurs : compact (2 premiers + compteur) — la liste complète est dans le détail.
function fmtUsers(users: string[] | undefined): string {
  if (!users?.length) return '—'
  const shown = users.slice(0, 2).join(', ')
  return users.length > 2 ? `${shown} +${users.length - 2}` : shown
}
</script>

<template>
  <ConsoleCard :title="title" :sub="sub" flush>
    <ConsoleTable :rows="rows" :loaded="loaded" :empty="empty">
      <template #head>
        <th>{{ labelHead }}</th><th>{{ kindHead }}</th><th>n</th><th>dernier · par</th>
      </template>
      <template #row="{ row: r }">
        <tr :style="expandedKey !== undefined ? 'cursor: pointer' : undefined"
          @click="expandedKey !== undefined && emit('open', r)">
          <td>
            <code v-if="mono" class="mono" style="font-weight: 600">{{ r.label || '—' }}</code>
            <template v-else>{{ r.label || '—' }}</template>
          </td>
          <td><Tag :tone="tones[r.kind] || defaultTone">{{ r.kind }}</Tag></td>
          <td class="mono">{{ r.n }}</td>
          <td>
            <div class="dim" style="font-size: 12px">{{ fmt(r.last_at) }}</div>
            <div style="font-size: 11px; color: var(--color-faint)">{{ fmtUsers(r.users) }}</div>
          </td>
        </tr>
        <tr v-if="expandedKey && expandedKey === key(r)">
          <td colspan="4" style="background: var(--color-paper-3); padding: 0">
            <slot name="expand" :row="r" />
          </td>
        </tr>
      </template>
    </ConsoleTable>
  </ConsoleCard>
</template>
