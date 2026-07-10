<script setup lang="ts">
// Bandeau FILE DE TRAVAIL (ADR 0046 D) — supervision : les rows sous bail
// (`_claimed_by`), l'état du bail (actif / expiré — un bail expiré sera recyclé
// par le prochain claim), et la libération FORCÉE (humaine, sans garde de worker).
import Btn from './Btn.vue'
import Tag from './Tag.vue'
import type { DatastoreRow } from '@/types/api'
import { absDate } from '@/lib/cellRender'

const props = defineProps<{
  rows: DatastoreRow[]
  canWrite: boolean
  titleField?: string | null // field role="title" du schéma (fallback _id)
}>()
const emit = defineEmits<{ open: [row: DatastoreRow]; release: [rowId: string] }>()

function titleOf(row: DatastoreRow): string {
  const v = props.titleField ? row[props.titleField] : null
  return v != null && v !== '' ? String(v) : row._id
}
function expired(row: DatastoreRow): boolean {
  const t = Date.parse(String(row._claimed_until ?? ''))
  return !Number.isNaN(t) && t < Date.now()
}
</script>

<template>
  <div class="dsq">
    <span class="dsq-head">file de travail · {{ rows.length }} en cours</span>
    <div v-for="row in rows" :key="row._id" class="dsq-item">
      <button class="dsq-title" :title="row._id" @click="emit('open', row)">{{ titleOf(row) }}</button>
      <Tag tone="cobalt">{{ row._claimed_by }}</Tag>
      <Tag v-if="expired(row)" tone="terra" title="le prochain claim recycle cette row">bail expiré</Tag>
      <span v-else class="dsq-lease">bail jusqu'à {{ absDate(String(row._claimed_until ?? '')) }}</span>
      <Btn v-if="canWrite" kind="mini" title="libération forcée (sans garde de worker)"
        @click="emit('release', row._id)">Libérer</Btn>
    </div>
  </div>
</template>

<style scoped>
.dsq {
  display: flex; flex-direction: column; gap: 4px; padding: 8px 16px;
  border-bottom: 1px solid var(--color-hair-soft); background: var(--color-paper-2);
}
.dsq-head { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; font-weight: 700; color: var(--color-mute); }
.dsq-item { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 12px; }
.dsq-title {
  font: inherit; font-size: 12.5px; font-weight: 600; color: var(--color-ink);
  border: 0; background: none; cursor: pointer; padding: 0; text-align: left;
}
.dsq-title:hover { color: var(--color-cobalt); text-decoration: underline; }
.dsq-lease { font-size: 11px; color: var(--color-mute); }
</style>
