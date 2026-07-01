<script setup lang="ts">
// Widget credential SESSION navigateur (ADR 0024 R1 / ADR 0026) — rendu INLINE dans la
// ConnectorCard. Connecteurs concernés : brevo, crunchbase, pennylaneged
// (secret_kind="cookie", personal_session). La connexion se fait DEPUIS le dashboard :
// « Connecter » ouvre une Live View Browserbase en iframe (`ConnectorSessionConnect`),
// l'user se logue, on vérifie + persiste le Context. PLUS d'extension/cookie, PLUS de
// MCP requis. État dérivé de `me.providers[<name>]` (générique par connecteur).
//
// Cible par défaut (sélecteur d'identité ADR 0024, `connector.identities`) :
// pennylaneged = la société cliente (= SA GED, une par client — issue #31). La cible
// courante vient de `me.providers` (meta public, zéro coût) ; le LISTING, lui, loue
// une session Browserbase (~10 s) → chargé à la demande seulement (bouton).
import { computed, ref } from 'vue'
import Btn from './Btn.vue'
import Dot from './Dot.vue'
import Tag from './Tag.vue'
import ConnectorSessionConnect from './ConnectorSessionConnect.vue'
import { deleteApiKey, getConnectorIdentities, setConnectorIdentity } from '@/api/console'
import { useMe } from '@/composables/useMe'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { humanize } from '@/lib/errors'
import { fmtDate } from '@/types/api'
import type { ConnectorIdentity, MyConnector } from '@/types/api'

const props = defineProps<{ connector: MyConnector }>()
const { me, reload } = useMe()
const { toast } = useToast()
const { confirmAction } = usePrompt()

const status = computed(() => me.value?.providers?.[props.connector.name])
const configured = computed(() => !!status.value?.user_key_configured)
const setAt = computed(() => status.value?.session_set_at ?? null)
const connecting = ref(false)

// ── cible par défaut (identités) ──
const target = computed(() => status.value?.identity_label || status.value?.identity_id || null)
const picking = ref(false)
const loadingIds = ref(false)
const identities = ref<ConnectorIdentity[]>([])

async function openPicker() {
  picking.value = true
  loadingIds.value = true
  try { identities.value = (await getConnectorIdentities(props.connector.name)).identities }
  catch (e) { toast(humanize(e)); picking.value = false }
  finally { loadingIds.value = false }
}
async function pick(id: string) {
  try {
    await setConnectorIdentity(props.connector.name, id)
    toast('target set')
    picking.value = false
    await reload()
  } catch (e) { toast(humanize(e)) }
}

async function drop() {
  if (!await confirmAction({ title: `disconnect ${props.connector.label}`, danger: true, confirmLabel: 'disconnect', message: `disconnect your ${props.connector.label} session?` })) return
  try { await deleteApiKey(props.connector.name); toast('session removed'); await reload() } catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="sw">
    <div class="sw-row">
      <Dot :tone="configured ? 'olive' : 'faint'" :size="8" />
      <span class="sw-status dim">
        {{ configured
          ? `session set ${fmtDate(setAt) ?? ''} — never shared with your org`
          : 'no session — connect to log in through a remote browser' }}
      </span>
      <Btn v-if="configured" kind="danger" @click="drop">disconnect</Btn>
      <Btn v-else kind="mini" @click="connecting = true">connecter</Btn>
    </div>

    <!-- cible par défaut (pennylaneged : la GED du client en cours) -->
    <div v-if="configured && connector.identities" class="sw-row sw-target">
      <Dot :tone="target ? 'olive' : 'saffron'" :size="7" />
      <span class="sw-status dim">
        {{ target ? `target: ${target}` : 'no default target — pick the client to work in' }}
      </span>
      <Btn kind="mini" :disabled="loadingIds" @click="openPicker">{{ target ? 'change' : 'choose' }}</Btn>
    </div>
    <div v-if="picking" class="sw-picker">
      <span v-if="loadingIds" class="dim sw-load">listing… (opens the remote session, ~10s)</span>
      <template v-else>
        <div v-for="idn in identities" :key="idn.id" class="sw-acct">
          <Dot :tone="idn.is_default ? 'olive' : 'faint'" :size="7" />
          <span class="sw-acct-name">{{ idn.label || idn.id }}
            <Tag v-if="idn.is_default" tone="saffron">active</Tag>
          </span>
          <Btn v-if="!idn.is_default" kind="mini" @click="pick(idn.id)">use</Btn>
        </div>
        <span v-if="!identities.length" class="dim sw-load">nothing to pick — reconnect your session</span>
      </template>
    </div>

    <ConnectorSessionConnect :open="connecting" :connector="connector"
      @close="connecting = false" @connected="reload" />
  </div>
</template>

<style scoped>
.sw { display: flex; flex-direction: column; gap: 6px; width: 100%; }
.sw-row { display: flex; align-items: center; gap: 10px; width: 100%; }
.sw-status { font-size: 12px; flex: 1; min-width: 0; }
.sw-picker { display: flex; flex-direction: column; gap: 4px; padding: 2px 0 4px 18px; }
.sw-load { font-size: 11.5px; }
.sw-acct { display: flex; align-items: center; gap: 8px; }
.sw-acct-name { flex: 1; min-width: 0; font-size: 12px; display: flex; gap: 6px; align-items: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
