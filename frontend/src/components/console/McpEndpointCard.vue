<script setup lang="ts">
import ConsoleCard from './ConsoleCard.vue'
import CopyField from './CopyField.vue'
import { MCP_URL } from '@/types/api'
import { authHost } from '@/lib/servedEnv'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <ConsoleCard :title="t('miscUi.mcp.title')" :sub="t('miscUi.mcp.sub')">
    <CopyField :value="MCP_URL" />
    <div class="helptext" style="margin-top: 10px">
      <i18n-t keypath="miscUi.mcp.help" tag="span"><template #host><code>{{ authHost() }}</code></template></i18n-t>
    </div>
  </ConsoleCard>
</template>
