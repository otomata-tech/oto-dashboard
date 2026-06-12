<script setup lang="ts">
import ConsoleCard from './ConsoleCard.vue'
import CopyField from './CopyField.vue'
import { MCP_URL } from '@/types/api'
</script>

<template>
  <ConsoleCard title="mcp endpoint" sub="point claude desktop, cursor or any mcp client here. auth via oauth.">
    <CopyField :value="MCP_URL" />
    <div class="helptext" style="margin-top: 10px">
      add it as a remote mcp server — your client opens the oauth flow against
      <code>auth.oto.zone</code> and inherits the tools enabled on your account.
    </div>
  </ConsoleCard>
</template>
