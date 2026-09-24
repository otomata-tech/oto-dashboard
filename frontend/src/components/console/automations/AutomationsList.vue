<script setup lang="ts">
// La LISTE des automatisations de l'org, sur l'entrée de l'espace (oto#214, 24/09/2026) :
// programmations (horaire ou webhook) et campagnes dans une seule liste, une ligne par objet,
// son nom menant à sa fiche. Décision d'Alexis, inspirée de Tulina : une campagne n'est pas
// une rubrique à part, c'est une automatisation parmi les autres, marquée de son genre.
//
// Rien n'est lu ici : les programmations (avec la présence du runner) et les campagnes sont
// lues par la page, et partagées avec « à surveiller ». Leur erreur est dite dans ce bloc
// sans alerte : « à surveiller » la porte déjà. Sans la bêta, il n'y a pas de campagne, sans
// rouge. Les gestes restent sur les fiches.
//
// Ordre : les actives d'abord (programmation activée, campagne vivante), puis les autres ;
// dans chaque groupe, programmations dans l'ordre servi, puis campagnes rangées par
// `repartir` (vivantes, récentes, anciennes ; la plus récemment basculée en tête). Plus de
// repli : la liste est courte, une ligne par objet.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ConsoleCard from '../ConsoleCard.vue'
import Tag from '../Tag.vue'
import type { RunnerTrigger } from '@/api/console'
import type { Campagnes } from '@/composables/useCampagnes'
import { useMaintenant } from '@/composables/useRafraichissement'
import { estWebhook, nomProgrammation } from '@/lib/automationsEspace'
import { cadenceEnMots } from '@/lib/cadence'
import { absDate } from '@/lib/cellRender'
import { estVivante, libelleCampagne, nomCampagne, repartir } from '@/lib/runnerFleets'
import type { Ton } from '@/lib/runnerJobs'

const props = defineProps<{
  triggers: RunnerTrigger[]; triggersLus: boolean; triggersErreur: string | null; campagnes: Campagnes
}>()
const { t } = useI18n()
const maintenant = useMaintenant()

type Genre = 'schedule' | 'webhook' | 'campaign'
interface Ligne { cle: string; nom: string; to: string; genre: Genre; legende: string; ton: Ton; etat: string; active: boolean }

function legendeProgrammation(tr: RunnerTrigger): string {
  if (estWebhook(tr)) return t('automationsWebhook.received24h', tr.deliveries_24h ?? 0)
  const cadence = cadenceEnMots(tr.cron) ?? tr.cron ?? ''
  return tr.enabled && tr.next_due
    ? `${cadence} · ${t('automationsList.next', { date: absDate(tr.next_due) })}`
    : cadence
}

const lignes = computed<Ligne[]>(() => {
  const programmations = props.triggers.map((tr): Ligne => ({
    cle: `t${tr.id}`, nom: nomProgrammation(tr), to: `/automations/schedules/${tr.id}`,
    genre: estWebhook(tr) ? 'webhook' : 'schedule', legende: legendeProgrammation(tr),
    ton: tr.enabled ? 'olive' : 'ink',
    etat: t(tr.enabled ? 'automations.schedulePage.enabled' : 'automations.schedulePage.disabled'),
    active: tr.enabled,
  }))
  const g = repartir(props.campagnes.fleets, maintenant.value)
  const campagnes = [...g.vivantes, ...g.recentes, ...g.anciennes].map((f): Ligne => {
    const l = libelleCampagne(f, null)
    return {
      cle: `f${f.id}`, nom: nomCampagne(f), to: `/automations/campaigns/${f.id}`, genre: 'campaign',
      legende: f.procedure ?? '', ton: l.ton, etat: t(l.cle, l.params), active: estVivante(f),
    }
  })
  const toutes = [...programmations, ...campagnes]
  return [...toutes.filter((x) => x.active), ...toutes.filter((x) => !x.active)]
})

const lu = computed(() => props.triggersLus && props.campagnes.lu)
const vide = computed(() => lu.value && !lignes.value.length && !props.triggersErreur && !props.campagnes.erreur)
</script>

<template>
  <ConsoleCard :title="t('automationsList.title')" :sub="t('automationsList.sub')">
    <div class="card-body al" data-test="automatisations">
      <p v-if="triggersErreur" class="al-err" data-test="erreur-programmations">
        {{ t('automations.watch.schedulesError', { reason: triggersErreur }) }}</p>
      <p v-if="campagnes.erreur" class="al-err" data-test="erreur-campagnes">
        {{ t('automations.campaigns.error', { reason: campagnes.erreur }) }}</p>
      <p v-if="!lu" class="al-mute">{{ t('common.loading') }}</p>
      <p v-else-if="vide" class="al-mute" data-test="aucune">{{ t('automationsList.empty') }}</p>
      <ul v-if="lignes.length" class="al-list">
        <li v-for="l in lignes" :key="l.cle" class="al-item" :data-ligne="l.cle">
          <span class="al-point" :class="{ 'al-point--on': l.active }" aria-hidden="true" />
          <RouterLink :to="l.to" class="al-nom">{{ l.nom }}</RouterLink>
          <Tag :tone="l.genre === 'campaign' ? 'saffron' : 'cobalt'" data-test="genre">
            {{ t(`automationsList.kind.${l.genre}`) }}</Tag>
          <span class="al-legende">{{ l.legende }}</span>
          <Tag :tone="l.ton" class="al-etat" data-test="etat">{{ l.etat }}</Tag>
        </li>
      </ul>
    </div>
  </ConsoleCard>
</template>

<style scoped>
.al { display: flex; flex-direction: column; gap: 8px; }
.al-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.al-item {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; padding: 8px 0;
  border-top: 1px solid var(--color-hair); font-size: 12.5px;
}
.al-item:first-child { border-top: 0; }
.al-point { width: 7px; height: 7px; border-radius: 50%; background: var(--color-hair); flex: none; }
.al-point--on { background: var(--color-olive); }
.al-nom { font-weight: 600; color: var(--color-ink); }
.al-nom:hover { color: var(--color-saffron-ink); }
.al-legende { font-size: 11.5px; color: var(--color-mute); min-width: 0; }
.al-etat { margin-left: auto; }
.al-mute { margin: 0; font-size: 12.5px; color: var(--color-mute); }
.al-err { margin: 0; font-size: 12.5px; color: var(--color-terra-ink); }
</style>
