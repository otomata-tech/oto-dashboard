<script setup lang="ts">
// Widget credential SESSION navigateur (ADR 0024 R1 / ADR 0026) — rendu INLINE dans la
// ConnectorCard. Connecteurs concernés : brevo, crunchbase (secret_kind="cookie",
// personal_session). La connexion se fait DEPUIS le dashboard : « Connecter » ouvre une
// Live View Browserbase en iframe (`ConnectorSessionConnect`), l'user se logue, on vérifie
// + persiste le Context. PLUS d'extension/cookie, PLUS de MCP requis. État dérivé de
// `me.providers[<name>]` (générique par connecteur).
import { computed, ref } from 'vue'
import Btn from './Btn.vue'
import Dot from './Dot.vue'
import ConnectorSessionConnect from './ConnectorSessionConnect.vue'
import { deleteApiKey } from '@/api/console'
import { useMe } from '@/composables/useMe'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { humanize } from '@/lib/errors'
import { fmtDate } from '@/types/api'
import type { MyConnector } from '@/types/api'

const props = defineProps<{ connector: MyConnector }>()
const { me, reload } = useMe()
const { toast } = useToast()
const { confirmAction } = usePrompt()

const status = computed(() => me.value?.providers?.[props.connector.name])
const configured = computed(() => !!status.value?.user_key_configured)
const setAt = computed(() => status.value?.session_set_at ?? null)
const connecting = ref(false)

async function drop() {
  if (!await confirmAction({ title: `disconnect ${props.connector.label}`, danger: true, confirmLabel: 'disconnect', message: `disconnect your ${props.connector.label} session?` })) return
  try { await deleteApiKey(props.connector.name); toast('session removed'); await reload() } catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="sw">
    <Dot :tone="configured ? 'olive' : 'faint'" :size="8" />
    <span class="sw-status dim">
      {{ configured
        ? `session set ${fmtDate(setAt) ?? ''} — never shared with your org`
        : 'no session — connect to log in through a remote browser' }}
    </span>
    <Btn v-if="configured" kind="danger" @click="drop">disconnect</Btn>
    <Btn v-else kind="mini" @click="connecting = true">connecter</Btn>

    <ConnectorSessionConnect :open="connecting" :connector="connector"
      @close="connecting = false" @connected="reload" />
  </div>
</template>

<style scoped>
.sw { display: flex; align-items: center; gap: 10px; width: 100%; }
.sw-status { font-size: 12px; flex: 1; min-width: 0; }
</style>
