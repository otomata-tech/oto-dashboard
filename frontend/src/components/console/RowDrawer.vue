<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Btn from './Btn.vue'
import Icon from './Icon.vue'
import { usePrompt } from '@/composables/usePrompt'
import type { DatastoreRow } from '@/types/api'
import { cellKind, absDate } from '@/lib/cellRender'

const props = defineProps<{
  open: boolean
  row: DatastoreRow | null   // null + isNew = ajout ; sinon édition/lecture
  fields: string[]           // colonnes connues du namespace (pour l'ajout)
  isNew: boolean
  readOnly: boolean
}>()
const emit = defineEmits<{
  (e: 'save', payload: Record<string, unknown>): void
  (e: 'delete'): void
  (e: 'close'): void
}>()

const { promptText } = usePrompt()
const META = new Set(['_id', '_created_at', '_updated_at'])

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

async function addField() {
  const name = await promptText('add field', { label: 'field name', required: true, placeholder: 'e.g. status' })
  if (!name || META.has(name) || name in draft.value) return
  extra.value.push(name)
  draft.value[name] = ''
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

          <div v-if="!isNew && row?._updated_at" class="rd-meta dim mono">
            updated {{ absDate(String(row._updated_at)) }}
          </div>
        </div>

        <footer class="rd-foot">
          <Btn v-if="!readOnly" kind="mini" icon="plus" @click="addField">field</Btn>
          <span class="rd-spacer" />
          <Btn v-if="!readOnly && !isNew" kind="danger" icon="trash" @click="emit('delete')">delete</Btn>
          <Btn kind="ghost" @click="emit('close')">{{ readOnly ? 'close' : 'cancel' }}</Btn>
          <Btn v-if="!readOnly" kind="mini" icon="check" @click="save">save</Btn>
        </footer>
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
.rd-foot {
  display: flex; align-items: center; gap: 8px; padding: 12px 18px 16px;
  border-top: 1px solid var(--color-hair-soft);
}
.rd-spacer { flex: 1; }
.modal-fade-enter-active, .modal-fade-leave-active { transition: opacity .15s ease; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; }
</style>
