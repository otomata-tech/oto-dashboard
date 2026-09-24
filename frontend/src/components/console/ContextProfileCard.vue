<script setup lang="ts">
// Carte « situation avec oto » — la fiche profil (data model libre) relue à chaque
// session (bloc C) et entretenue par l'agent via oto_profile. Ici : édition MANUELLE
// in-situ (GET/PUT /api/me/profile). Le schéma suggéré (fields) guide le remplissage ;
// les clés libres déjà posées par l'agent sont éditables aussi.
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from './ConsoleCard.vue'
import Btn from './Btn.vue'
import Tag from './Tag.vue'
import { getProfile, setProfile } from '@/api/console'
import type { AccountProfile } from '@/types/api'
import { humanize } from '@/lib/errors'
import { useToast } from '@/composables/useToast'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{ title?: string; sub?: string }>()

const { toast } = useToast()

const data = ref<AccountProfile | null>(null)
const loaded = ref(false)
const editing = ref(false)
const busy = ref(false)
const draft = ref<Record<string, string>>({})
const newKey = ref('')

interface Row { key: string; label: string; why?: string; value: string }
const rows = computed<Row[]>(() => {
  if (!data.value) return []
  const p = data.value.profile || {}
  const schemaKeys = new Set(data.value.fields.map((f) => f.key))
  const out: Row[] = data.value.fields.map((f) => ({
    key: f.key, label: f.question, why: f.why, value: p[f.key] || '',
  }))
  // clés libres posées par l'agent, hors schéma
  for (const [k, v] of Object.entries(p)) {
    if (!schemaKeys.has(k)) out.push({ key: k, label: k, value: v || '' })
  }
  return out
})
const filledCount = computed(() =>
  Object.values(data.value?.profile || {}).filter((v) => (v || '').trim()).length)

async function reload() {
  try { data.value = await getProfile() }
  catch (e) { toast(humanize(e)) }
  finally { loaded.value = true }
}
onMounted(reload)

function edit() {
  const d: Record<string, string> = {}
  for (const r of rows.value) d[r.key] = r.value
  draft.value = d
  editing.value = true
}
function addField() {
  const k = newKey.value.trim().toLowerCase().replace(/\s+/g, '_')
  if (!k) return
  if (!(k in draft.value)) draft.value[k] = ''
  newKey.value = ''
}
async function save() {
  busy.value = true
  try {
    data.value = await setProfile(draft.value)
    toast(t('contextUi.profile.saved'))
    editing.value = false
  } catch (e) { toast(humanize(e)) }
  finally { busy.value = false }
}

// Champs du brouillon en mode édition (schéma + clés libres + ajouts).
const draftRows = computed(() =>
  Object.keys(draft.value).map((key) => {
    const f = data.value?.fields.find((x) => x.key === key)
    return { key, label: f?.question || key, why: f?.why }
  }))
</script>

<template>
  <ConsoleCard :title="props.title ?? t('contextUi.profile.title')" :sub="props.sub ?? t('contextUi.profile.sub')">
    <template v-if="loaded && !editing" #actions>
      <Btn kind="mini" icon="pen" @click="edit">{{ filledCount ? t('contextUi.profile.edit') : t('contextUi.profile.fill') }}</Btn>
    </template>

    <p v-if="!loaded" class="dim" style="font-size: 13px">{{ t('common.loading') }}</p>

    <!-- Édition -->
    <template v-else-if="editing">
      <div class="pf-list">
        <div v-for="r in draftRows" :key="r.key" class="pf-edit-row">
          <label class="pf-label">{{ r.label }}<span v-if="r.why" class="pf-why">{{ r.why }}</span></label>
          <input v-model="draft[r.key]" class="pf-input" :placeholder="'…'" />
        </div>
      </div>
      <div class="pf-add">
        <input v-model="newKey" class="pf-input" :placeholder="t('contextUi.profile.addPlaceholder')" @keyup.enter="addField" />
        <Btn kind="mini" @click="addField">{{ t('contextUi.profile.addField') }}</Btn>
      </div>
      <div class="pf-actions">
        <Btn kind="mini" :disabled="busy" @click="editing = false">{{ t('common.cancel') }}</Btn>
        <Btn :disabled="busy" @click="save">{{ t('common.save') }}</Btn>
      </div>
    </template>

    <!-- Lecture -->
    <template v-else>
      <div class="pf-meta">
        <Tag :tone="filledCount ? 'olive' : undefined">{{ filledCount ? t('contextUi.profile.filled', filledCount) : t('contextUi.layers.empty') }}</Tag>
      </div>
      <div v-if="filledCount" class="pf-list">
        <div v-for="r in rows.filter((x) => x.value.trim())" :key="r.key" class="pf-row">
          <div class="pf-k">{{ r.label }}</div>
          <div class="pf-v">{{ r.value }}</div>
        </div>
      </div>
      <p v-else class="dim" style="font-size: 13px">
        {{ t('contextUi.profile.nothing') }}
      </p>
    </template>
  </ConsoleCard>
</template>

<style scoped>
.pf-meta { margin-bottom: 10px; }
.pf-list { display: flex; flex-direction: column; }
.pf-row {
  display: grid; grid-template-columns: minmax(140px, 220px) 1fr; gap: 12px;
  padding: 8px 0; border-top: 1px solid var(--color-hair-soft); font-size: 13px;
}
.pf-row:first-child { border-top: 0; }
.pf-k { color: var(--color-mute); }
.pf-v { color: var(--color-ink); white-space: pre-wrap; min-width: 0; overflow-wrap: anywhere; }

.pf-edit-row { display: flex; flex-direction: column; gap: 4px; padding: 8px 0; }
.pf-label { font-size: 12.5px; color: var(--color-ink); font-weight: 600; }
.pf-why { display: block; font-size: 11px; color: var(--color-faint); font-weight: 400; margin-top: 1px; }
.pf-input {
  width: 100%; box-sizing: border-box; font-family: inherit; font-size: 13px;
  color: var(--color-ink); background: var(--color-bg);
  border: 1px solid var(--color-hair); border-radius: 8px; padding: 7px 10px; outline: none;
}
.pf-input:focus-visible { outline: 2px solid var(--color-cobalt); outline-offset: 2px; }
.pf-add { display: flex; gap: 8px; align-items: center; margin-top: 10px; }
.pf-add .pf-input { flex: 1; }
.pf-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 12px; }
</style>
