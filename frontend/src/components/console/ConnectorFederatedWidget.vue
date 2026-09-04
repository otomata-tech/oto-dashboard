<script setup lang="ts">
// Widget credential MCP FÉDÉRÉ (ADR 0024 R1) — rendu INLINE dans la ConnectorCard
// (fin de la carte ancrée #federated). Auto-suffisant : charge son propre statut et
// se connecte/déconnecte via le chemin fixe générique (oto-dashboard#125 items 1-3 —
// `startConnectorFlow`/`getFederatedStatus`/`disconnectFederated`, plus un nom de
// connecteur nulle part dans une URL), + doc « how-to ». On fédère le LOGIN du MCP
// tiers ; ses outils sont proxifiés et restent sous la gouvernance oto
// (redaction/calllog).
import { onMounted, ref, computed } from 'vue'
import Btn from './Btn.vue'
import Dot from './Dot.vue'
import DocSections from './DocSections.vue'
import { getFederatedStatus, startConnectorFlow, disconnectFederated } from '@/api/console'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { humanize } from '@/lib/errors'
import { fmtDate } from '@/types/api'
import type { ConnectorOAuthStatus, MyConnector } from '@/types/api'

const props = defineProps<{ connector: MyConnector }>()
const { toast } = useToast()
const { confirmAction } = usePrompt()
const status = ref<ConnectorOAuthStatus | null>(null)
const loading = ref(true)

async function refresh() { status.value = await getFederatedStatus(props.connector.name).catch(() => null) }
onMounted(async () => { await refresh(); loading.value = false })

const connected = computed(() => !!status.value?.connected)
// oto#25 lot (a) : un grant mort n'est plus purgé, il est MARQUÉ rejeté — la ligne
// reste, donc `connected` peut rester vrai alors que le fournisseur a révoqué le
// jeton. Sans ce champ, l'utilisateur voyait « connected » sur une clé morte et ne
// savait pas qu'il fallait reconnecter (le premier appel réel échouait, sans piste).
const rejected = computed(() => !!status.value?.health_ko)
// Avant connexion : tout (prérequis + usage). Une fois connecté : usage seul.
const docs = computed(() => {
  const secs = props.connector.doc_sections ?? []
  return connected.value ? secs.filter((s) => s.kind === 'usage') : secs
})

async function link() {
  try { const { auth_url } = await startConnectorFlow(props.connector.name, {}); window.location.href = auth_url }
  catch (e) { toast(humanize(e)) }
}
async function drop() {
  if (!await confirmAction({ title: `disconnect ${props.connector.label}`, danger: true, confirmLabel: 'Disconnect', message: `disconnect your ${props.connector.label}? its tools will disappear from your session.` })) return
  try { await disconnectFederated(props.connector.name); toast(`${props.connector.label} disconnected`); await refresh() }
  catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="fw">
    <div class="fw-row">
      <Dot :tone="rejected ? 'terra' : connected ? 'olive' : 'faint'" :size="8" />
      <span class="fw-status dim">
        {{ rejected
          ? `connexion rejetée par le fournisseur${status?.health_reason ? ` (${status.health_reason})` : ''} — reconnecte-toi`
          : connected
            ? `connected ${fmtDate(status?.set_at) ?? ''} · login délégué (mcp fédéré)`
            : 'not connected — login delegated to the provider (mcp fédéré)' }}
      </span>
      <Btn v-if="rejected" kind="mini" @click="link">Reconnect</Btn>
      <Btn v-else-if="connected" kind="danger" @click="drop">Disconnect</Btn>
      <Btn v-else-if="!loading" kind="mini" @click="link">Connect</Btn>
    </div>
    <DocSections v-if="docs.length" :sections="docs" />
  </div>
</template>

<style scoped>
.fw { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.fw-row { display: flex; align-items: center; gap: 10px; }
.fw-status { font-size: 12px; flex: 1; min-width: 0; }
</style>
