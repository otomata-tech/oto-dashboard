<script setup lang="ts">
import { onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Btn from '@/components/console/Btn.vue'
import Dot from '@/components/console/Dot.vue'
import Tag from '@/components/console/Tag.vue'
import { useToast } from '@/composables/useToast'
import { getScoutQueue, claimNextProspect, getProspect, recordAction } from '@/api/console'
import type { Heat, ScoutQueueItem, ScoutDetail } from '@/types/api'

// Cockpit prospection (harnais scout, ADR 0008) — file priorisée + fiche +
// dispositions, par-dessus /api/scout/* (oto-mcp). Le statut d'un prospect est
// dérivé de sa dernière action côté backend.
const { toast } = useToast()

const queue = ref<ScoutQueueItem[]>([])
const detail = ref<ScoutDetail | null>(null)
const error = ref<string | null>(null)
const loading = ref(false)
const busy = ref(false)

const HEAT_DOT: Record<Heat, 'terra' | 'saffron' | 'faint'> = { hot: 'terra', warm: 'saffron', cold: 'faint' }
const HEAT_TAG: Record<Heat, 'terra' | 'saffron' | 'ink'> = { hot: 'terra', warm: 'saffron', cold: 'ink' }

// Dispositions = (libellé, canal, outcome) — alignées sur les statuts blitz.
const DISPOSITIONS: { label: string; canal: string; outcome: string }[] = [
  { label: 'RDV obtenu', canal: 'appel', outcome: 'rdv' },
  { label: 'Échangé', canal: 'appel', outcome: 'talked' },
  { label: 'Pas de réponse', canal: 'appel', outcome: 'called' },
  { label: 'Email envoyé', canal: 'email', outcome: 'sent' },
  { label: 'Mort', canal: 'appel', outcome: 'dead' },
]

async function loadQueue() {
  loading.value = true
  error.value = null
  try { queue.value = (await getScoutQueue(50)).items }
  catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  finally { loading.value = false }
}

async function open(id: number) {
  try { detail.value = await getProspect(id) }
  catch (e) { toast(e instanceof Error ? e.message : String(e)) }
}

async function claimNext() {
  busy.value = true
  try {
    const { prospect } = await claimNextProspect()
    if (!prospect) { toast('file vide — rien à appeler'); return }
    await open(prospect.fact_id)
    await loadQueue()
  } catch (e) { toast(e instanceof Error ? e.message : String(e)) }
  finally { busy.value = false }
}

async function dispose(canal: string, outcome: string) {
  if (!detail.value) return
  busy.value = true
  try {
    detail.value = await recordAction(detail.value.fact_id, canal, outcome)
    await loadQueue()
    toast(`action enregistrée → ${detail.value.statut}`)
  } catch (e) { toast(e instanceof Error ? e.message : String(e)) }
  finally { busy.value = false }
}

onMounted(loadQueue)
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <div class="cockpit">
      <!-- File priorisée -->
      <ConsoleCard flush title="file" sub="qualified · triés heat → fit">
        <template #actions>
          <Btn kind="mini" icon="bolt" :disabled="busy" @click="claimNext">prendre &amp; ouvrir</Btn>
        </template>
        <table class="tbl">
          <thead><tr><th style="width:14px"></th><th>prospect</th><th class="num">fit</th></tr></thead>
          <tbody>
            <tr v-for="p in queue" :key="p.fact_id" class="row"
              :class="{ on: detail?.fact_id === p.fact_id }" @click="open(p.fact_id)">
              <td><Dot :tone="HEAT_DOT[p.heat]" :size="7" /></td>
              <td>{{ p.nom }}<br><code class="mono dim">{{ p.siren }}</code></td>
              <td class="num">{{ p.fit }}</td>
            </tr>
            <tr v-if="!loading && !queue.length"><td colspan="3" class="dim" style="text-align:center;padding:16px">file vide</td></tr>
          </tbody>
        </table>
      </ConsoleCard>

      <!-- Fiche + dispositions -->
      <ConsoleCard v-if="detail" :title="detail.nom" :sub="`SIREN ${detail.siren}`">
        <template #actions>
          <Tag :tone="HEAT_TAG[detail.heat]">{{ detail.heat }} · fit {{ detail.fit }}</Tag>
          <Tag tone="cobalt">{{ detail.statut }}</Tag>
        </template>

        <div class="meta">
          <span v-if="detail.bp_an">{{ detail.bp_an }} BP/an</span>
          <span v-if="detail.idcc">IDCC {{ detail.idcc }}</span>
          <span v-if="detail.claimed_by" class="dim">claimé par {{ detail.claimed_by }}</span>
        </div>

        <!-- dispositions -->
        <div class="disp">
          <Btn v-for="d in DISPOSITIONS" :key="d.outcome" kind="mini" :disabled="busy"
            @click="dispose(d.canal, d.outcome)">{{ d.label }}</Btn>
        </div>

        <!-- contacts -->
        <div class="sub-h">contacts</div>
        <table class="tbl">
          <tbody>
            <tr v-for="c in detail.contacts" :key="c.fact_id">
              <td>{{ c.nom }}</td>
              <td class="num"><code v-if="c.tel" class="mono">{{ c.tel }}</code><span v-else class="dim">—</span></td>
              <td class="num"><span v-if="c.linkedin" class="dim">in/{{ c.linkedin }}</span></td>
            </tr>
            <tr v-if="!detail.contacts.length"><td colspan="3" class="dim">aucun contact</td></tr>
          </tbody>
        </table>

        <!-- historique -->
        <div class="sub-h">historique</div>
        <table class="tbl">
          <tbody>
            <tr v-for="a in detail.actions" :key="a.fact_id">
              <td><code class="mono">{{ a.canal }}</code></td>
              <td>{{ a.outcome }}</td>
              <td class="dim">{{ a.note }}</td>
              <td class="num dim">{{ new Date(a.created_at.replace(' ', 'T') + 'Z').toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}</td>
            </tr>
            <tr v-if="!detail.actions.length"><td colspan="4" class="dim">aucune action</td></tr>
          </tbody>
        </table>
      </ConsoleCard>

      <ConsoleCard v-else title="aucun prospect ouvert" sub="« prendre & ouvrir » ou clique un prospect de la file" />
    </div>
  </div>
</template>

<style scoped>
.cockpit { display: grid; grid-template-columns: 340px 1fr; gap: 16px; align-items: start; }
.row { cursor: pointer; }
.row:hover { background: var(--color-hair-soft); }
.row.on { background: var(--color-hair-soft); }
.meta { display: flex; gap: 14px; font-size: 13px; margin-bottom: 12px; }
.disp { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }
.sub-h { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-ink-soft, #999); margin: 12px 0 4px; }
@media (max-width: 820px) { .cockpit { grid-template-columns: 1fr; } }
</style>
