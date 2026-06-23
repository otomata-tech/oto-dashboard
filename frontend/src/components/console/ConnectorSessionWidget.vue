<script setup lang="ts">
// Widget credential SESSION (cookie per-user, ADR 0024 R1) — rendu INLINE dans la
// ConnectorCard (fin de la carte ancrée #sessions). Aujourd'hui un seul connecteur
// session à carte : crunchbase (pas d'API publique → session capturée via l'extension
// Oto Companion). Le widget montre l'état (depuis `me.crunchbase`) + la déconnexion.
import { computed } from 'vue'
import Btn from './Btn.vue'
import Dot from './Dot.vue'
import { deleteCrunchbase } from '@/api/console'
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

const configured = computed(() => !!me.value?.crunchbase?.configured)
const setAt = computed(() => me.value?.crunchbase?.set_at ?? null)

async function drop() {
  if (!await confirmAction({ title: `disconnect ${props.connector.label}`, danger: true, confirmLabel: 'disconnect', message: `disconnect your ${props.connector.label} session?` })) return
  try { await deleteCrunchbase(); toast('session removed'); await reload() } catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="sw">
    <Dot :tone="configured ? 'olive' : 'faint'" :size="8" />
    <span class="sw-status dim">
      {{ configured
        ? `session set ${fmtDate(setAt) ?? ''} — never shared with your org`
        : 'no session — capture your cookies via the Oto Companion extension' }}
    </span>
    <Btn v-if="configured" kind="danger" @click="drop">disconnect</Btn>
    <Btn v-else kind="mini" @click="toast('capture your session via the Oto Companion extension')">how to connect</Btn>
  </div>
</template>

<style scoped>
.sw { display: flex; align-items: center; gap: 10px; width: 100%; }
.sw-status { font-size: 12px; flex: 1; min-width: 0; }
</style>
