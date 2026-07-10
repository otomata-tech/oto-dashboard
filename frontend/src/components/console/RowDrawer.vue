<script setup lang="ts">
// Drawer détail / édition / ajout d'une row. v2 (ADR 0046) : le FORMULAIRE
// DÉRIVE du schéma — ordre déclaré, labels, requis (*), inputs typés
// (number/bool/date), select d'état à la création, et composites déclarés
// (object / list de sous-records) édités STRUCTURÉS via SubRecordEditor
// (plus de textarea JSON). Les champs non déclarés gardent l'édition libre.
import { computed, ref, watch } from 'vue'
import Btn from './Btn.vue'
import Icon from './Icon.vue'
import FormDialog from './FormDialog.vue'
import SubRecordEditor from './SubRecordEditor.vue'
import { useFormDialog } from '@/composables/useFormDialog'
import type { DatastoreRow, DatastoreSchema } from '@/types/api'
import { cellKind, absDate, relDate } from '@/lib/cellRender'
import {
  compositeDraft, formFields, isComposite, isEmptyPayloadValue, payloadValue,
  scalarDraft, type FieldDesc,
} from '@/lib/datastoreForm'
import { getRowActivity, type RowActivityEntry } from '@/api/console'

const props = defineProps<{
  open: boolean
  row: DatastoreRow | null   // null + isNew = ajout ; sinon édition/lecture
  fields: string[]           // colonnes connues du namespace (pour l'ajout)
  isNew: boolean
  readOnly: boolean
  schema?: DatastoreSchema | null  // v2 (ADR 0046) : formulaire typé + transitions
  namespace?: string | null        // b4 : parcours de l'agent (fetch lazy à l'ouverture)
}>()
const emit = defineEmits<{
  (e: 'save', payload: Record<string, unknown>): void
  (e: 'delete'): void
  (e: 'close'): void
  (e: 'release'): void       // libération forcée du bail (file de travail)
}>()

const { formDialog, formDialogOpen, openForm } = useFormDialog()

// Drafts : scalaires en string d'input, composites déclarés en valeur structurée.
const scalars = ref<Record<string, string>>({})
const composites = ref<Record<string, unknown>>({})
const extra = ref<string[]>([])

const editFields = computed<FieldDesc[]>(() =>
  formFields(props.schema, props.row, props.fields, extra.value))

watch(() => [props.open, props.row], () => {
  if (!props.open) return
  extra.value = []
  const s: Record<string, string> = {}
  const c: Record<string, unknown> = {}
  const base: Record<string, unknown> = props.row ?? {}
  for (const d of formFields(props.schema, props.row, props.fields, [])) {
    if (d.declared && isComposite(d.field)) c[d.key] = compositeDraft(d.field!, base[d.key])
    else s[d.key] = scalarDraft(base[d.key])
  }
  scalars.value = s
  composites.value = c
}, { immediate: true })

function addField() {
  openForm({
    title: 'add field',
    fields: [{ key: 'value', label: 'field name', required: true, placeholder: 'e.g. status' }],
    onConfirm: async (v) => {
      const name = v.value
      if (!name || name.startsWith('_') || name in scalars.value || name in composites.value) return
      extra.value.push(name)
      scalars.value[name] = ''
    },
  })
}

function save() {
  const payload: Record<string, unknown> = {}
  for (const d of editFields.value) {
    const raw = d.declared && isComposite(d.field) ? composites.value[d.key] : (scalars.value[d.key] ?? '')
    const v = payloadValue(d, raw)
    if (props.isNew && isEmptyPayloadValue(v)) continue // ajout : on n'écrit pas les vides
    payload[d.key] = v
  }
  emit('save', payload)
}

function isLong(key: string): boolean {
  const v = scalars.value[key] ?? ''
  return v.includes('\n') || v.length > 60
}
function urlOf(key: string): string | null {
  const v = props.row?.[key]
  return cellKind(v) === 'url' ? String(v) : null
}
function readVal(key: string): string {
  return scalarDraft(props.row?.[key]) || '—'
}
function reqWhenLabel(d: FieldDesc): string {
  return Object.entries(d.requiredWhen ?? {}).map(([k, v]) => `${k} = ${v}`).join(', ')
}

const title = computed(() => props.isNew ? 'new row' : (props.row?._id ?? 'row'))

// ── cycle de vie (ADR 0046 b1) : boutons de transition DÉRIVÉS du schéma — seuls
// les états atteignables depuis l'état courant sont proposés ; le backend refuse
// de toute façon une transition illégale ou un état incomplet (required_when).
const statusField = computed(() =>
  (props.schema?.fields ?? []).find((f) => f.role === 'status') ?? null)
const lifecycleStates = computed<string[]>(() =>
  (statusField.value?.lifecycle?.states ?? []).map(String))
const isLifecycleStatus = (d: FieldDesc) =>
  d.role === 'status' && lifecycleStates.value.length > 0
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
const terminalStates = computed<Set<string>>(() => {
  const lc = statusField.value?.lifecycle
  if (!lc) return new Set()
  if (lc.terminal?.length) return new Set(lc.terminal.map(String))
  // dérivés : états sans transition sortante déclarée
  const outgoing = new Set(Object.entries(lc.transitions ?? {})
    .filter(([, tos]) => tos?.length).map(([from]) => from))
  return new Set((lc.states ?? []).map(String).filter((s) => !outgoing.has(s)))
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
          <div v-for="d in editFields" :key="d.key" class="rd-field">
            <label class="rd-label">{{ d.label }}<span v-if="d.required" class="rd-req"
                title="champ requis">*</span><span v-else-if="d.requiredWhen" class="rd-req rd-req--soft"
                :title="`requis quand ${reqWhenLabel(d)}`">*</span></label>

            <!-- lecture seule : valeur formatée -->
            <template v-if="readOnly">
              <a v-if="urlOf(d.key)" :href="urlOf(d.key)!" target="_blank" rel="noopener" class="rd-link">
                {{ row?.[d.key] }}
              </a>
              <p v-else class="rd-readval">{{ readVal(d.key) }}</p>
            </template>

            <!-- composite déclaré (object / list) : éditeur structuré -->
            <SubRecordEditor v-else-if="d.declared && isComposite(d.field)" :field="d.field!"
              :model-value="composites[d.key]" @update:model-value="composites[d.key] = $event" />

            <!-- statut à cycle de vie : select à la création, transitions ensuite -->
            <template v-else-if="isLifecycleStatus(d)">
              <select v-if="isNew" v-model="scalars[d.key]" class="rd-input">
                <option value="">—</option>
                <option v-for="s in lifecycleStates" :key="s" :value="s">{{ s }}</option>
              </select>
              <p v-else class="rd-readval">{{ scalars[d.key] || '—' }}
                <span class="dim rd-hint">(changer via les transitions ci-dessous)</span></p>
            </template>

            <!-- scalaires typés -->
            <select v-else-if="d.type === 'bool'" v-model="scalars[d.key]" class="rd-input">
              <option value="">—</option>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
            <input v-else-if="d.type === 'number'" v-model="scalars[d.key]" class="rd-input"
              inputmode="decimal" :placeholder="d.label" />
            <textarea v-else-if="isLong(d.key)" v-model="scalars[d.key]" class="rd-input rd-area" rows="5" />
            <input v-else v-model="scalars[d.key]" class="rd-input" :placeholder="d.label" />
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
              jusqu'à {{ absDate(String(row._claimed_until)) }})</template>
              <Btn v-if="!readOnly" kind="mini" @click="emit('release')">Libérer le bail</Btn>
            </template>
          </div>
        </div>

        <div v-if="transitions.length" class="rd-lifecycle">
          <span class="rd-label" style="margin: 0">statut<template v-if="currentStatus"> :
              {{ currentStatus }}</template></span>
          <Btn v-for="t in transitions" :key="t" kind="mini"
            :title="terminalStates.has(t) ? 'état terminal (fin de traitement)' : undefined"
            @click="applyTransition(t)">→ {{ t }}<template v-if="terminalStates.has(t)"> ◼</template></Btn>
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
.rd-req { color: var(--color-terra-ink); margin-left: 2px; }
.rd-req--soft { opacity: .55; }
.rd-hint { font-size: 11px; }
.rd-readval { margin: 0; font-size: 13px; color: var(--color-ink); white-space: pre-wrap; line-height: 1.5; }
.rd-link { font-size: 13px; color: var(--color-cobalt); word-break: break-all; }
.rd-input {
  width: 100%; font: inherit; font-size: 13px; padding: 6px 8px;
  border: 1px solid var(--color-hair-soft); border-radius: 6px;
  background: var(--color-surface); color: var(--color-ink);
}
.rd-input:focus { outline: none; border-color: var(--color-cobalt); }
.rd-area { resize: vertical; line-height: 1.5; font-family: var(--font-mono); font-size: 12px; }
.rd-meta { padding: 4px 0 2px; font-size: 11px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
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
