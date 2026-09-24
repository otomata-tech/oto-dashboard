<script setup lang="ts">
import { ref } from 'vue'
import Btn from '@/components/console/Btn.vue'
import Squiggle from '@/components/console/Squiggle.vue'
import { useMe } from '@/composables/useMe'
import { useToast } from '@/composables/useToast'
import { createMyOrg } from '@/api/console'
import { humanize } from '@/lib/errors'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const { reload } = useMe()
const { toast } = useToast()
const name = ref('')
const busy = ref(false)

async function create() {
  const n = name.value.trim()
  if (!n || busy.value) return
  busy.value = true
  try {
    await createMyOrg(n)
    await reload()          // me.active_org renseigné → le shell rend la console
  } catch (e) {
    toast(humanize(e))
    busy.value = false
  }
}
</script>

<template>
  <div class="state-empty" style="margin-top: 64px">
    <span class="o-medallion o-medallion-lg">o</span>
    <i18n-t keypath="orgUi.welcome.title" tag="div" class="se-title"><template #workspace><Squiggle>{{ t('orgUi.welcome.workspace') }}</Squiggle></template></i18n-t>
    <div class="se-body">
      {{ t('orgUi.welcome.body') }}
    </div>
    <div style="display: flex; gap: 8px; width: 100%; max-width: 380px; margin-top: 6px">
      <input v-model="name" class="inp" :placeholder="t('orgUi.welcome.placeholder')"
        :disabled="busy" @keyup.enter="create" />
      <Btn :disabled="busy" @click="create">{{ busy ? t('orgUi.welcome.creating') : t('orgUi.welcome.create') }}</Btn>
    </div>
    <div class="se-body" style="font-size: 12px; margin-top: 2px">
      {{ t('orgUi.welcome.invitation') }}
    </div>
  </div>
</template>
