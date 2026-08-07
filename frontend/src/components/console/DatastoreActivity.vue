<script setup lang="ts">
// Journal du TABLEAU (ADR 0046 b4 élargi) : les derniers gestes posés sur ce
// namespace, d'où qu'ils viennent. Optimisé pour UNE question — « qu'est-ce qui
// vient de changer, et sur quelle ligne » — parce que c'est celle qu'on se pose
// après avoir cliqué sans savoir : la fiche touchée est nommée et cliquable, et
// le changement (état d'avant → état d'après, ou champs écrits) est lisible sans
// ouvrir quoi que ce soit. Un geste de console et un appel d'agent se distinguent
// au badge d'origine.
import { ref, watch } from 'vue'
import Tag from './Tag.vue'
import Btn from './Btn.vue'
import OtoLoading from './OtoLoading.vue'
import { getNamespaceActivity } from '@/api/console'
import type { RowActivityEntry } from '@/types/api'
import { absDate, relDate } from '@/lib/cellRender'
import { actorOf, changeOf, originLabel, originTone, rowLabelOf, whenOf } from '@/lib/rowActivity'
import { humanize } from '@/lib/errors'

const props = defineProps<{ namespace: string }>()
const emit = defineEmits<{ open: [rowId: string] }>()

const entries = ref<RowActivityEntry[]>([])
const retention = ref<number | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    const r = await getNamespaceActivity(props.namespace)
    entries.value = r.activity
    retention.value = r.retention_days
  } catch (e) { error.value = humanize(e); entries.value = [] }
  finally { loading.value = false }
}
watch(() => props.namespace, load, { immediate: true })
defineExpose({ load })
</script>

<template>
  <section class="da">
    <header class="da-head">
      <span class="da-title">dernières actions</span>
      <span class="da-spacer" />
      <Btn kind="mini" icon="refresh" :disabled="loading" @click="load">actualiser</Btn>
    </header>

    <OtoLoading v-if="loading && !entries.length" label="chargement…" />
    <p v-else-if="error" class="helptext da-err">{{ error }}</p>
    <p v-else-if="!entries.length" class="dim da-empty">
      aucune action enregistrée sur ce tableau.
    </p>
    <ul v-else class="da-list">
      <li v-for="(a, i) in entries" :key="i" :class="{ err: !a.ok }">
        <span class="da-when mono dim" :title="absDate(whenOf(a))">{{ relDate(whenOf(a)) }}</span>
        <Tag :tone="originTone(a)">{{ originLabel(a) }}</Tag>
        <button v-if="a.row_id" class="da-row" :title="`ouvrir la fiche ${a.row_id}`"
          @click="emit('open', a.row_id!)">{{ rowLabelOf(a) }}</button>
        <span v-else class="dim da-norow">tout le tableau</span>
        <span v-if="changeOf(a)" class="da-change">{{ changeOf(a) }}</span>
        <span class="da-who dim">{{ actorOf(a) }}</span>
        <code class="mono da-tool">{{ a.tool }}</code>
        <span v-if="!a.ok" class="da-fail" :title="a.error ?? undefined">échec</span>
      </li>
    </ul>

    <p v-if="retention" class="da-note dim">
      journal de travail (rétention ~{{ retention }} j), pas un audit permanent.
    </p>
  </section>
</template>

<style scoped>
.da { border-bottom: 1px solid var(--color-hair-soft); padding: 10px 16px 12px; }
.da-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.da-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--color-mute); }
.da-spacer { flex: 1; }
.da-err { color: var(--color-terra-ink); }
.da-empty { font-size: 12.5px; padding: 6px 0; }
.da-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; max-height: 320px; overflow-y: auto; }
.da-list li {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px;
  font-size: 12px; color: var(--color-ink-soft);
  padding: 3px 0; border-bottom: 1px dashed var(--color-hair-soft);
}
.da-list li.err { color: var(--color-terra-ink); }
.da-when { font-size: 11px; min-width: 62px; }
.da-row {
  font: inherit; font-size: 12px; font-weight: 600; cursor: pointer;
  background: none; border: 0; padding: 0; color: var(--color-cobalt); text-align: left;
}
.da-row:hover { text-decoration: underline; }
.da-norow { font-size: 11.5px; }
.da-change {
  font-size: 11.5px; color: var(--color-ink);
  background: var(--color-paper-2); border-radius: var(--radius-md); padding: 1px 7px;
}
.da-who { font-size: 11.5px; }
.da-tool { font-size: 10.5px; color: var(--color-faint); margin-left: auto; }
.da-fail { font-size: 10px; color: var(--color-terra-ink); border: 1px solid currentColor; border-radius: var(--radius-pill); padding: 0 6px; }
.da-note { margin: 8px 0 0; font-size: 10.5px; }
</style>
