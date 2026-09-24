<script setup lang="ts">
import Dot from './Dot.vue'
import Btn from './Btn.vue'
import Squiggle from './Squiggle.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// Erreur amont, session TOUJOURS valide (le cas `stale_session` est intercepté hors
// shell par ConsoleLayout → SessionExpired). Ici : « on n'a pas pu joindre oto-mcp »,
// ça se règle souvent par un retry.
defineProps<{ message: string }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div class="state-error">
    <div class="se-card">
      <div class="se-head">
        <Dot tone="terra" :size="9" />
        <div class="t">{{ t('miscUi.stateError.title') }}</div>
      </div>
      <div class="se-msg">
        {{ message }} <i18n-t keypath="miscUi.stateError.msg" tag="span"><template #retry><Squiggle>{{ t('miscUi.stateError.retry') }}</Squiggle></template></i18n-t>
      </div>
      <div class="se-cta">
        <Btn @click="$emit('retry')">{{ t('miscUi.stateError.retryNow') }}</Btn>
        <Btn kind="ghost" icon="ext" @click="$emit('retry')">{{ t('miscUi.stateError.status') }}</Btn>
      </div>
    </div>
  </div>
</template>
