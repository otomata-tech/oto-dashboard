<script setup lang="ts">
// Le bandeau RUNNER, en tête de /automations : un worker prend-il les travaux de
// l'org, quand a-t-il été vu, quels modèles sont servis.
//
// Il lit le bloc `runner` que `runner.triggers op=list` sert — la présence est une
// propriété de l'ORG, servie là. La page le reçoit de la carte des déclencheurs, qui
// fait déjà cet appel : deux lectures de la même route afficheraient deux instants.
//
// ⚠️ `workers` compte des IDENTITÉS de worker vues récemment (des secrets déclarés),
// pas des processus : une identité peut en faire tourner plusieurs.
// ⚠️ La présence d'un runner ne dit rien d'une campagne en particulier : « ça tourne »
// se lit sur les travaux de la campagne, pas ici.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ConsoleCard from '../ConsoleCard.vue'
import Notice from '../Notice.vue'
import Tag from '../Tag.vue'
import type { RunnerArme } from '@/api/console'
import { useMaintenant } from '@/composables/useRafraichissement'
import { ecart, instant } from '@/lib/runnerJobs'

const props = defineProps<{ runner: RunnerArme | null; loaded: boolean; error: string | null }>()
const { t } = useI18n()
const maintenant = useMaintenant()

const contact = computed(() => {
  const vu = instant(props.runner?.last_seen)
  if (vu === null) return t('automations.runner.neverSeen')
  const e = ecart(maintenant.value - vu)
  return t(`automations.time.${e.cle}`, { n: e.n })
})

const modeles = computed(() =>
  (props.runner?.models ?? []).filter((m) => m.served).map((m) => m.label))
</script>

<template>
  <ConsoleCard :title="t('automations.runner.title')" :sub="t('automations.runner.sub')">
    <template #actions><slot name="actions" /></template>
    <div class="card-body rb">
      <p v-if="error" class="rb-err" role="alert">{{ t('automations.runner.error', { reason: error }) }}</p>
      <p v-else-if="!loaded" class="rb-mute">{{ t('common.loading') }}</p>
      <p v-else-if="!runner" class="rb-mute">{{ t('automations.runner.notServed') }}</p>
      <template v-else>
        <p v-if="runner.armed" class="rb-line">
          <Tag tone="olive">{{ t('automations.runner.armedTag') }}</Tag>
          {{ t('automations.runner.armed') }}
        </p>
        <Notice v-else tone="warn">{{ t('automations.runner.notArmed') }}</Notice>
        <dl class="rb-dl">
          <div><dt>{{ t('automations.runner.lastSeen') }}</dt><dd>{{ contact }}</dd></div>
          <div :title="t('automations.runner.workersHint')">
            <dt>{{ t('automations.runner.workers') }}</dt><dd>{{ runner.workers }}</dd>
          </div>
          <div v-if="runner.armed">
            <dt>{{ t('automations.runner.models') }}</dt>
            <dd>{{ modeles.length ? modeles.join(', ') : t('automations.runner.noModel') }}</dd>
          </div>
        </dl>
        <p class="rb-mute">{{ t('automations.runner.workersHint') }}</p>
      </template>
    </div>
  </ConsoleCard>
</template>

<style scoped>
.rb { display: flex; flex-direction: column; gap: 8px; }
.rb-line { margin: 0; display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--color-ink); }
.rb-dl { display: flex; flex-wrap: wrap; gap: 8px 20px; margin: 0; }
.rb-dl div { display: flex; gap: 6px; align-items: baseline; }
.rb-dl dt { font-size: 11px; color: var(--color-faint); }
.rb-dl dd { margin: 0; font-size: 12.5px; font-weight: 600; color: var(--color-ink); }
.rb-mute { margin: 0; font-size: 11.5px; color: var(--color-mute); }
.rb-err { margin: 0; font-size: 12.5px; color: var(--color-terra-ink); }
</style>
