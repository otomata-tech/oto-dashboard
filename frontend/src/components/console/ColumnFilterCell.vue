<script setup lang="ts">
// Contrôle de filtre d'UNE colonne (vue tableau datastore, oto-dashboard#18) :
// sélecteur d'op (dérivé du type de colonne) + champ de valeur (type adapté).
// Émet son état ; l'assemblage en ColumnFilter[] + le debounce vivent dans DataTable.
import { computed } from 'vue'
import type { FilterOp } from '@/types/api'
import { OPS_BY_KIND, opLabel, opNeedsValue, type ColFilterState, type FilterKind } from '@/lib/datastoreFilters'

const props = defineProps<{ field: string; kind: FilterKind; modelValue: ColFilterState }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: ColFilterState): void }>()

const ops = computed(() => OPS_BY_KIND[props.kind])
const needsValue = computed(() => opNeedsValue(props.modelValue.op))
const inputType = computed(() => (props.kind === 'date' ? 'date' : props.kind === 'number' ? 'number' : 'text'))
const active = computed(() => (needsValue.value ? !!props.modelValue.value.trim() : true))

function setOp(op: FilterOp) { emit('update:modelValue', { op, value: opNeedsValue(op) ? props.modelValue.value : '' }) }
function setValue(value: string) { emit('update:modelValue', { op: props.modelValue.op, value }) }
</script>

<template>
  <div class="cfc" :class="{ on: active }">
    <select class="cfc-op" :value="modelValue.op" :title="`filtre ${field}`"
      @change="setOp(($event.target as HTMLSelectElement).value as FilterOp)">
      <option v-for="op in ops" :key="op" :value="op">{{ opLabel(op, kind) }}</option>
    </select>
    <select v-if="needsValue && kind === 'bool'" class="cfc-val cfc-val-sel" :value="modelValue.value"
      @change="setValue(($event.target as HTMLSelectElement).value)">
      <option value="">…</option>
      <option value="true">vrai</option>
      <option value="false">faux</option>
    </select>
    <input v-else-if="needsValue" class="cfc-val" :type="inputType" :value="modelValue.value"
      placeholder="…" @input="setValue(($event.target as HTMLInputElement).value)" />
  </div>
</template>

<style scoped>
.cfc {
  display: flex; align-items: center; gap: 3px;
  border: 1px solid var(--color-hair); border-radius: 5px;
  background: var(--color-surface); padding: 1px 2px;
}
.cfc.on { border-color: var(--color-cobalt); }
.cfc-op {
  font: inherit; font-size: 10.5px; border: 0; background: none; color: var(--color-mute);
  outline: none; cursor: pointer; max-width: 84px;
}
.cfc-val {
  font: inherit; font-size: 11px; border: 0; background: none; color: var(--color-ink);
  outline: none; width: 72px; min-width: 0;
}
.cfc-val-sel { cursor: pointer; }
</style>
