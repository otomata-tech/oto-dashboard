<script setup lang="ts">
import { onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import { getUsageRuns, getUsageRun, getUsageGaps, getUsageToolQuality, getUsageSignals } from '@/api/console'
import type { DoctrineRun, UsageGap, ToolFeedbackAgg, RunCall, UsageSignal } from '@/types/api'
import { humanize } from '@/lib/errors'

const runs = ref<DoctrineRun[]>([])
const gaps = ref<UsageGap[]>([])
const tools = ref<ToolFeedbackAgg[]>([])
const error = ref<string | null>(null)
const loaded = ref(false)

// Déroulé sélectionné (timeline chargée à la demande).
const openRun = ref<string | null>(null)
const runCalls = ref<RunCall[]>([])

// Détail d'un agrégat (tool-quality / gap) : signaux bruts chargés à la demande.
const openSignal = ref<string | null>(null)   // clé `${signal}:${target}:${kind}`
const signalRows = ref<UsageSignal[]>([])

const OUTCOME_TONE: Record<string, 'olive' | 'saffron' | 'terra' | 'ink'> = {
  done: 'olive', blocked: 'saffron', failed: 'terra', abandoned: 'ink',
}
const FEEDBACK_TONE: Record<string, 'olive' | 'terra' | 'saffron'> = {
  praise: 'olive', bug: 'terra', wrong_result: 'terra', misleading_doc: 'saffron',
}

async function load() {
  try {
    const [r, g, t] = await Promise.all([getUsageRuns(), getUsageGaps(), getUsageToolQuality()])
    runs.value = r.runs
    gaps.value = g.gaps
    tools.value = t.tools
  } catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
}
onMounted(load)

async function toggleRun(run: DoctrineRun) {
  if (openRun.value === run.run_id) { openRun.value = null; return }
  openRun.value = run.run_id
  runCalls.value = []
  try { runCalls.value = (await getUsageRun(run.run_id)).calls }
  catch (e) { error.value = humanize(e) }
}

// Drill-down d'une rangée agrégée → les signaux bruts (le `body` = le détail).
async function toggleSignals(signal: string, target: string | null, kind: string) {
  const key = `${signal}:${target}:${kind}`
  if (openSignal.value === key) { openSignal.value = null; return }
  openSignal.value = key
  signalRows.value = []
  try {
    const rows = (await getUsageSignals(signal, target ?? undefined)).signals
    signalRows.value = rows.filter((s) => s.kind === kind)
  } catch (e) { error.value = humanize(e) }
}

function fmt(ts: string | null): string {
  return ts ? ts.replace('T', ' ').slice(0, 16) : '—'
}
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <ConsoleCard title="déroulés" flush
      sub="chaque run = un run_start…run_finish (procédure nommée ou déroulé ad-hoc) ; clique pour voir la timeline des appels.">
      <table class="tbl">
        <thead><tr><th>procédure</th><th>issue</th><th>appels</th><th>début</th><th style="width: 80px"></th></tr></thead>
        <tbody>
          <template v-for="r in runs" :key="r.run_id">
            <tr>
              <td><code class="mono" style="font-weight: 600">{{ r.slug || '—' }}</code></td>
              <td>
                <Tag v-if="r.outcome" :tone="OUTCOME_TONE[r.outcome] || 'ink'">{{ r.outcome }}</Tag>
                <span v-else class="dim">en cours</span>
              </td>
              <td class="mono">{{ r.n_calls }}</td>
              <td class="dim" style="font-size: 12px">{{ fmt(r.started_at) }}</td>
              <td style="text-align: right">
                <Btn kind="mini" @click="toggleRun(r)">{{ openRun === r.run_id ? 'fermer' : 'timeline' }}</Btn>
              </td>
            </tr>
            <tr v-if="openRun === r.run_id">
              <td colspan="5" style="background: var(--color-paper-3); padding: 0">
                <table class="tbl" style="margin: 0">
                  <tbody>
                    <tr v-for="(c, i) in runCalls" :key="i">
                      <td class="mono" style="width: 40%">{{ c.tool }}</td>
                      <td><Tag :tone="c.ok ? 'olive' : 'terra'">{{ c.ok ? 'ok' : 'err' }}</Tag></td>
                      <td class="dim" style="font-size: 12px">{{ fmt(c.created_at) }}</td>
                    </tr>
                    <tr v-if="!runCalls.length"><td class="dim" style="padding: 12px">chargement…</td></tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </template>
          <tr v-if="loaded && !runs.length">
            <td colspan="5" class="dim" style="text-align: center; padding: 16px">
              aucun déroulé encore — les agents en ouvrent via run_start.
            </td>
          </tr>
        </tbody>
      </table>
    </ConsoleCard>

    <div class="grid2">
      <ConsoleCard title="manques signalés" flush
        sub="cas d'usage qu'oto n'a pas couverts (report_gap) — backlog produit.">
        <table class="tbl">
          <thead><tr><th>besoin</th><th>type</th><th>n</th></tr></thead>
          <tbody>
            <template v-for="(g, i) in gaps" :key="i">
              <tr style="cursor: pointer" @click="toggleSignals('gap', g.intent, g.kind)">
                <td>{{ g.intent || '—' }}</td>
                <td><Tag tone="saffron">{{ g.kind }}</Tag></td>
                <td class="mono">{{ g.n }}</td>
              </tr>
              <tr v-if="openSignal === `gap:${g.intent}:${g.kind}`">
                <td colspan="3" style="background: var(--color-paper-3); padding: 0">
                  <div v-for="(s, j) in signalRows" :key="j"
                    style="padding: 8px 12px; border-top: 1px solid var(--color-hair-soft)">
                    <div class="dim" style="font-size: 11px">{{ fmt(s.created_at) }} · {{ s.source }}</div>
                    <div style="font-size: 12.5px; white-space: pre-wrap">{{ s.body || '—' }}</div>
                  </div>
                  <div v-if="!signalRows.length" class="dim" style="padding: 12px">chargement…</div>
                </td>
              </tr>
            </template>
            <tr v-if="loaded && !gaps.length">
              <td colspan="3" class="dim" style="text-align: center; padding: 16px">aucun manque signalé.</td>
            </tr>
          </tbody>
        </table>
      </ConsoleCard>

      <ConsoleCard title="qualité des outils" flush
        sub="feedback des agents/humains sur les outils (tool_feedback).">
        <table class="tbl">
          <thead><tr><th>outil</th><th>verdict</th><th>n</th></tr></thead>
          <tbody>
            <template v-for="(t, i) in tools" :key="i">
              <tr style="cursor: pointer" @click="toggleSignals('tool_feedback', t.tool, t.kind)">
                <td><code class="mono" style="font-weight: 600">{{ t.tool || '—' }}</code></td>
                <td><Tag :tone="FEEDBACK_TONE[t.kind] || 'ink'">{{ t.kind }}</Tag></td>
                <td class="mono">{{ t.n }}</td>
              </tr>
              <tr v-if="openSignal === `tool_feedback:${t.tool}:${t.kind}`">
                <td colspan="3" style="background: var(--color-paper-3); padding: 0">
                  <div v-for="(s, j) in signalRows" :key="j"
                    style="padding: 8px 12px; border-top: 1px solid var(--color-hair-soft)">
                    <div class="dim" style="font-size: 11px">{{ fmt(s.created_at) }} · {{ s.source }}</div>
                    <div style="font-size: 12.5px; white-space: pre-wrap">{{ s.body || '—' }}</div>
                  </div>
                  <div v-if="!signalRows.length" class="dim" style="padding: 12px">chargement…</div>
                </td>
              </tr>
            </template>
            <tr v-if="loaded && !tools.length">
              <td colspan="3" class="dim" style="text-align: center; padding: 16px">aucun feedback d'outil.</td>
            </tr>
          </tbody>
        </table>
      </ConsoleCard>
    </div>
  </div>
</template>
