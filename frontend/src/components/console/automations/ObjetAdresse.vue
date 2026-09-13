<script setup lang="ts" generic="T">
// L'issue de la lecture d'un objet par son ADRESSE (oto#214), commune aux pages d'une
// campagne, d'une programmation et d'une exécution (`useLectureParId`). Une adresse n'affiche
// que l'objet qu'elle désigne : une adresse sans identifiant, un 404, la bêta absente se
// disent, et rien ne s'affiche à leur place. Le contenu de la page ne se rend que sur un
// objet lu ; une erreur de relecture reste affichée au-dessus de la dernière lecture réussie.
import { useI18n } from 'vue-i18n'
import TargetRefusalCard from '../TargetRefusalCard.vue'
import type { LectureParId } from '@/composables/useLectureParId'

defineProps<{
  lecture: LectureParId<T>
  /** Clé i18n du titre d'un refus, avec `{what}` (l'objet demandé). */
  titre: string
}>()
defineSlots<{ default(props: { objet: T }): unknown }>()
const { t } = useI18n()
</script>

<template>
  <TargetRefusalCard v-if="lecture.id.value === null"
    :title="t(titre, { what: `« ${lecture.brut.value} »` })" :detail="t('automations.space.notAnId')" />
  <TargetRefusalCard v-else-if="lecture.refus.value" :title="t(titre, { what: lecture.refus.value.what })"
    :code="lecture.refus.value.code" :detail="lecture.refus.value.detail" />
  <p v-else-if="lecture.beta.value" class="oa-mute" data-test="beta">{{ t('automations.campaigns.betaOff') }}</p>
  <template v-else>
    <p v-if="lecture.erreur.value" class="oa-err" role="alert">
      {{ t('automations.space.readError', { reason: lecture.erreur.value }) }}</p>
    <p v-if="!lecture.lu.value" class="oa-mute">{{ t('common.loading') }}</p>
    <slot v-if="lecture.objet.value !== null" :objet="lecture.objet.value" />
  </template>
</template>

<style scoped>
.oa-mute { margin: 0 0 12px; font-size: 12.5px; color: var(--color-mute); }
.oa-err { margin: 0 0 12px; font-size: 12.5px; color: var(--color-terra-ink); }
</style>
