<script setup lang="ts">
// « Abonnements Claude » de l'org : son MODE puis son plafond de consommation.
//
// Le mode dit sur quel abonnement tournent les travaux de l'org : `personnel` (défaut), celui
// du demandeur ; `pool`, celui d'un membre qui l'a PRÊTÉ à l'org (le moins récemment servi
// d'abord ; sans prêteur libre, les travaux attendent). En pool, la carte dit combien de
// membres prêtent (`pool_size`) ; zéro = les travaux attendent, et le levier (prêter le sien,
// sur « Mon abonnement Claude ») est dans la phrase. Passer en pool est un choix sur l'argent
// des autres : l'avertissement s'affiche AVANT l'enregistrement, pas de modale.
//
// Le plafond : la part maximale de l'usage
// TOTAL du compte Claude de chaque membre (fenêtres 5 h et 7 j) que les runs de l'org
// peuvent atteindre. Lecture pour tout membre ; édition pour l'admin d'org (`canManage` =
// `canAdminister`, hors consultation — oto#211). Un membre peut se fixer un plafond plus
// strict sur « Mon abonnement Claude » : le plus bas des deux s'applique.
// Logique : `lib/modelSubscription.ts`.
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ConsoleCard from './ConsoleCard.vue'
import Btn from './Btn.vue'
import Tag from './Tag.vue'
import Notice from './Notice.vue'
import { useToast } from '@/composables/useToast'
import { humanize } from '@/lib/errors'
import { exactDate } from '@/lib/recentChanges'
import {
  errorKey, LIMIT_MAX, LIMIT_MIN, MODES, modeOf, PLATFORM_DEFAULT_LIMIT, useLimitDraft, useOrgModelSubscription,
} from '@/lib/modelSubscription'
import type { OrgModelSubscriptionMode } from '@/types/api'

const props = defineProps<{ orgId: number; canManage: boolean }>()

const { t, locale } = useI18n()
const { toast } = useToast()
const { cap, loaded, error, busy, load, set, modeBusy, modeError, setMode } = useOrgModelSubscription(() => props.orgId)
const { text, value, invalid, dirty, reset } = useLimitDraft(() => cap.value?.limit_pct)

function messageOf(e: unknown): string | null {
  if (!e) return null
  const k = errorKey(e)
  return k ? t(k) : humanize(e)
}
const errorMsg = computed(() => messageOf(error.value))
const modeErrorMsg = computed(() => messageOf(modeError.value))

// Le mode enregistré, et le brouillon de l'admin (réinitialisé à chaque relecture).
const mode = computed<OrgModelSubscriptionMode | null>(() => (cap.value ? modeOf(cap.value) : null))
const modeDraft = ref<OrgModelSubscriptionMode>('personnel')
watch(mode, (m) => { if (m) modeDraft.value = m }, { immediate: true })
const modeDirty = computed(() => mode.value !== null && modeDraft.value !== mode.value)

async function saveMode() {
  const m = modeDraft.value
  if (await setMode(m)) toast(t(`orgUi.modelSub.mode.toast.${m}`))
}
const updatedAt = computed(() =>
  cap.value?.updated_at ? exactDate(cap.value.updated_at, locale.value) : null)

async function save() {
  const v = value.value
  if (v == null) return
  if (await set(v)) toast(t('orgUi.modelSub.toastSaved', { pct: v }))
}

async function backToDefault() {
  if (await set(null)) toast(t('orgUi.modelSub.toastDefault', { pct: PLATFORM_DEFAULT_LIMIT }))
}

onMounted(load)
watch(() => props.orgId, load)
</script>

<template>
  <ConsoleCard :title="t('orgUi.modelSub.title')" :sub="t('orgUi.modelSub.sub')" data-test="org-limit-card">
    <template v-if="cap && mode" #actions>
      <Tag :tone="mode === 'pool' ? 'saffron' : 'ink'" data-test="org-mode-current">
        {{ t(`orgUi.modelSub.mode.name.${mode}`) }}
      </Tag>
      <Tag :tone="cap.default ? 'ink' : 'cobalt'" data-test="org-limit-current">
        {{ cap.default
          ? t('orgUi.modelSub.currentDefault', { pct: cap.limit_pct })
          : t('orgUi.modelSub.current', { pct: cap.limit_pct }) }}
      </Tag>
    </template>

    <div v-if="!loaded && busy" class="sk" style="height: 40px" />
    <Notice v-else-if="!loaded && errorMsg" tone="warn" data-test="org-limit-load-error">
      {{ t('orgUi.modelSub.unavailable') }} {{ errorMsg }}
      <Btn kind="link" type="button" @click="load">{{ t('common.retry') }}</Btn>
    </Notice>

    <template v-else-if="cap && mode">
    <!-- Le mode : qui paie les travaux de l'org. -->
    <form class="oms-body oms-mode" data-test="org-mode" @submit.prevent="saveMode">
      <div class="oms-label">{{ t('orgUi.modelSub.mode.label') }}</div>
      <p class="helptext" data-test="org-mode-desc">{{ t(`orgUi.modelSub.mode.desc.${mode}`) }}</p>
      <template v-if="mode === 'pool'">
        <Notice v-if="cap.pool_size === 0" tone="warn" data-test="org-pool-empty">
          {{ t('orgUi.modelSub.mode.poolEmpty') }}
          <RouterLink to="/account/claude">{{ t('orgUi.modelSub.mode.lendLink') }}</RouterLink>
        </Notice>
        <p v-else class="helptext" data-test="org-pool-size">
          {{ t('orgUi.modelSub.mode.poolSize', { n: cap.pool_size }, cap.pool_size) }}
          <RouterLink to="/account/claude">{{ t('orgUi.modelSub.mode.lendLink') }}</RouterLink>
        </p>
      </template>

      <template v-if="canManage">
        <div class="seg" role="radiogroup" :aria-label="t('orgUi.modelSub.mode.label')">
          <button v-for="m in MODES" :key="m" type="button" role="radio" :class="{ on: modeDraft === m }"
            :aria-checked="modeDraft === m" :data-test="`org-mode-${m}`" @click="modeDraft = m">
            {{ t(`orgUi.modelSub.mode.name.${m}`) }}
          </button>
        </div>
        <template v-if="modeDirty">
          <p class="helptext" data-test="org-mode-draft-desc">{{ t(`orgUi.modelSub.mode.desc.${modeDraft}`) }}</p>
          <Notice v-if="modeDraft === 'pool'" tone="warn" data-test="org-mode-warning">
            {{ t('orgUi.modelSub.mode.poolWarning') }}
          </Notice>
        </template>
        <Notice v-if="modeErrorMsg" tone="warn" data-test="org-mode-error">{{ modeErrorMsg }}</Notice>
        <div v-if="modeDirty" class="oms-actions">
          <Btn type="submit" :disabled="modeBusy" data-test="org-mode-save">{{ t('common.save') }}</Btn>
          <Btn kind="link" type="button" :disabled="modeBusy" @click="modeDraft = mode">{{ t('common.cancel') }}</Btn>
        </div>
      </template>
      <p v-else class="helptext dim" data-test="org-mode-readonly">{{ t('orgUi.modelSub.mode.readOnly') }}</p>
    </form>

    <form class="oms-body oms-limit" data-test="org-limit-form" @submit.prevent="save">
      <div class="oms-label">{{ t('orgUi.modelSub.limitLabel') }}</div>
      <p class="helptext" data-test="org-limit-desc">
        {{ cap.default
          ? t('orgUi.modelSub.descDefault', { pct: cap.limit_pct })
          : t('orgUi.modelSub.descSet', { pct: cap.limit_pct }) }}
        <span v-if="!cap.default && updatedAt" class="dim"> · {{ t('orgUi.modelSub.updated', { date: updatedAt }) }}</span>
      </p>
      <p class="helptext dim">{{ t('orgUi.modelSub.memberRule') }}</p>

      <template v-if="canManage">
        <label class="oms-field">
          <input v-model="text" class="inp mono" type="number" inputmode="numeric"
            :min="LIMIT_MIN" :max="LIMIT_MAX" step="1" :aria-label="t('orgUi.modelSub.inputLabel')"
            data-test="org-limit-input">
          <span>%</span>
          <span class="helptext">{{ t('modelSub.limit.bounds', { min: LIMIT_MIN, max: LIMIT_MAX }) }}</span>
        </label>
        <Notice v-if="errorMsg" tone="warn" data-test="org-limit-error">{{ errorMsg }}</Notice>
        <div class="oms-actions">
          <Btn type="submit" :disabled="busy || !dirty" data-test="org-limit-save">{{ t('common.save') }}</Btn>
          <Btn v-if="dirty || invalid" kind="link" type="button" :disabled="busy" @click="reset">
            {{ t('common.cancel') }}
          </Btn>
          <Btn v-if="!cap.default" kind="mini" type="button" :disabled="busy" data-test="org-limit-default"
            @click="backToDefault">
            {{ t('orgUi.modelSub.backToDefault', { pct: PLATFORM_DEFAULT_LIMIT }) }}
          </Btn>
        </div>
      </template>
      <p v-else class="helptext dim" data-test="org-limit-readonly">{{ t('orgUi.modelSub.readOnly') }}</p>
    </form>
    </template>
  </ConsoleCard>
</template>

<style scoped>
.oms-body { display: flex; flex-direction: column; gap: 10px; }
.oms-body .helptext { margin: 0; }
.oms-limit { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--color-hair-soft); }
.oms-label { font-size: var(--fs-body); font-weight: 600; color: var(--color-ink); }
.oms-field { display: flex; align-items: center; gap: 8px; font-size: var(--fs-body); color: var(--color-ink); }
.oms-field .inp { width: 88px; }
.oms-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
</style>
