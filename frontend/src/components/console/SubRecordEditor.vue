<script setup lang="ts">
// Éditeur STRUCTURÉ d'un champ composite déclaré (schéma v2, ADR 0046) — fini
// la textarea JSON brute du drawer : object → grille de sous-champs ; list de
// sous-records (ex. contacts[]) → un bloc par item, ajout/retrait ; list
// scalaire (ex. idcc_codes) → une valeur par ligne.
//
// ⚠️ Le modèle est une SAISIE (`CompositeSaisi`, lib/rowDraft), pas la valeur écrite :
// chaque élément garde sa version relue, pour que l'écriture renvoie intact ce qui n'a pas
// été touché (ses `""`, ses vides assumés) et sache qu'une cellule vidée AVAIT une valeur
// (elle part en `null`, qui efface). La bascule « vide assumé » n'est offerte que là où le
// contrat accepte `@empty` : une cellule d'élément de liste de sous-records, hors attribut
// d'identité.
import { computed } from 'vue'
import Btn from './Btn.vue'
import Icon from './Icon.vue'
import VideAssumeToggle from './VideAssumeToggle.vue'
import type { DatastoreField } from '@/types/api'
import { subFieldsOf } from '@/lib/datastoreForm'
import {
  accepteVideSousChamp, elementSaisi, estElementBrut, type CompositeSaisi, type ElementSaisi,
} from '@/lib/rowDraft'

// `erreurs` (oto#219) : rang de l'élément → sous-champ → message — le refus du serveur
// rattaché au champ exact, au lieu d'une phrase en tête de fiche.
const props = defineProps<{ field: DatastoreField; modelValue: CompositeSaisi; erreurs?: Record<number, Record<string, string>> }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: CompositeSaisi): void }>()

const subFields = computed(() => subFieldsOf(props.field))
const isObject = computed(() => props.modelValue.sorte === 'objet')

// Éléments rendus : list → ses éléments ; object → [lui-même] (rendu commun). Un élément relu
// qui n'est pas un sous-record (`null`, un scalaire) est montré et renvoyé tel quel ; aucun
// élément ne quitte la liste sans le geste « retirer ».
const items = computed<ElementSaisi[]>(() => {
  const m = props.modelValue
  return m.sorte === 'elements' ? m.elements : m.sorte === 'objet' ? [m.element] : []
})

// Sous-champs d'un élément : déclarés d'abord, puis clés présentes non déclarées.
function keysOf(e: ElementSaisi): Array<{ key: string; label: string; required: boolean }> {
  const declared = subFields.value.map((s) => ({ key: s.key, label: s.label || s.key, required: !!s.required }))
  const present = [...Object.keys((e.lu as Record<string, unknown> | null) ?? {}), ...Object.keys(e.textes)]
  const extra = [...new Set(present)].filter((k) => !declared.some((d) => d.key === k))
  return [...declared, ...extra.map((k) => ({ key: k, label: k, required: false }))]
}

function replace(idx: number, e: ElementSaisi) {
  const m = props.modelValue
  if (m.sorte === 'objet') emit('update:modelValue', { sorte: 'objet', element: e })
  else if (m.sorte === 'elements')
    emit('update:modelValue', { sorte: 'elements', elements: m.elements.map((x, i) => (i === idx ? e : x)) })
}
function setItemField(idx: number, key: string, val: string) {
  const e = items.value[idx]
  if (!e) return
  // saisir une valeur désactive le vide assumé de la cellule
  replace(idx, { ...e, textes: { ...e.textes, [key]: val }, vides: val.trim() ? { ...e.vides, [key]: false } : e.vides })
}
function setItemEmpty(idx: number, key: string, actif: boolean) {
  const e = items.value[idx]
  if (!e) return
  replace(idx, { ...e, textes: actif ? { ...e.textes, [key]: '' } : e.textes, vides: { ...e.vides, [key]: actif } })
}
function addItem() {
  const m = props.modelValue
  if (m.sorte === 'elements') emit('update:modelValue', { sorte: 'elements', elements: [...m.elements, elementSaisi(undefined)] })
}
function removeItem(idx: number) {
  const m = props.modelValue
  if (m.sorte === 'elements') emit('update:modelValue', { sorte: 'elements', elements: m.elements.filter((_, i) => i !== idx) })
}

// list scalaire : une valeur par ligne.
const scalarText = computed(() =>
  props.modelValue.sorte === 'valeurs' ? props.modelValue.valeurs.map(String).join('\n') : '')
function onScalarText(e: Event) {
  const v = (e.target as HTMLTextAreaElement).value
  emit('update:modelValue', { sorte: 'valeurs', valeurs: v.split('\n').map((s) => s.trim()).filter(Boolean) })
}
</script>

<template>
  <!-- list scalaire -->
  <div v-if="modelValue.sorte === 'valeurs'" class="sre">
    <textarea class="sre-scalar" :value="scalarText" rows="3"
      placeholder="une valeur par ligne" @input="onScalarText" />
  </div>

  <!-- object / list de sous-records -->
  <div v-else class="sre">
    <div v-for="(item, i) in items" :key="i" class="sre-item" :data-item="i">
      <div v-if="!isObject" class="sre-item-head">
        <span class="sre-item-n mono">{{ i + 1 }}</span>
        <button class="sre-x" :aria-label="`retirer l'item ${i + 1}`" @click="removeItem(i)">
          <Icon name="close" :size="12" />
        </button>
      </div>
      <code v-if="estElementBrut(item)" class="mono sre-raw">{{ JSON.stringify(item.lu) }}</code>
      <div v-else class="sre-grid">
        <template v-for="k in keysOf(item)" :key="k.key">
          <label class="sre-k">{{ k.label }}<span v-if="k.required" class="sre-req" title="champ requis">*</span></label>
          <div class="sre-cell" :data-cell="k.key">
            <input class="sre-inp" :value="item.textes[k.key] ?? ''" :placeholder="k.label"
              @input="setItemField(i, k.key, ($event.target as HTMLInputElement).value)" />
            <VideAssumeToggle v-if="accepteVideSousChamp(field, k.key)" :model-value="!!item.vides[k.key]"
              @update:model-value="setItemEmpty(i, k.key, $event)" />
            <p v-if="erreurs?.[i]?.[k.key]" class="sre-err" role="alert">{{ erreurs[i]![k.key] }}</p>
          </div>
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
.sre-cell { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-width: 0; }
.sre-err { flex-basis: 100%; margin: 0; font-size: 11px; color: var(--color-terra-ink); }
.sre-inp {
  width: 100%; min-width: 0; font: inherit; font-size: 12px; padding: 3px 6px;
  border: 1px solid var(--color-hair-soft); border-radius: var(--radius-md);
  background: var(--color-bg); color: var(--color-ink);
}
.sre-inp:focus { outline: none; border-color: var(--color-cobalt); }
.sre-raw { font-size: 11px; color: var(--color-ink-soft); overflow-wrap: anywhere; }
.sre-scalar {
  width: 100%; font-family: var(--font-mono); font-size: 12px; padding: 6px 8px;
  border: 1px solid var(--color-hair-soft); border-radius: var(--radius-md);
  background: var(--color-surface); color: var(--color-ink); resize: vertical; line-height: 1.5;
}
.sre-scalar:focus { outline: none; border-color: var(--color-cobalt); }
.sre-empty { font-size: 11.5px; margin: 0; }
</style>
