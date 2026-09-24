<script setup lang="ts">
// « Mon abonnement Claude » (/account/claude) — brancher SON abonnement Claude (Pro, Max)
// pour que ses agents tournent dessus (`sub:sonnet|opus|haiku`). Palier membre : ni l'org
// ni un admin ne le lit ni ne le coupe. Logique du parcours : `lib/modelSubscription.ts`.
//
// Une action visible à la fois : l'état, puis UN bouton ; pendant la connexion, seule
// l'étape du code est à l'écran (les gestes de retrait reviennent une fois l'étape close).
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Btn from '@/components/console/Btn.vue'
import Notice from '@/components/console/Notice.vue'
import StateError from '@/components/console/StateError.vue'
import { usePrompt } from '@/composables/usePrompt'
import { useToast } from '@/composables/useToast'
import { humanize } from '@/lib/errors'
import { exactDate } from '@/lib/recentChanges'
import { errorKey, useModelSubscription, type SubscriptionEtat } from '@/lib/modelSubscription'

const { t, locale } = useI18n()
const { toast } = useToast()
const { confirmAction } = usePrompt()
const {
  sub, etat, loaded, step, loginUrl, notEnabled, error, busy,
  load, start, submitCode, restart, disconnect, destroy,
} = useModelSubscription()

const code = ref('')

const TAG: Record<SubscriptionEtat, string> = {
  none: 'ink', connected: 'olive', needs_login: 'saffron', paused_limit: 'saffron', disconnected: 'saffron',
}

const errorMsg = computed(() => {
  if (!error.value) return null
  const k = errorKey(error.value)
  return k ? t(k) : humanize(error.value)
})

const resetAt = computed(() =>
  sub.value?.limit_reset_at ? exactDate(sub.value.limit_reset_at, locale.value) : null)
const lastOk = computed(() =>
  sub.value?.last_ok_at ? exactDate(sub.value.last_ok_at, locale.value) : null)

// Se connecter n'a de sens que sans session vivante ; « reconnecter » quand il y en a eu une.
const canConnect = computed(() => ['none', 'needs_login', 'disconnected'].includes(etat.value))
// Retirer suppose une ligne ; un bac effacé n'en a plus.
const canRemove = computed(() => etat.value !== 'none')

async function connect() {
  code.value = ''
  const url = await start()
  // `noopener` : l'onglet d'Anthropic ne peut pas remonter jusqu'au dashboard. Ouvert
  // APRÈS un aller-retour réseau, il peut être bloqué — d'où le lien de secours.
  if (url) window.open(url, '_blank', 'noopener')
}

async function validate() {
  if (await submitCode(code.value)) {
    code.value = ''
    toast(t('modelSub.toastConnected'))
  }
}

async function onDisconnect() {
  if (await disconnect()) toast(t('modelSub.toastDisconnected'))
}

async function onDestroy() {
  const ok = await confirmAction({
    title: t('modelSub.destroyTitle'),
    message: t('modelSub.destroyMessage'),
    confirmLabel: t('modelSub.destroy'),
    danger: true,
  })
  if (ok && await destroy()) toast(t('modelSub.toastDestroyed'))
}

onMounted(load)
</script>

<template>
  <div class="content-inner narrow fadein">
    <div v-if="!loaded && busy" class="sk-card" />
    <StateError v-else-if="!loaded && error" :message="errorMsg ?? ''" @retry="load" />

    <ConsoleCard v-else-if="loaded" :title="t('modelSub.title')" :sub="t('modelSub.sub')">
      <template #actions>
        <span class="tag" :class="TAG[etat]" data-test="etat">{{ t(`modelSub.state.${etat}`) }}</span>
      </template>

      <div class="ms-body">
        <!-- L'état, en une phrase, et ce qu'il veut dire pour les agents. -->
        <p class="helptext" data-test="etat-desc">
          <template v-if="etat === 'connected'">
            {{ sub?.plan ? t('modelSub.desc.connectedPlan', { plan: sub.plan }) : t('modelSub.desc.connected') }}
            <span v-if="lastOk" class="dim"> · {{ t('modelSub.lastOk', { date: lastOk }) }}</span>
          </template>
          <template v-else-if="etat === 'paused_limit'">
            {{ resetAt ? t('modelSub.desc.pausedUntil', { date: resetAt }) : t('modelSub.desc.paused') }}
          </template>
          <template v-else>{{ t(`modelSub.desc.${etat}`) }}</template>
        </p>
        <p v-if="sub && sub.waiting_jobs > 0" class="ms-waiting" data-test="waiting">
          {{ t('modelSub.waiting', { n: sub.waiting_jobs }, sub.waiting_jobs) }}
        </p>

        <!-- Option non ouverte : on le DIT, et le bouton qui échouerait disparaît. -->
        <Notice v-if="notEnabled" tone="info" data-test="not-enabled">
          {{ t('modelSub.notEnabled') }}
        </Notice>

        <template v-else-if="step === 'code'">
          <p class="ms-step">{{ t('modelSub.codeStep') }}</p>
          <p class="helptext">
            {{ t('modelSub.fallback') }}
            <a :href="loginUrl ?? undefined" target="_blank" rel="noopener" data-test="fallback">
              {{ t('modelSub.fallbackLink') }}</a>
          </p>
          <form class="ms-code" @submit.prevent="validate">
            <input v-model="code" class="inp mono" :placeholder="t('modelSub.codePlaceholder')"
              :aria-label="t('modelSub.codePlaceholder')" autocomplete="off" spellcheck="false">
            <Btn type="submit" :disabled="busy || !code.trim()">
              {{ busy ? t('modelSub.validating') : t('modelSub.validate') }}
            </Btn>
          </form>
          <p class="helptext dim">{{ t('modelSub.teamNote') }}</p>
          <Btn kind="link" type="button" :disabled="busy" @click="restart">{{ t('modelSub.restart') }}</Btn>
        </template>

        <div v-else-if="canConnect" class="ms-actions">
          <Btn icon="external-link" :disabled="busy" @click="connect">
            {{ etat === 'none' ? t('modelSub.connect') : t('modelSub.reconnect') }}
          </Btn>
        </div>

        <Notice v-if="errorMsg" tone="warn" data-test="error">{{ errorMsg }}</Notice>

        <p class="helptext dim">{{ t('modelSub.trust') }}</p>

        <div v-if="canRemove && step === 'idle'" class="ms-actions ms-remove">
          <Btn v-if="etat !== 'disconnected'" kind="mini" :disabled="busy" @click="onDisconnect">
            {{ t('modelSub.disconnect') }}
          </Btn>
          <Btn kind="danger" :disabled="busy" @click="onDestroy">{{ t('modelSub.destroy') }}</Btn>
        </div>
      </div>
    </ConsoleCard>
  </div>
</template>

<style scoped>
.ms-body { display: flex; flex-direction: column; gap: 12px; }
.ms-body .helptext { margin: 0; }
.ms-waiting { margin: 0; font-size: var(--fs-small); color: var(--color-saffron-ink); font-weight: 600; }
.ms-step { margin: 0; font-size: var(--fs-body); color: var(--color-ink); }
.ms-code { display: flex; gap: 8px; align-items: center; }
.ms-code .inp { flex: 1; min-width: 0; }
.ms-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.ms-remove { padding-top: 12px; border-top: 1px solid var(--color-hair-soft); }
</style>
