<script setup lang="ts">
// Éditeur STRUCTURÉ d'un champ composite déclaré (schéma v2, ADR 0046) — fini
// la textarea JSON brute du drawer : object → grille de sous-champs ; list de
// sous-records (ex. contacts[]) → un bloc par item, ajout/retrait ; list
// scalaire (ex. idcc_codes) → une valeur par ligne.
import { computed } from 'vue'
import Btn from './Btn.vue'
import Icon from './Icon.vue'
import type { DatastoreField } from '@/types/api'
import { isSubRecordList, subFieldsOf } from '@/lib/datastoreForm'

const props = defineProps<{ field: DatastoreField; modelValue: unknown }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: unknown): void }>()

const subFields = computed(() => subFieldsOf(props.field))
const isObject = computed(() => props.field.type === 'object')
const recordList = computed(() => isSubRecordList(props.field))

// Items rendus : list → ses items dict ; object → [lui-même] (rendu commun).
const items = computed<Record<string, unknown>[]>(() => {
  if (isObject.value) {
    const v = props.modelValue
    return [v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}]
  }
  return Array.isArray(props.modelValue)
    ? props.modelValue.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x))
    : []
})

// Sous-champs d'un item : déclarés d'abord, puis clés présentes non déclarées.
function keysOf(item: Record<string, unknown>): Array<{ key: string; label: string; required: boolean }> {
  const declared = subFields.value.map((s) => ({ key: s.key, label: s.label || s.key, required: !!s.required }))
  const extra = Object.keys(item).filter((k) => !declared.some((d) => d.key === k))
  return [...declared, ...extra.map((k) => ({ key: k, label: k, required: false }))]
}
function strVal(item: Record<string, unknown>, key: string): string {
  const v = item[key]
  if (v == null) return ''
  return typeof v === 'object' ? JSON.stringify(v) : String(v)
}
function setItemField(idx: number, key: string, val: string) {
  if (isObject.value) {
    emit('update:modelValue', { ...(items.value[0] ?? {}), [key]: val })
    return
  }
  emit('update:modelValue', items.value.map((it, i) => (i === idx ? { ...it, [key]: val } : it)))
}
function addItem() { emit('update:modelValue', [...items.value, {}]) }
function removeItem(idx: number) { emit('update:modelValue', items.value.filter((_, i) => i !== idx)) }

// list scalaire : une valeur par ligne.
const scalarText = computed(() =>
  Array.isArray(props.modelValue) ? props.modelValue.map(String).join('\n') : '')
function onScalarText(e: Event) {
  const v = (e.target as HTMLTextAreaElement).value
  emit('update:modelValue', v.split('\n').map((s) => s.trim()).filter(Boolean))
}
</script>

<template>
  <!-- list scalaire -->
  <div v-if="field.type === 'list' && !recordList" class="sre">
    <textarea class="sre-scalar" :value="scalarText" rows="3"
      placeholder="une valeur par ligne" @input="onScalarText" />
  </div>

  <!-- object / list de sous-records -->
  <div v-else class="sre">
    <div v-for="(item, i) in items" :key="i" class="sre-item">
      <div v-if="!isObject" class="sre-item-head">
        <span class="sre-item-n mono">{{ i + 1 }}</span>
        <button class="sre-x" :aria-label="`retirer l'item ${i + 1}`" @click="removeItem(i)">
          <Icon name="close" :size="12" />
        </button>
      </div>
      <div class="sre-grid">
        <template v-for="k in keysOf(item)" :key="k.key">
          <label class="sre-k">{{ k.label }}<span v-if="k.required" class="sre-req" title="champ requis">*</span></label>
          <input class="sre-inp" :value="strVal(item, k.key)" :placeholder="k.label"
            @input="setItemField(i, k.key, ($event.target as HTMLInputElement).value)" />
        </template>
      </div>
    </div>
    <p v-if="!isObject && !items.length" class="dim sre-empty">aucun item.</p>
    <Btn v-if="!isObject" kind="mini" icon="plus" @click="addItem">Item</Btn>
  </div>
</template>

<style scoped>
.sre { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
.sre-item {
  width: 100%; padding: 6px 8px; border: 1px solid var(--color-hair-soft);
  border-left: 2px solid var(--color-hair); border-radius: var(--radius-md);
  background: var(--color-surface);
}
.sre-item-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.sre-item-n { font-size: 10px; color: var(--color-faint); }
.sre-x {
  border: 0; background: transparent; cursor: pointer; padding: 2px; line-height: 0;
  color: var(--color-faint); border-radius: var(--radius-md);
}
.sre-x:hover { color: var(--color-terra-ink); background: var(--color-paper-2); }
.sre-grid { display: grid; grid-template-columns: minmax(64px, auto) 1fr; gap: 4px 8px; align-items: center; }
.sre-k { font-size: 10.5px; color: var(--color-mute); }
.sre-req { color: var(--color-terra-ink); margin-left: 2px; }
.sre-inp {
  width: 100%; font: inherit; font-size: 12px; padding: 3px 6px;
  border: 1px solid var(--color-hair-soft); border-radius: var(--radius-md);
  background: var(--color-bg); color: var(--color-ink);
}
.sre-inp:focus { outline: none; border-color: var(--color-cobalt); }
.sre-scalar {
  width: 100%; font-family: var(--font-mono); font-size: 12px; padding: 6px 8px;
  border: 1px solid var(--color-hair-soft); border-radius: var(--radius-md);
  background: var(--color-surface); color: var(--color-ink); resize: vertical; line-height: 1.5;
}
.sre-scalar:focus { outline: none; border-color: var(--color-cobalt); }
.sre-empty { font-size: 11.5px; margin: 0; }
</style>
