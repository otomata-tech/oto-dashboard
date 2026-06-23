<script setup lang="ts">
// Widget credential HÉBERGÉ (unipile, ADR 0024 R1) — rendu INLINE dans la
// ConnectorCard (fin de la carte ancrée #messaging). Add-on payant : abonnement par
// canal + login hébergé Unipile (pas de cookie/extension), les outils agissent comme
// toi. Auto-suffisant : charge son propre statut.
import { onMounted, ref } from 'vue'
import Btn from './Btn.vue'
import Dot from './Dot.vue'
import Tag from './Tag.vue'
import { getUnipileStatus, subscribeUnipile, connectUnipile, disconnectUnipile } from '@/api/console'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { humanize } from '@/lib/errors'
import { fmtDate } from '@/types/api'
import type { UnipileStatus } from '@/types/api'

const { toast } = useToast()
const { confirmAction } = usePrompt()
const unipile = ref<UnipileStatus | null>(null)
const loading = ref(true)

const channels = [
  { key: 'linkedin', label: 'linkedin', desc: 'search, scrape & message as you' },
  { key: 'whatsapp', label: 'whatsapp', desc: 'read & send messages as you' },
  { key: 'telegram', label: 'telegram', desc: 'read & send messages as you' },
  { key: 'instagram', label: 'instagram', desc: 'read & send DMs as you' },
  { key: 'messenger', label: 'messenger', desc: 'read & send messages as you' },
  { key: 'twitter', label: 'x / twitter', desc: 'read & send DMs as you' },
] as const

async function refresh() { unipile.value = await getUnipileStatus().catch(() => null) }
onMounted(async () => { await refresh(); loading.value = false })

async function activate() {
  try { const { checkout_url } = await subscribeUnipile(); window.location.href = checkout_url } catch (e) { toast(humanize(e)) }
}
async function link(channel: string) {
  try { const { url } = await connectUnipile(channel); window.location.href = url } catch (e) { toast(humanize(e)) }
}
async function drop(channel: string) {
  if (!await confirmAction({ title: `disconnect ${channel} (unipile)`, danger: true, confirmLabel: 'disconnect', message: `disconnect your ${channel}? the unipile tools will stop acting as you on this channel.` })) return
  try { await disconnectUnipile(channel); toast(`${channel} disconnected`); await refresh() } catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="hw">
    <div class="hw-head">
      <span class="dim hw-sub">paid add-on — hosted login (no cookie/extension); the tools then act as you. degressive €15 / €10 / €7 per connected account / month.</span>
      <Btn v-if="!loading && !unipile?.subscribed" kind="mini" @click="activate">activate · from €15/mo</Btn>
    </div>
    <div v-for="c in channels" :key="c.key" class="hw-row">
      <Dot :tone="unipile?.channels?.[c.key]?.connected ? 'olive' : (unipile?.subscribed ? 'saffron' : 'faint')" :size="8" />
      <div class="hw-id">
        <div class="hw-name">{{ c.label }}
          <Tag tone="cobalt">hosted</Tag>
          <Tag v-if="unipile?.channels?.[c.key]?.connected" tone="olive">connected</Tag>
        </div>
        <div class="hw-desc">
          {{ !unipile?.subscribed
            ? 'activate the option to connect'
            : (unipile?.channels?.[c.key]?.connected
              ? `connected ${fmtDate(unipile?.channels?.[c.key]?.connected_at ?? null) ?? ''} · ${c.desc}`
              : `link your ${c.label} to start`) }}
        </div>
      </div>
      <template v-if="unipile?.subscribed">
        <Btn v-if="unipile?.channels?.[c.key]?.connected" kind="danger" @click="drop(c.key)">disconnect</Btn>
        <Btn v-else kind="mini" @click="link(c.key)">connect</Btn>
      </template>
    </div>
  </div>
</template>

<style scoped>
.hw { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.hw-head { display: flex; align-items: baseline; gap: 10px; justify-content: space-between; }
.hw-sub { font-size: 11.5px; }
.hw-row { display: flex; align-items: center; gap: 10px; padding: 4px 0; border-bottom: 1px solid var(--color-hair-soft); }
.hw-id { min-width: 0; flex: 1; }
.hw-name { font-weight: 600; font-size: 13px; display: flex; gap: 8px; align-items: center; }
.hw-desc { font-size: 11.5px; color: var(--color-mute); }
</style>
