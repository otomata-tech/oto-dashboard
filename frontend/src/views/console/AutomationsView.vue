<script setup lang="ts">
// /automations — l'ESPACE Automatisations (oto#214). Page unique refondue par oto#205, c'est
// désormais une entrée et des pages adressables sous une navigation persistante :
// Campagnes · Programmations · Exécutions.
//
// L'espace tient ce qui est commun à ses pages :
//   • l'en-tête : le fil d'Ariane, la navigation (`SubTabs`), le bouton « Rafraîchir » ;
//   • le RAFRAÎCHISSEMENT (`fournirRafraichissement`) : seules les sections de la page montée
//     s'y inscrivent — une page quittée se désinscrit —, rien ne part onglet caché, et
//     l'intervalle ne tourne que si la page affiche une campagne vivante.
// La page montée est choisie par `meta.detail` (`lib/automationsEspace`) et remontée à chaque
// changement de CHEMIN : un filtre ou un pli, portés par la query, ne remontent rien.
import { computed, ref, watch, type Component } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Btn from '@/components/console/Btn.vue'
import SubTabs from '@/components/console/SubTabs.vue'
import { fournirRafraichissement } from '@/composables/useRafraichissement'
import { filDAriane, pageDe, RUBRIQUES, rubriqueDe, type PageEspace } from '@/lib/automationsEspace'
import AutomationsHomeView from './automations/AutomationsHomeView.vue'
import CampaignView from './automations/CampaignView.vue'
import CampaignsView from './automations/CampaignsView.vue'
import ExecutionView from './automations/ExecutionView.vue'
import ExecutionsView from './automations/ExecutionsView.vue'
import ScheduleSettingsView from './automations/ScheduleSettingsView.vue'
import ScheduleView from './automations/ScheduleView.vue'
import SchedulesView from './automations/SchedulesView.vue'

const PAGES: Record<PageEspace, Component> = {
  accueil: AutomationsHomeView,
  campagnes: CampaignsView,
  campagne: CampaignView,
  programmations: SchedulesView,
  programmation: ScheduleView,
  reglages: ScheduleSettingsView,
  executions: ExecutionsView,
  execution: ExecutionView,
}

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const page = computed(() => pageDe(route.meta.detail))
const rubrique = computed(() => rubriqueDe(page.value))
const onglets = computed(() => RUBRIQUES.map((r) => ({ key: r.cle, label: t(r.label) })))
const fil = computed(() => filDAriane(page.value, typeof route.params.id === 'string' ? route.params.id : null))

// Une campagne vivante sur la page affichée fait tourner l'intervalle ; une page quittée
// n'en signale plus.
const vivante = ref(false)
watch(() => route.path, () => { vivante.value = false })
const { toutCharger, enCours } = fournirRafraichissement({ actif: () => vivante.value })

function aller(cle: string) {
  const r = RUBRIQUES.find((x) => x.cle === cle)
  if (r) void router.push(r.path)
}
</script>

<template>
  <div class="ae-head">
    <nav class="eyebrow-row ae-fil" :aria-label="t('automations.space.crumbLabel')" data-test="fil">
      <template v-for="(m, i) in fil" :key="i">
        <span v-if="i" class="eyebrow" aria-hidden="true">›</span>
        <RouterLink v-if="m.to" :to="m.to" class="eyebrow ae-lien">{{ t(m.label, m.params) }}</RouterLink>
        <span v-else class="eyebrow ae-ici" aria-current="page">{{ t(m.label, m.params) }}</span>
      </template>
    </nav>
    <div class="ae-barre">
      <SubTabs :tabs="onglets" :model-value="rubrique ?? ''" :aria-label="t('automations.space.label')"
        data-test="navigation" @update:model-value="aller" />
      <Btn kind="mini" :disabled="enCours" :aria-busy="enCours" data-test="rafraichir" @click="toutCharger">
        {{ enCours ? t('automations.refreshing') : t('automations.refresh') }}</Btn>
    </div>
  </div>

  <component :is="PAGES[page]" :key="route.path" @vivante="(oui: boolean) => (vivante = oui)" />
</template>

<style scoped>
.ae-head { display: flex; flex-direction: column; gap: 10px; }
.ae-fil { flex-wrap: wrap; gap: 6px; }
.ae-lien { text-decoration: none; }
.ae-lien:hover { color: var(--color-ink); }
.ae-ici { color: var(--color-ink); }
.ae-barre { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 10px; }
</style>
