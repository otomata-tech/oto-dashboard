<script setup lang="ts">
import { onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Toggle from '@/components/console/Toggle.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { getAdminConnectors, setConnectorActivation } from '@/api/console'
import type { ConnectorActivation } from '@/types/api'
import { humanize } from '@/lib/errors'

const { toast } = useToast()
const { confirmAction } = usePrompt()
const connectors = ref<ConnectorActivation[]>([])
const error = ref<string | null>(null)

async function load() {
  try { connectors.value = (await getAdminConnectors()).connectors }
  catch (e) { error.value = humanize(e) }
}
onMounted(load)

async function toggle(c: ConnectorActivation) {
  const next = c.enabled !== true
  // Désactiver impacte tous les users → confirmer. Activer = direct.
  if (!next && !(await confirmAction({
    title: 'disable connector', danger: true, confirmLabel: 'disable',
    message: `disable "${c.label}" platform-wide? its tools stop loading on the next server restart.`,
  }))) return
  try {
    await setConnectorActivation(c.connector, next)
    toast(`${c.label} ${next ? 'enabled' : 'disabled'} — effective on next server restart`)
    await load()
  } catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <ConsoleCard flush title="connector activation"
      sub="enable/disable connectors platform-wide. a connector declared in code stays inert until activated here (deny-by-default). takes effect on the next server restart.">
      <table class="tbl">
        <thead><tr><th>connector</th><th>namespaces</th><th>status</th><th style="width: 60px"></th></tr></thead>
        <tbody>
          <tr v-for="c in connectors" :key="c.connector">
            <td>
              <div style="font-weight: 600; color: var(--color-ink)">{{ c.label }}</div>
              <div style="font-size: 11px; color: var(--color-faint)">{{ c.connector }}<template v-if="c.help"> — {{ c.help }}</template></div>
            </td>
            <td class="dim" style="max-width: 320px"><code class="mono" style="word-break: break-word">{{ c.namespaces.join(', ') }}</code></td>
            <td>
              <span :style="{ fontSize: '11px', fontWeight: 600, color: c.enabled ? 'var(--color-ink)' : 'var(--color-faint)' }">
                {{ c.enabled ? 'active' : 'off' }}
              </span>
            </td>
            <td style="text-align: right"><Toggle :on="c.enabled === true" @change="toggle(c)" /></td>
          </tr>
          <tr v-if="!connectors.length">
            <td colspan="4" class="dim" style="text-align: center; padding: 16px">no connectors</td>
          </tr>
        </tbody>
      </table>
    </ConsoleCard>
  </div>
</template>
