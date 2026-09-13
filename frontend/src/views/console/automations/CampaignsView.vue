<script setup lang="ts">
// /automations/campaigns — toutes les campagnes de l'org (oto#214), filtrables par statut.
// La liste est celle des lots 1 et 2 (`CampaignsSection` : ordre, repli, gestes, compteurs) ;
// chaque carte mène à la page de sa campagne. Le filtre vit dans l'URL (`?status=`) : retour
// navigateur et rechargement le gardent, et une valeur inconnue se dit ignorée.
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import OtoSelect from '@/components/console/OtoSelect.vue'
import CampaignsSection from '@/components/console/automations/CampaignsSection.vue'
import { FILTRES_CAMPAGNE, filtreCampagnes, queryAvecFiltre } from '@/lib/automationsEspace'

const emit = defineEmits<{ vivante: [oui: boolean] }>()
const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const lecture = computed(() => filtreCampagnes(route.query))
const options = computed<{ value: string; label: string }[]>(() =>
  FILTRES_CAMPAGNE.map((f) => ({ value: f, label: t(`automations.campaigns.filter.${f}`) })))

function choisir(valeur: string) {
  void router.push({ query: queryAvecFiltre(route.query, 'status', valeur) })
}
</script>

<template>
  <div class="content-inner">
    <p v-if="lecture.ignores.length" class="cv-mute" data-test="ignores">
      {{ t('automations.space.ignoredFilter', { filters: lecture.ignores.join(', ') }) }}</p>
    <CampaignsSection :filtre="lecture.valeur" @vivante="(oui) => emit('vivante', oui)">
      <template #actions>
        <OtoSelect :model-value="lecture.valeur ?? ''" :options="options" size="sm"
          :none-label="t('automations.campaigns.filter.all')" :aria-label="t('automations.campaigns.filter.label')"
          @update:model-value="choisir" />
      </template>
    </CampaignsSection>
  </div>
</template>

<style scoped>
.cv-mute { margin: 0; font-size: 12.5px; color: var(--color-mute); }
</style>
