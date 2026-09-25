<script setup lang="ts">
// « Abonnements Claude — plafond de consommation » de l'org : la part maximale de l'usage
// TOTAL du compte Claude de chaque membre (fenêtres 5 h et 7 j) que les runs de l'org
// peuvent atteindre. Lecture pour tout membre ; édition pour l'admin d'org (`canManage` =
// `canAdminister`, hors consultation — oto#211). Un membre peut se fixer un plafond plus
// strict sur « Mon abonnement Claude » : le plus bas des deux s'applique.
// Logique : `lib/modelSubscription.ts`.
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ConsoleCard from './ConsoleCard.vue'
import Btn from './Btn.vue'
import Tag from './Tag.vue'
import Notice from './Notice.vue'
import { useToast } from '@/composables/useToast'
import { humanize } from '@/lib/errors'
import { exactDate } from '@/lib/recentChanges'
import {
  errorKey, LIMIT_MAX, LIMIT_MIN, PLATFORM_DEFAULT_LIMIT, useLimitDraft, useOrgModelSubscription,
} from '@/lib/modelSubscription'

const props = defineProps<{ orgId: number; canManage: boolean }>()

const { t, locale } = useI18n()
const { toast } = useToast()
const { cap, loaded, error, busy, load, set } = useOrgModelSubscription(() => props.orgId)
const { text, value, invalid, dirty, reset } = useLimitDraft(() => cap.value?.limit_pct)

const errorMsg = computed(() => {
  if (!error.value) return null
  const k = errorKey(error.value)
  return k ? t(k) : humanize(error.value)
})
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
    <template v-if="cap" #actions>
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

    <form v-else-if="cap" class="oms-body" @submit.prevent="save">
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
  </ConsoleCard>
</template>

<style scoped>
.oms-body { display: flex; flex-direction: column; gap: 10px; }
.oms-body .helptext { margin: 0; }
.oms-field { display: flex; align-items: center; gap: 8px; font-size: var(--fs-body); color: var(--color-ink); }
.oms-field .inp { width: 88px; }
.oms-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
</style>
