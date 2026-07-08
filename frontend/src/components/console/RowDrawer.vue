<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Btn from './Btn.vue'
import Icon from './Icon.vue'
import FormDialog from './FormDialog.vue'
import { useFormDialog } from '@/composables/useFormDialog'
import type { DatastoreRow, DatastoreSchema } from '@/types/api'
import { cellKind, absDate, relDate } from '@/lib/cellRender'
import { getRowActivity, type RowActivityEntry } from '@/api/console'

const props = defineProps<{
  open: boolean
  row: DatastoreRow | null   // null + isNew = ajout ; sinon édition/lecture
  fields: string[]           // colonnes connues du namespace (pour l'ajout)
  isNew: boolean
  readOnly: boolean
  schema?: DatastoreSchema | null  // v2 (ADR 0046) : transitions de cycle de vie
  namespace?: string | null        // b4 : parcours de l'agent (fetch lazy à l'ouverture)
}>()
const emit = defineEmits<{
  (e: 'save', payload: Record<string, unknown>): void
  (e: 'delete'): void
  (e: 'close'): void
}>()

const { formDialog, formDialogOpen, openForm } = useFormDialog()
// Tout champ `_…` est méta (id/timestamps + bail de claim v2) : jamais éditable.
const META = { has: (k: string) => k.startsWith('_') }

const draft = ref<Record<string, string>>({})
const extra = ref<string[]>([])

// String d'input ⇄ valeur. JSON si possible (nombre/bool/null/objet), sinon string.
function toInput(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v, null, 2)
  return String(v)
}
function parseVal(s: string): unknown {
  const t = s.trim()
  if (t === '') return ''
  try { return JSON.parse(t) } catch { return s }
}

// Champs éditables = union des champs de la row + colonnes connues + ajoutés.
const editFields = computed<string[]>(() => {
  const out: string[] = []
  for (const k of Object.keys(props.row ?? {})) if (!META.has(k) && !out.includes(k)) out.push(k)
  for (const f of props.fields) if (!out.includes(f)) out.push(f)
  for (const f of extra.value) if (!out.includes(f)) out.push(f)
  return out
})

watch(() => [props.open, props.row], () => {
  if (!props.open) return
  extra.value = []
  const d: Record<string, string> = {}
  const base: Record<string, unknown> = props.row ?? {}
  const keys = new Set([...Object.keys(base).filter((k) => !META.has(k)), ...props.fields])
  for (const k of keys) d[k] = toInput(base[k])
  draft.value = d
}, { immediate: true })

function addField() {
  openForm({
    title: 'add field',
    fields: [{ key: 'value', label: 'field name', required: true, placeholder: 'e.g. status' }],
    onConfirm: async (v) => {
      const name = v.value
      if (!name || META.has(name) || name in draft.value) return
      extra.value.push(name)
      draft.value[name] = ''
    },
  })
}

function save() {
  const payload: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(draft.value)) {
    if (props.isNew && v.trim() === '') continue  // ajout : on n'écrit pas les vides
    payload[k] = parseVal(v)
  }
  emit('save', payload)
}

function isLong(field: string): boolean {
  const v = draft.value[field] ?? ''
  return v.includes('\n') || v.length > 60
}
function urlOf(field: string): string | null {
  const v = props.row?.[field]
  return cellKind(v) === 'url' ? String(v) : null
}

const title = computed(() => props.isNew ? 'new row' : (props.row?._id ?? 'row'))

// ── cycle de vie (ADR 0046 b1) : boutons de transition DÉRIVÉS du schéma — seuls
// les états atteignables depuis l'état courant sont proposés ; le backend refuse
// de toute façon une transition illégale ou un état incomplet (required_when).
const statusField = computed(() =>
  (props.schema?.fields ?? []).find((f) => f.role === 'status') ?? null)
const currentStatus = computed<string | null>(() => {
  const k = statusField.value?.key
  const v = k ? props.row?.[k] : null
  return v == null || v === '' ? null : String(v)
})
const transitions = computed<string[]>(() => {
  const lc = statusField.value?.lifecycle
  if (!lc?.states?.length || props.isNew || props.readOnly) return []
  const cur = currentStatus.value
  if (cur == null) return lc.states.map(String)          // pas encore d'état → tous
  return (lc.transitions?.[cur] ?? []).map(String)       // sinon les cibles déclarées
})
function applyTransition(state: string) {
  const k = statusField.value?.key
  if (!k) return
  emit('save', { [k]: state })                            // patch partiel ; erreurs (guard-rail) en toast
}

// ── parcours de l'agent (ADR 0046 b4) : les appels data_* corrélés à cette
// fiche + leur run — chargé LAZY à l'ouverture (jamais en mode ajout).
const activity = ref<RowActivityEntry[] | null>(null)
const activityFailed = ref(false)
watch(() => [props.open, props.row?._id], async () => {
  activity.value = null
  activityFailed.value = false
  if (!props.open || props.isNew || !props.row?._id || !props.namespace) return
  try {
    activity.value = (await getRowActivity(props.namespace, props.row._id)).activity
  } catch { activityFailed.value = true }
}, { immediate: true })
function actorOf(a: RowActivityEntry): string {
  return a.run_label ? `run « ${a.run_label} »` : (a.email ?? a.sub ?? '—')
}
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="open" class="modal-overlay" @mousedown.self="emit('close')">
      <div class="modal" role="dialog" aria-modal="true" aria-label="row detail">
        <header class="rd-head">
          <div class="rd-head-txt">
            <h3 class="modal-title">{{ isNew ? 'new row' : 'row detail' }}</h3>
            <p v-if="!isNew" class="modal-desc mono">{{ title }}</p>
          </div>
          <button class="rd-close" aria-label="fermer" @click="emit('close')">
            <Icon name="close" :size="15" />
          </button>
        </header>

        <div class="rd-body">
          <div v-for="f in editFields" :key="f" class="rd-field">
            <label class="rd-label">{{ f }}</label>

            <!-- lecture seule : valeur formatée -->
            <template v-if="readOnly">
              <a v-if="urlOf(f)" :href="urlOf(f)!" target="_blank" rel="noopener" class="rd-link">
                {{ row?.[f] }}
              </a>
              <p v-else class="rd-readval">{{ toInput(row?.[f]) || '—' }}</p>
            </template>

            <!-- édition -->
            <textarea v-else-if="isLong(f)" v-model="draft[f]" class="rd-input rd-area" rows="5" />
            <input v-else v-model="draft[f]" class="rd-input" :placeholder="f" />
          </div>

          <p v-if="!editFields.length" class="dim" style="padding: 8px 0">no fields yet — add one below.</p>

          <div v-if="activity && activity.length" class="rd-activity">
            <span class="rd-label">parcours de l'agent</span>
            <ul class="rd-activity-list">
              <li v-for="(a, i) in activity" :key="i" :class="{ err: !a.ok }">
                <span class="mono dim" :title="absDate(a.created_at)">{{ relDate(a.created_at) }}</span>
                <code class="mono">{{ a.tool }}</code>
                <span class="dim">· {{ actorOf(a) }}</span>
                <span v-if="a.doctrine" class="dim">· {{ a.doctrine }}</span>
                <span v-if="!a.ok" class="rd-activity-err" :title="a.error ?? undefined">échec</span>
              </li>
            </ul>
            <p class="rd-activity-note dim">journal de travail (rétention ~30 j), pas un audit permanent.</p>
          </div>

          <div v-if="!isNew && row?._updated_at" class="rd-meta dim mono">
            updated {{ absDate(String(row._updated_at)) }}
            <template v-if="row?._claimed_by"> · en cours de traitement par
              « {{ row._claimed_by }} »<template v-if="row?._claimed_until"> (bail
              jusqu'à {{ absDate(String(row._claimed_until)) }})</template></template>
          </div>
        </div>

        <div v-if="transitions.length" class="rd-lifecycle">
          <span class="rd-label" style="margin: 0">statut<template v-if="currentStatus"> : {{ currentStatus }}</template></span>
          <Btn v-for="t in transitions" :key="t" kind="mini" @click="applyTransition(t)">→ {{ t }}</Btn>
        </div>

        <footer class="rd-foot">
          <Btn v-if="!readOnly" kind="mini" icon="plus" @click="addField">Field</Btn>
          <span class="rd-spacer" />
          <Btn v-if="!readOnly && !isNew" kind="danger" icon="trash" @click="emit('delete')">Delete</Btn>
          <Btn kind="ghost" @click="emit('close')">{{ readOnly ? 'Close' : 'Cancel' }}</Btn>
          <Btn v-if="!readOnly" kind="mini" icon="check" @click="save">Save</Btn>
        </footer>

        <FormDialog v-if="formDialog" v-model:open="formDialogOpen"
          :title="formDialog.title" :description="formDialog.description"
          :fields="formDialog.fields" :submit-label="formDialog.submitLabel" :on-confirm="formDialog.onConfirm" />
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center;
  padding: 24px; background: color-mix(in srgb, var(--color-ink) 30%, transparent); backdrop-filter: blur(2px);
}
.modal {
  width: 100%; max-width: 600px; max-height: 85vh; display: flex; flex-direction: column;
  background: var(--color-bg); border: 1px solid var(--color-hair); border-radius: 14px;
  box-shadow: 0 18px 50px -12px color-mix(in srgb, var(--color-ink) 35%, transparent);
}
.rd-head { display: flex; align-items: flex-start; gap: 11px; padding: 16px 18px 10px; }
.rd-head-txt { flex: 1; min-width: 0; }
.modal-title { font-size: 15px; font-weight: 600; color: var(--color-ink); margin: 0; }
.modal-desc { font-size: 11.5px; color: var(--color-mute); margin: 3px 0 0; word-break: break-all; }
.rd-close {
  flex: none; border: 0; background: transparent; cursor: pointer; padding: 3px;
  border-radius: 7px; color: var(--color-faint); line-height: 0;
}
.rd-close:hover { background: var(--color-paper-2); color: var(--color-ink); }
.rd-body { overflow-y: auto; padding: 4px 18px 8px; }
.rd-field { margin-bottom: 12px; }
.rd-label { display: block; font-size: 11px; font-weight: 600; color: var(--color-mute); margin-bottom: 4px; }
.rd-readval { margin: 0; font-size: 13px; color: var(--color-ink); white-space: pre-wrap; line-height: 1.5; }
.rd-link { font-size: 13px; color: var(--color-cobalt); word-break: break-all; }
.rd-input {
  width: 100%; font: inherit; font-size: 13px; padding: 6px 8px;
  border: 1px solid var(--color-hair-soft); border-radius: 6px;
  background: var(--color-surface); color: var(--color-ink);
}
.rd-input:focus { outline: none; border-color: var(--color-cobalt); }
.rd-area { resize: vertical; line-height: 1.5; font-family: var(--font-mono); font-size: 12px; }
.rd-meta { padding: 4px 0 2px; font-size: 11px; }
.rd-activity { margin: 10px 0 4px; padding-top: 8px; border-top: 1px dashed var(--color-hair-soft); }
.rd-activity-list { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.rd-activity-list li { font-size: 11.5px; display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; color: var(--color-ink-soft); }
.rd-activity-list li.err { color: var(--color-terra-ink); }
.rd-activity-list code { font-size: 11px; }
.rd-activity-err { font-size: 10px; color: var(--color-terra-ink); border: 1px solid currentColor; border-radius: var(--radius-pill); padding: 0 6px; }
.rd-activity-note { margin: 6px 0 0; font-size: 10.5px; }
.rd-lifecycle {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
  padding: 10px 18px 0;
  border-top: 1px solid var(--color-hair-soft);
}
.rd-foot {
  display: flex; align-items: center; gap: 8px; padding: 12px 18px 16px;
  border-top: 1px solid var(--color-hair-soft);
}
.rd-spacer { flex: 1; }
.modal-fade-enter-active, .modal-fade-leave-active { transition: opacity .15s ease; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; }
</style>
