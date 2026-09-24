<script setup lang="ts">
// Ce qu'une entrée du parcours a changé (oto#273, M3). Avec le journal des révisions,
// les VALEURS : une pastille par colonne, « avant → après ». Sans lui (backend antérieur,
// écriture d'avant le 24/09/2026, lecture) : la transition d'état ou les noms des
// colonnes écrites, comme avant. Partagé par l'historique d'une fiche et le journal du
// tableau, pour qu'un même geste se lise pareil aux deux endroits.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RowActivityEntry } from '@/types/api'
import { changeOf, valueChangesOf, type ShownValue } from '@/lib/rowActivity'

const props = defineProps<{ entry: RowActivityEntry }>()
const { t } = useI18n()

const colonnes = computed(() => valueChangesOf(props.entry))
const resume = computed(() => (colonnes.value ? '' : changeOf(props.entry)))

function texte(v: ShownValue): string {
  if (v.marker === 'absent') return t('rowActivity.value.absent')
  if (v.marker === 'null') return t('rowActivity.value.null')
  if (v.marker === 'empty') return t('rowEditor.emptyAssumed')
  return v.text ?? ''
}

function infobulle(v: ShownValue): string | undefined {
  const parts = [v.full, v.comment && t('cellLayers.note', { text: v.comment }),
    v.link && t('cellLayers.link', { text: v.link })].filter(Boolean)
  return parts.length ? parts.join('\n') : undefined
}
</script>

<template>
  <template v-if="colonnes">
    <span v-for="c in colonnes" :key="c.field" class="ac-change" data-test="value-change">
      <span class="ac-field">{{ c.field }}</span>
      <span :class="['ac-val', { 'ac-mark': c.avant.marker }]" :title="infobulle(c.avant)">{{ texte(c.avant) }}</span>
      <span class="ac-arrow">→</span>
      <span :class="['ac-val', { 'ac-mark': c.apres.marker }]" :title="infobulle(c.apres)">{{ texte(c.apres) }}</span>
      <span v-if="c.apres.comment || c.apres.link" class="ac-layer"
        :title="infobulle(c.apres)">{{ c.apres.comment ? t('rowActivity.value.withNote') : t('rowActivity.value.withLink') }}</span>
    </span>
  </template>
  <span v-else-if="resume" class="ac-change">{{ resume }}</span>
</template>

<style scoped>
.ac-change {
  font-size: 11px; color: var(--color-ink);
  background: var(--color-paper-2); border-radius: var(--radius-md); padding: 1px 7px;
  display: inline-flex; flex-wrap: wrap; gap: 4px; align-items: baseline; max-width: 100%;
}
.ac-field { font-weight: 600; }
.ac-val { overflow-wrap: anywhere; }
.ac-mark { font-style: italic; color: var(--color-mute); }
.ac-arrow { color: var(--color-faint); }
.ac-layer { font-size: 10px; color: var(--color-mute); }
</style>
