<script setup lang="ts">
// Bandeau FILE DE TRAVAIL (ADR 0046 D) — supervision : les rows sous bail
// (`_claimed_by`), l'état du bail (actif / expiré — un bail expiré sera recyclé
// par le prochain claim), et la libération FORCÉE (humaine, sans garde de worker).
//
// Depuis oto-backend #723, le bail dit aussi POUR QUEL RUN (`_claimed_run`) : ce
// bandeau disait qu'un agent tenait une ligne, jamais lequel tenait laquelle. Le
// run est désormais cliquable — il ouvre le travail sur la page Automatisations.
import { computed } from 'vue'
import Btn from './Btn.vue'
import Tag from './Tag.vue'
import type { DatastoreRow } from '@/types/api'
import { absDate } from '@/lib/cellRender'
import { bailLigne } from '@/lib/bailDeLigne'

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

// Lu une fois pour toutes les lignes : sans instant commun, deux lignes du même
// bandeau se compareraient à deux « maintenant » différents.
const baux = computed(() => {
  const t = Date.now()
  return new Map(props.rows.map((r) => [r._id, bailLigne(r, t)]))
})
</script>

<template>
  <div class="dsq">
    <span class="dsq-head">file de travail · {{ rows.length }} en cours</span>
    <div v-for="row in rows" :key="row._id" class="dsq-item">
      <button class="dsq-title" :title="row._id" @click="emit('open', row)">{{ titleOf(row) }}</button>
      <Tag tone="cobalt">{{ row._claimed_by }}</Tag>
      <!-- Le travail qui la tient. ⚠️ « sans run » n'est pas une donnée manquante :
           c'est un bail pris à la main, ou par un agent qui n'a pas passé son run. -->
      <RouterLink
        v-if="baux.get(row._id)?.porteur === 'run'"
        class="dsq-run" :title="`run ${baux.get(row._id)?.run}`"
        :to="`/automations?run=${encodeURIComponent(baux.get(row._id)!.run!)}`"
      >ouvrir le travail</RouterLink>
      <span v-else-if="baux.get(row._id)?.porteur === 'sans-run'" class="dsq-lease">
        bail pris sans run
      </span>
      <Tag v-if="baux.get(row._id)?.etat === 'expire'" tone="terra"
        title="le prochain claim recycle cette row">bail expiré</Tag>
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
.dsq-run { font-size: 11px; font-weight: 600; color: var(--color-saffron-ink); }
.dsq-run:hover { color: var(--color-ink); }
</style>
