<script setup lang="ts">
// Éditeur d'UNE règle de rédaction (ADR 0015) — modale unique réactive : action +
// paramètres de l'action affichés à la volée (remplace l'ancien flux « prompt 2 temps »).
// Construit la règle et l'émet ; l'écriture/normalisation reste côté ConnectorTransforms.
import { computed, reactive, ref, watch } from 'vue'
import Btn from './Btn.vue'
import Icon from './Icon.vue'
import { useFieldFilters } from '@/composables/useFieldFilters'
import type { FieldActionSchema, FieldRule } from '@/types/api'

const props = defineProps<{
  open: boolean
  service: string
  actionSchema: FieldActionSchema[]
  existing?: FieldRule | null
  fixedField?: string | null   // édition d'un champ connu → pas de saisie de champs
}>()
const emit = defineEmits<{ (e: 'save', rule: FieldRule): void; (e: 'close'): void }>()

const { schemaFor, buildRule } = useFieldFilters()

const action = ref<string>('mask')
const fieldsStr = ref<string>('')
const params = reactive<Record<string, string>>({})

const currentParams = computed(() => schemaFor(props.actionSchema, action.value)?.params ?? [])
const canSave = computed(() => (props.fixedField ?? fieldsStr.value).trim().length > 0)

watch(() => props.open, (o) => {
  if (!o) return
  const ex = props.existing as unknown as Record<string, unknown> | null | undefined
  action.value = props.existing?.action ?? 'mask'
  fieldsStr.value = props.existing?.fields.join(', ') ?? ''
  for (const k of Object.keys(params)) delete params[k]
  for (const s of props.actionSchema) for (const p of s.params)
    params[p.key] = ex?.[p.key] != null ? String(ex[p.key]) : ''
}, { immediate: true })

function submit() {
  if (!canSave.value) return
  const raw = props.fixedField ?? fieldsStr.value
  const fields = raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)
  emit('save', buildRule(props.actionSchema, fields, action.value, params))
}
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="open" class="modal-overlay" @mousedown.self="emit('close')">
      <div class="modal" role="dialog" aria-modal="true" aria-label="transformation d'un champ">
        <header class="fr-head">
          <div class="fr-head-txt">
            <h3 class="modal-title">{{ existing ? 'modifier la transformation' : 'nouvelle transformation' }}</h3>
            <p class="modal-desc">
              <span class="mono">{{ service }}</span>
              <span v-if="fixedField"> · champ <span class="mono">{{ fixedField }}</span></span>
            </p>
          </div>
          <button class="fr-close" aria-label="fermer" @click="emit('close')"><Icon name="close" :size="15" /></button>
        </header>

        <div class="fr-body">
          <label v-if="!fixedField" class="fr-row">
            <span class="fr-lbl">champs <span class="dim">(virgule ou espace)</span></span>
            <input v-model="fieldsStr" class="inp" placeholder="first_name, email, photo_url"
              @keyup.enter="submit" />
          </label>

          <label class="fr-row">
            <span class="fr-lbl">action</span>
            <select v-model="action" class="inp">
              <option v-for="s in actionSchema" :key="s.action" :value="s.action">{{ s.label }}</option>
            </select>
          </label>

          <label v-for="p in currentParams" :key="p.key" class="fr-row">
            <span class="fr-lbl">{{ p.label }} <span class="dim">(optionnel)</span></span>
            <select v-if="p.type === 'select'" v-model="params[p.key]" class="inp">
              <option v-for="o in (p.options ?? [])" :key="o" :value="o">{{ o || '— défaut —' }}</option>
            </select>
            <input v-else v-model="params[p.key]" class="inp" inputmode="numeric" placeholder="nombre" />
          </label>
          <p v-if="!currentParams.length" class="dim fr-note">aucune option pour cette action.</p>
        </div>

        <footer class="fr-foot">
          <Btn kind="ghost" @click="emit('close')">Annuler</Btn>
          <Btn icon="check" :disabled="!canSave" @click="submit">Enregistrer</Btn>
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
  width: 100%; max-width: 440px; background: var(--color-bg);
  border: 1px solid var(--color-hair); border-radius: 14px;
  box-shadow: 0 18px 50px -12px color-mix(in srgb, var(--color-ink) 35%, transparent);
}
.fr-head { display: flex; align-items: flex-start; gap: 11px; padding: 16px 18px 8px; }
.fr-head-txt { flex: 1; min-width: 0; }
.modal-title { font-size: 15px; font-weight: 600; color: var(--color-ink); margin: 0; }
.modal-desc { font-size: 11.5px; color: var(--color-mute); margin: 3px 0 0; }
.fr-close {
  flex: none; border: 0; background: transparent; cursor: pointer; padding: 3px;
  border-radius: 7px; color: var(--color-faint); line-height: 0;
}
.fr-close:hover { background: var(--color-paper-2); color: var(--color-ink); }
.fr-body { padding: 8px 18px; display: flex; flex-direction: column; gap: 12px; }
.fr-row { display: flex; flex-direction: column; gap: 4px; }
.fr-lbl { font-size: 12px; color: var(--color-ink-soft); }
.fr-note { font-size: 12px; margin: 0; }
.fr-foot {
  display: flex; align-items: center; justify-content: flex-end; gap: 8px;
  padding: 12px 18px 16px; border-top: 1px solid var(--color-hair-soft);
}
.modal-fade-enter-active, .modal-fade-leave-active { transition: opacity .15s ease; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; }
</style>
