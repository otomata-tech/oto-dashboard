<script setup lang="ts">
import { onMounted, ref } from 'vue'
import ConsoleCard from './ConsoleCard.vue'
import Btn from './Btn.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { getTokens, createToken, deleteToken } from '@/api/console'
import type { ApiToken } from '@/types/api'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'

// Tokens CLI/API = identité du compte (/api/me/tokens, user-scoped) → ils vivent
// dans le hub compte, pas dans les connecteurs (qui sont org-scopés).
const { toast } = useToast()
const { promptForm, confirmAction } = usePrompt()

const tokens = ref<ApiToken[]>([])

async function reload() {
  tokens.value = (await getTokens().catch(() => ({ tokens: [] }))).tokens
}

async function newToken() {
  const r = await promptForm({
    title: 'new cli token', description: 'long-lived token for the oto cli and ci environments.',
    fields: [{ key: 'label', label: 'label', value: 'cli', placeholder: 'e.g. cli, ci' }], submitLabel: 'create',
  })
  if (!r) return
  try {
    const { token } = await createToken(r.label || undefined)
    await reload()
    await promptForm({ title: 'copy this token now', description: 'it is shown only once — store it in your secrets manager.', fields: [{ key: 'token', label: 'token', value: token }], submitLabel: 'done' })
  } catch (e) { toast(humanize(e)) }
}

async function revokeToken(t: ApiToken) {
  if (!await confirmAction({ title: 'revoke token', danger: true, confirmLabel: 'revoke', message: `revoke "${t.label}"?` })) return
  try { await deleteToken(t.id); toast('token revoked'); await reload() } catch (e) { toast(humanize(e)) }
}

onMounted(reload)
</script>

<template>
  <ConsoleCard id="tokens" title="cli & api tokens" flush
    sub="long-lived tokens for the oto cli and ci environments.">
    <template #actions><Btn kind="mini" icon="plus" @click="newToken">new token</Btn></template>
    <table class="tbl">
      <thead><tr><th>label</th><th>created</th><th>last used</th><th style="width: 80px"></th></tr></thead>
      <tbody>
        <tr v-for="t in tokens" :key="t.id">
          <td style="font-weight: 600; color: var(--color-ink)">{{ t.label }}</td>
          <td class="dim">{{ fmtDate(t.created_at) }}</td>
          <td class="dim">{{ fmtDate(t.last_used_at) ?? 'never' }}</td>
          <td style="text-align: right"><Btn kind="danger" @click="revokeToken(t)">revoke</Btn></td>
        </tr>
        <tr v-if="!tokens.length"><td colspan="4" class="dim" style="text-align: center; padding: 16px">no tokens yet</td></tr>
      </tbody>
    </table>
  </ConsoleCard>
</template>
