<script setup lang="ts">
// Historique d'une fiche (ADR 0046 b4, élargi) : les appels corrélés à cette fiche + leur
// run — chargé LAZY à l'ouverture (jamais en mode ajout). Le journal ne recense plus les
// seuls gestes d'agent : ceux posés dans la console y figurent aussi (kind=rest), d'où le
// badge d'origine. Sorti de RowDrawer tel quel (oto#213), qui dépassait 500 lignes.
//
// Les trois états sont rendus : une section qui s'évapore en cas d'échec laisserait croire
// « aucune action sur cette fiche », soit exactement l'angle mort que cet historique est
// censé fermer.
import { ref, watch } from 'vue'
import Tag from './Tag.vue'
import type { RowActivityEntry } from '@/types/api'
import { absDate, relDate } from '@/lib/cellRender'
import { actorOf, changeOf, originLabel, originTone, whenOf } from '@/lib/rowActivity'
import { getRowActivity } from '@/api/console'

const props = defineProps<{ datastore: string; rowId: string | null }>()

const activity = ref<RowActivityEntry[] | null>(null)
const activityFailed = ref(false)
watch(() => props.rowId, async (rowId) => {
  activity.value = null
  activityFailed.value = false
  if (!rowId || !props.datastore) return
  try {
    activity.value = (await getRowActivity(props.datastore, rowId)).activity
  } catch { activityFailed.value = true }
}, { immediate: true })
</script>

<template>
  <p v-if="activityFailed" class="dim rd-activity-state">
    historique indisponible pour le moment.
  </p>
  <p v-else-if="activity && !activity.length" class="dim rd-activity-state">
    aucune action enregistrée sur cette fiche.
  </p>
  <ul v-else-if="activity" class="rd-activity-list">
    <li v-for="(a, i) in activity" :key="i" :class="{ err: !a.ok }">
      <span class="mono dim" :title="absDate(whenOf(a))">{{ relDate(whenOf(a)) }}</span>
      <Tag :tone="originTone(a)">{{ originLabel(a) }}</Tag>
      <span v-if="changeOf(a)" class="rd-activity-change">{{ changeOf(a) }}</span>
      <span class="dim">{{ actorOf(a) }}</span>
      <span v-if="a.doctrine" class="dim">· {{ a.doctrine }}</span>
      <code class="mono rd-activity-tool">{{ a.tool }}</code>
      <span v-if="!a.ok" class="rd-activity-err" :title="a.error ?? undefined">échec</span>
    </li>
  </ul>
  <p v-else class="dim rd-activity-state">chargement…</p>
  <p v-if="activity && activity.length" class="rd-activity-note dim">
    journal de travail (rétention ~30 j), pas un audit permanent.
  </p>
</template>

<style scoped>
.rd-activity-list { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
/* états vide / échec / chargement de l'historique, même gabarit que ses lignes */
.rd-activity-state { margin: 4px 0 0; font-size: 11.5px; }
.rd-activity-list li { font-size: 11.5px; display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; color: var(--color-ink-soft); }
.rd-activity-list li.err { color: var(--color-terra-ink); }
.rd-activity-list code { font-size: 11px; }
/* ce qui a changé : la transition d'état, sinon les champs écrits */
.rd-activity-change {
  font-size: 11px; color: var(--color-ink);
  background: var(--color-paper-2); border-radius: var(--radius-md); padding: 1px 7px;
}
.rd-activity-tool { color: var(--color-faint); margin-left: auto; }
.rd-activity-err { font-size: 10px; color: var(--color-terra-ink); border: 1px solid currentColor; border-radius: var(--radius-pill); padding: 0 6px; }
.rd-activity-note { margin: 6px 0 0; font-size: 10.5px; }
</style>
