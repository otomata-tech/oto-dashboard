<script setup lang="ts">
import { computed, ref } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api } from '@/api'
import type { ConnectorMeta, ProviderStatus } from '@/types/api'

const props = defineProps<{
  connector: ConnectorMeta
  status?: ProviderStatus
  sessionConfigured?: boolean
}>()
const emit = defineEmits<{ changed: [] }>()

const draft = ref('')
const busy = ref(false)
const error = ref<string | null>(null)

const canSetKey = computed(
  () =>
    props.connector.secret_kind === 'api_key' &&
    props.connector.auth_modes.includes('byo_user') &&
    props.connector.availability === 'self_serve',
)

const source = computed(() => {
  if (props.connector.personal_session) {
    return props.sessionConfigured ? { label: 'session connectée', variant: 'default' as const } : { label: 'non connectée', variant: 'outline' as const }
  }
  const s = props.status
  if (!s) {
    return props.connector.availability === 'platform_granted'
      ? { label: 'sur autorisation', variant: 'outline' as const }
      : null
  }
  switch (s.mode) {
    case 'user':
      return { label: 'ta clé', variant: 'default' as const }
    case 'org':
      return { label: "clé d'org", variant: 'default' as const }
    case 'platform':
      return { label: `plateforme · ${s.quota_used_today}/${s.quota_daily ?? '∞'}`, variant: 'secondary' as const }
    case 'over_quota':
      return { label: 'quota dépassé', variant: 'destructive' as const }
    default:
      return { label: 'pose ta clé', variant: 'outline' as const }
  }
})

async function saveKey() {
  if (!draft.value.trim()) return
  busy.value = true
  error.value = null
  try {
    await api(`/api/settings/api-keys/${props.connector.name}`, {
      method: 'POST',
      body: JSON.stringify({ key: draft.value.trim() }),
    })
    draft.value = ''
    emit('changed')
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function clearKey() {
  busy.value = true
  error.value = null
  try {
    await api(`/api/settings/api-keys/${props.connector.name}`, { method: 'DELETE' })
    emit('changed')
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Card>
    <CardHeader class="pb-2">
      <div class="flex items-center justify-between gap-2">
        <CardTitle class="text-base">{{ connector.label }}</CardTitle>
        <Badge v-if="source" :variant="source.variant">{{ source.label }}</Badge>
      </div>
      <CardDescription>
        {{ connector.help }}
        <a v-if="connector.href" :href="connector.href" target="_blank" rel="noopener" class="underline ml-1">↗</a>
      </CardDescription>
    </CardHeader>
    <CardContent v-if="canSetKey" class="space-y-2">
      <div class="flex gap-2">
        <Input v-model="draft" type="password" placeholder="api key…" class="h-8" :disabled="busy" />
        <Button size="sm" :disabled="busy || !draft.trim()" @click="saveKey">enregistrer</Button>
        <Button
          v-if="status?.user_key_configured"
          size="sm"
          variant="outline"
          :disabled="busy"
          @click="clearKey"
        >
          effacer
        </Button>
      </div>
      <p v-if="error" class="text-xs text-destructive">{{ error }}</p>
    </CardContent>
  </Card>
</template>
