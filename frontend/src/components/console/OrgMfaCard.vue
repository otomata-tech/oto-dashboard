<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import ConsoleCard from './ConsoleCard.vue'
import Btn from './Btn.vue'
import Tag from './Tag.vue'
import { getOrgMfa, setOrgMfa } from '@/api/console'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { humanize } from '@/lib/errors'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// MFA obligatoire de l'org : lecture pour tout membre, bascule pour l'org_admin.
// L'activation impose un 2ᵉ facteur à tous les membres au prochain login (Logto).
const props = defineProps<{ orgId: number; canManage: boolean }>()

const { toast } = useToast()
const { confirmAction } = usePrompt()

const requireMfa = ref(false)
const loading = ref(true)
const error = ref(false)
const busy = ref(false)

async function reload() {
  loading.value = true
  error.value = false
  try {
    requireMfa.value = (await getOrgMfa(props.orgId)).require_mfa
  } catch (e) {
    error.value = true
    toast(humanize(e))
  } finally {
    loading.value = false
  }
}

async function toggle() {
  const enabling = !requireMfa.value
  if (enabling && !await confirmAction({
    title: t('orgUi.mfa.askTitle'),
    confirmLabel: t('orgUi.mfa.enable'),
    message: t('orgUi.mfa.askMessage'),
  })) return
  busy.value = true
  try {
    await setOrgMfa(props.orgId, enabling)
    requireMfa.value = enabling
    toast(enabling ? t('orgUi.mfa.enabled') : t('orgUi.mfa.notEnforced'))
  } catch (e) {
    toast(humanize(e))
  } finally {
    busy.value = false
  }
}

onMounted(reload)
watch(() => props.orgId, reload)
</script>

<template>
  <ConsoleCard :title="t('orgUi.mfa.title')"
    :sub="t('orgUi.mfa.sub')">
    <template v-if="canManage" #actions>
      <Btn kind="mini" :disabled="busy || loading || error" @click="toggle">
        {{ requireMfa ? t('orgUi.mfa.disable') : t('orgUi.mfa.enable') }}
      </Btn>
    </template>

    <p v-if="loading" class="helptext" style="padding: 8px 2px">{{ $t('common.loading') }}</p>
    <p v-else-if="error" class="helptext" style="padding: 8px 2px">{{ t('orgUi.mfa.unavailable') }}</p>
    <div v-else class="mfa-state">
      <Tag :tone="requireMfa ? 'olive' : 'ink'">{{ requireMfa ? t('orgUi.mfa.enforced') : t('orgUi.mfa.notEnforced') }}</Tag>
      <span class="helptext">
        {{ requireMfa
          ? t('orgUi.mfa.required')
          : t('orgUi.mfa.optional') }}
      </span>
    </div>
  </ConsoleCard>
</template>

<style scoped>
.mfa-state { display: flex; align-items: center; gap: 8px; padding: 8px 2px; }
</style>
