<script setup lang="ts">
// Les CAMPAGNES, au centre de /automations (oto#205).
//
// Ordre : les vivantes (`armed`, `running`, `stopping`), puis les récentes, puis un
// repli « N campagnes anciennes » dont le compteur est celui de la liste servie. Les
// cartes vivantes et récentes s'ouvrent seules ; les anciennes ne lisent leur état
// qu'à l'ouverture.
//
// ⚠️ Sans l'option bêta de l'org, toute opération sur les flottes répond 403
// `beta_required`. Ce n'est pas une panne : l'écran le dit comme un fait, sans rouge.
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ConsoleCard from '../ConsoleCard.vue'
import CampaignCard from './CampaignCard.vue'
import { ApiError } from '@/api'
import { listRunnerFleets, type RunnerFleet, type RunnerJob } from '@/api/console'
import { inscrireRafraichissement, useMaintenant } from '@/composables/useRafraichissement'
import { humanize } from '@/lib/errors'
import { RECENTE_JOURS, repartir } from '@/lib/runnerFleets'

const emit = defineEmits<{ ouvrir: [job: RunnerJob]; vivante: [oui: boolean] }>()
const { t } = useI18n()
const maintenant = useMaintenant()

const fleets = ref<RunnerFleet[]>([])
const loaded = ref(false)
const error = ref<string | null>(null)
const betaAbsente = ref(false)
const anciennesOuvertes = ref(false)

async function charger() {
  try {
    fleets.value = (await listRunnerFleets()).fleets
    error.value = null
    betaAbsente.value = false
  } catch (e) {
    if (e instanceof ApiError && e.status === 403 && e.code === 'beta_required') {
      betaAbsente.value = true
      fleets.value = []
      error.value = null
    } else {
      error.value = humanize(e)
    }
  } finally {
    loaded.value = true
  }
}

const groupes = computed(() => repartir(fleets.value, maintenant.value))
const enTete = computed(() => [...groupes.value.vivantes, ...groupes.value.recentes])

watch(() => groupes.value.vivantes.length > 0, (oui) => emit('vivante', oui), { immediate: true })

onMounted(charger)
inscrireRafraichissement(charger)
</script>

<template>
  <ConsoleCard :title="t('automations.campaigns.title')" :sub="t('automations.campaigns.sub')">
    <div class="card-body">
      <p v-if="betaAbsente" class="cs-mute" data-test="beta">{{ t('automations.campaigns.betaOff') }}</p>
      <template v-else>
        <p v-if="error" class="cs-err" role="alert">
          {{ t('automations.campaigns.error', { reason: error }) }}</p>
        <p v-if="!loaded" class="cs-mute">{{ t('common.loading') }}</p>
        <p v-else-if="!fleets.length && !error" class="cs-mute">{{ t('automations.campaigns.empty') }}</p>

        <ul v-if="enTete.length" class="cs-list">
          <CampaignCard v-for="f in enTete" :key="f.id" :fleet="f" :ouverte-par-defaut="true"
            @ouvrir="(j) => emit('ouvrir', j)" />
        </ul>

        <div v-if="groupes.anciennes.length" class="cs-fold">
          <button type="button" class="cs-fold-btn" :aria-expanded="anciennesOuvertes"
            @click="anciennesOuvertes = !anciennesOuvertes">
            {{ t('automations.campaigns.older', groupes.anciennes.length) }}
            <span class="cs-mute">· {{ t('automations.campaigns.olderHint', { days: RECENTE_JOURS }) }}</span>
          </button>
          <ul v-if="anciennesOuvertes" class="cs-list">
            <CampaignCard v-for="f in groupes.anciennes" :key="f.id" :fleet="f" :ouverte-par-defaut="false"
              @ouvrir="(j) => emit('ouvrir', j)" />
          </ul>
        </div>
      </template>
    </div>
  </ConsoleCard>
</template>

<style scoped>
.cs-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.cs-fold { margin-top: 14px; border-top: 1px solid var(--color-hair); padding-top: 10px; }
.cs-fold-btn {
  font: inherit; font-size: 12.5px; font-weight: 600; color: var(--color-ink);
  background: none; border: 0; padding: 0; cursor: pointer; text-align: left; margin-bottom: 10px;
}
.cs-mute { margin: 0; font-size: 12.5px; font-weight: 400; color: var(--color-mute); }
.cs-err { margin: 0 0 8px; font-size: 12.5px; color: var(--color-terra-ink); }
</style>
