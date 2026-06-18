<script setup lang="ts">
import { onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Dot from '@/components/console/Dot.vue'
import Btn from '@/components/console/Btn.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { getMementoStatus, startMementoOauth, disconnectMemento } from '@/api/console'
import type { MementoStatus } from '@/types/api'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'

const { toast } = useToast()
const { confirmAction } = usePrompt()
const memento = ref<MementoStatus | null>(null)
const loaded = ref(false)

async function load() {
  try { memento.value = await getMementoStatus() }
  catch { memento.value = null }
  finally { loaded.value = true }
}

onMounted(() => {
  // Retour du consentement OAuth memento (redirige avec ?memento=connected|error).
  const p = new URLSearchParams(window.location.search).get('memento')
  if (p === 'connected') toast('memento connecté')
  else if (p === 'error') toast('échec de la connexion memento')
  load()
})

async function connect() {
  try { const { auth_url } = await startMementoOauth(); window.location.href = auth_url }
  catch (e) { toast(humanize(e)) }
}

async function disconnect() {
  if (!await confirmAction({
    title: 'disconnect memento', danger: true, confirmLabel: 'disconnect',
    message: 'disconnect your memento workspace? its tools disappear from your session — your knowledge base itself is untouched.',
  })) return
  try { await disconnectMemento(); toast('memento disconnected'); await load() }
  catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="content-inner fadein">
    <ConsoleCard title="knowledge base" flush
      sub="memento — a structured, sourced knowledge base for your agents. opt-in.">
      <div class="rowitem" style="gap: 12px">
        <Dot :tone="memento?.connected ? 'olive' : 'faint'" :size="8" />
        <div style="flex: 1; min-width: 0">
          <div style="font-weight: 600">memento</div>
          <div class="dim" style="font-size: 12px">
            {{ memento?.connected
              ? `connected ${fmtDate(memento.set_at) ?? ''} · agents can read & write your KBs`
              : 'not connected — your agents have no knowledge base yet' }}
          </div>
        </div>
        <Btn v-if="loaded && memento?.connected" kind="danger" @click="disconnect">disconnect</Btn>
        <Btn v-else-if="loaded" kind="mini" @click="connect">connect</Btn>
      </div>
    </ConsoleCard>

    <div class="grid2">
      <ConsoleCard title="how agents use this">
        <div class="helptext" style="font-size: 12.5px; line-height: 1.65">
          once connected, <code style="font-size: 11px">mem_*</code> tools appear in your session:
          search across your KBs, read documents, append sourced facts. curation and editing happen
          in the memento app.
        </div>
      </ConsoleCard>
      <ConsoleCard title="datastore vs knowledge" sub="two memory surfaces.">
        <div class="helptext">
          <strong>datastore</strong> = lightweight tabular rows you own outright.
          <strong>knowledge</strong> = a structured, sourced KB (memento) — opt-in, and your
          account is provisioned automatically when you connect.
        </div>
      </ConsoleCard>
    </div>
  </div>
</template>
