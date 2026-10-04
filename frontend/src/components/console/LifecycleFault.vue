<script setup lang="ts">
// Un cycle de vie dont les transitions sont HORS FORME (oto#63) : une valeur qui n'est
// pas une liste d'états (`{"neuf": "fait"}` au lieu de `{"neuf": ["fait"]}`). Le
// serveur le refuse à la pose depuis, mais un schéma stocké avant peut le porter.
// L'écran ne le devine pas et ne tourne pas en rond : il le DIT, avec la forme
// attendue, et n'affiche des transitions que la partie bien formée.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { lireTransitions } from '@/lib/datastoreLifecycle'
import type { DatastoreLifecycle } from '@/types/api'

const { t } = useI18n()

const props = defineProps<{ lifecycle?: DatastoreLifecycle | null; column?: string | null }>()

const fautes = computed(() => lireTransitions(props.lifecycle).fautes)
</script>

<template>
  <p v-if="fautes.length" class="lcf" role="alert" data-lifecycle-fault>
    <span class="lcf-head">{{ t('dataUi.lifecycle.malformed', { column: column || '—' }) }}</span>
    <code v-for="f in fautes" :key="f" class="lcf-f mono">{{ f }}</code>
  </p>
</template>

<style scoped>
.lcf {
  display: flex; flex-direction: column; gap: 3px; margin: 0;
  padding: 8px 10px; border-radius: var(--radius-md);
  background: var(--color-terra-soft); color: var(--color-terra-ink);
  font-size: 12px; line-height: 1.45;
}
.lcf-head { font-weight: 600; }
.lcf-f { font-size: 11.5px; word-break: break-word; }
</style>
