<script setup lang="ts">
// /automations/schedules/:id — UNE programmation (oto#214) : ce qui va se lancer (activation,
// horaire en mots, fuseau, modèle, prochaine exécution), ce qu'elle a perdu, et l'historique
// RÉEL de ses exécutions (`jobs op=list trigger_id=`, servi depuis oto-backend v1.212.0).
// Lue par `triggers op=get`, qui sert aussi la présence du runner et le catalogue des modèles.
//
// Une programmation WEBHOOK part quand sa source livre : ni horaire, ni fuseau, ni prochaine
// exécution. Elle se lit par l'adresse à donner à la source, ce qu'elle a reçu sur 24 h, ce
// qui attend dans sa file, et ses dernières livraisons (`WebhookDeliveries`).
//
// Le lien vers les réglages suit le serveur servi : `runner.triggers` est ouvert à tout membre,
// seule la consultation en lecture seule l'omet (le serveur y refuse toute écriture).
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import CopyField from '@/components/console/CopyField.vue'
import Notice from '@/components/console/Notice.vue'
import Tag from '@/components/console/Tag.vue'
import ObjetAdresse from '@/components/console/automations/ObjetAdresse.vue'
import RunnerJobList from '@/components/console/automations/RunnerJobList.vue'
import WebhookDeliveries from '@/components/console/automations/WebhookDeliveries.vue'
import { getRunnerTrigger } from '@/api/console'
import { useAffichesUrl } from '@/composables/useAffichesUrl'
import { useLectureParId } from '@/composables/useLectureParId'
import { useMe } from '@/composables/useMe'
import { estWebhook, historiqueDe, nomProgrammation } from '@/lib/automationsEspace'
import { cadenceEnMots } from '@/lib/cadence'
import { absDate } from '@/lib/cellRender'
import { droits, modeleDeclencheur } from '@/lib/runnerGestes'

const { t } = useI18n()
const { me } = useMe()

const lecture = useLectureParId((id) => getRunnerTrigger(id))
const { affiches, surAffiches } = useAffichesUrl()
const reglable = computed(() => droits(me.value).ouverts)
const filtreHistorique = computed(() =>
  (lecture.id.value === null ? null : historiqueDe('programmation', lecture.id.value)))
</script>

<template>
  <div class="content-inner">
    <ObjetAdresse :lecture="lecture" titre="automations.schedulePage.refused">
      <template #default="{ objet: { trigger, runner } }">
        <ConsoleCard :title="nomProgrammation(trigger)">
          <template #actions>
            <Tag :tone="trigger.enabled ? 'olive' : 'ink'" data-test="activation">
              {{ trigger.enabled ? t('automations.schedulePage.enabled') : t('automations.schedulePage.disabled') }}</Tag>
            <RouterLink v-if="reglable" :to="`/automations/schedules/${trigger.id}/settings`" class="btn-mini"
              data-test="lien-reglages">{{ t('automations.schedulePage.settings') }}</RouterLink>
          </template>
          <div class="card-body sv">
            <Notice v-if="trigger.enabled && runner && !runner.armed" tone="warn">
              {{ t('automations.runner.notArmed') }}</Notice>
            <dl class="sv-dl" data-test="apercu">
              <div>
                <dt>{{ t('automations.schedulePage.procedure') }}</dt>
                <dd><RouterLink :to="`/procedures/${encodeURIComponent(trigger.procedure)}`" class="sv-lien">
                  {{ trigger.procedure }}</RouterLink></dd>
              </div>
              <template v-if="estWebhook(trigger)">
                <div data-test="genre">
                  <dt>{{ t('automationsWebhook.trigger') }}</dt>
                  <dd><Tag tone="cobalt">{{ t('automationsWebhook.kind') }}</Tag> {{ t('automationsWebhook.triggerValue') }}</dd>
                </div>
                <div data-test="recues">
                  <dt>{{ t('automationsWebhook.received') }}</dt>
                  <dd>
                    {{ t('automationsWebhook.received24h', trigger.deliveries_24h ?? 0) }}<template
                      v-if="trigger.deliveries_refused_24h">, {{ t('automationsWebhook.refused24h', trigger.deliveries_refused_24h) }}</template>
                    <span class="sv-mute"> · {{ t('automationsWebhook.lastDelivery') }}
                      {{ trigger.last_delivery ? absDate(trigger.last_delivery) : t('automationsWebhook.none') }}</span>
                  </dd>
                </div>
                <div data-test="file">
                  <dt>{{ t('automationsWebhook.queue') }}</dt>
                  <dd>{{ t('automationsWebhook.queueValue', { pending: trigger.queue_pending ?? 0, held: trigger.queue_held ?? 0 }) }}</dd>
                </div>
              </template>
              <template v-else>
                <div>
                  <dt>{{ t('automations.schedulePage.schedule') }}</dt>
                  <dd>{{ cadenceEnMots(trigger.cron) ?? trigger.cron }} <span class="sv-mono">{{ trigger.cron }}</span></dd>
                </div>
                <div><dt>{{ t('automations.schedulePage.timezone') }}</dt><dd>{{ trigger.tz }}</dd></div>
              </template>
              <div>
                <dt>{{ t('automations.schedulePage.model') }}</dt>
                <dd>
                  {{ modeleDeclencheur(trigger.model, runner?.models ?? []).label ?? t('automations.triggers.form.workerModel') }}
                  <Tag v-if="modeleDeclencheur(trigger.model, runner?.models ?? []).nonServi" tone="terra">
                    {{ t('automations.triggers.form.notServed') }}</Tag>
                </dd>
              </div>
              <div v-if="!estWebhook(trigger)">
                <dt>{{ t('automations.schedulePage.next') }}</dt>
                <dd v-if="!trigger.enabled">{{ t('automations.schedulePage.nextNone') }}</dd>
                <dd v-else>{{ trigger.next_due ? absDate(trigger.next_due) : '—' }}</dd>
              </div>
              <div>
                <dt>{{ t('automations.schedulePage.lost') }}</dt>
                <dd>
                  {{ trigger.expired_count ?? '—' }}
                  <span v-if="trigger.expired_since" class="sv-mute">
                    · {{ t('automations.schedulePage.lostSince', { date: absDate(trigger.expired_since) }) }}</span>
                  <span v-if="trigger.expired_last" class="sv-mute">
                    · {{ t('automations.schedulePage.lostLast', { date: absDate(trigger.expired_last) }) }}</span>
                </dd>
              </div>
            </dl>
            <!-- L'adresse est composée par le serveur, sur le domaine qu'il annonce : jamais
                 reconstruite ici. Le secret ne se relit pas, il ne se montre donc pas. -->
            <CopyField v-if="estWebhook(trigger) && trigger.hook_url" :value="trigger.hook_url"
              :label="t('automationsWebhook.url')" data-test="adresse" />
          </div>
        </ConsoleCard>

        <ConsoleCard v-if="estWebhook(trigger)" :title="t('automationsWebhook.deliveries.title')"
          :sub="t('automationsWebhook.deliveries.sub')">
          <div class="card-body">
            <WebhookDeliveries :trigger-id="trigger.id" />
          </div>
        </ConsoleCard>

        <ConsoleCard v-if="filtreHistorique" :title="t('automations.schedulePage.history')"
          :sub="t('automations.schedulePage.historySub')">
          <div class="card-body" data-test="historique">
            <RouterLink :to="{ path: '/automations/executions', query: { schedule: String(lecture.id.value) } }"
              class="sv-lien sv-suivi" data-test="vers-suivi">{{ t('automationsFilters.seeInExecutions') }}</RouterLink>
            <RunnerJobList :filtre="filtreHistorique" :affiches="affiches" @update:affiches="surAffiches" />
          </div>
        </ConsoleCard>
      </template>
    </ObjetAdresse>
  </div>
</template>

<style scoped>
.sv { display: flex; flex-direction: column; gap: 12px; }
.sv-dl { display: flex; flex-wrap: wrap; gap: 8px 20px; margin: 0; }
.sv-dl div { display: flex; gap: 6px; align-items: baseline; }
.sv-dl dt { font-size: 11px; color: var(--color-faint); }
.sv-dl dd { margin: 0; font-size: 12.5px; color: var(--color-ink); }
.sv-mono { font-family: var(--font-mono, monospace); font-size: 11px; color: var(--color-mute); }
.sv-mute { font-size: 11.5px; color: var(--color-mute); }
.sv-lien { font-weight: 600; color: var(--color-saffron-ink); }
.sv-lien:hover { color: var(--color-ink); }
.sv-suivi { display: inline-block; margin-bottom: 8px; font-size: 12px; }
</style>
