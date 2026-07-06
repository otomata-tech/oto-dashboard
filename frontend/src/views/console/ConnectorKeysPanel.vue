<script setup lang="ts">
// Onglet « clés partagées » de /connectors — audit ORG_ADMIN : les clés de connecteur
// fournies par l'org et les équipes, avec test en ligne. Consomme la projection
// d'instances (ADR 0038/0044), filtrée aux niveaux PARTAGÉS (org + group). Une clé
// perso, si l'user en pose une, prime toujours (dit ailleurs). Lecture seule ici :
// la pose/rotation d'une clé partagée vit dans la gouvernance des connecteurs.
import { onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import { getConnectorInstances, verifyConnector } from '@/api/console'
import { fmtDate } from '@/types/api'
import type { ConnectorInstance } from '@/types/api'
import { humanize } from '@/lib/errors'

const rows = ref<ConnectorInstance[]>([])
const loaded = ref(false)
const error = ref<string | null>(null)

async function load() {
  try {
    rows.value = (await getConnectorInstances()).instances
      .filter((i) => i.level === 'org' || i.level === 'group')
      .sort((a, b) => a.connector.localeCompare(b.connector))
  } catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
}
onMounted(load)

// Test en ligne, par instance (clé de ref). verifyConnector teste la clé qui résout
// au niveau org — sonde live, jamais le secret.
const tests = ref<Record<string, { busy: boolean; label: string | null; ok: boolean }>>({})
async function test(i: ConnectorInstance) {
  if (tests.value[i.ref]?.busy) return
  tests.value[i.ref] = { busy: true, label: null, ok: false }
  try {
    const r = await verifyConnector(i.connector, 'org')
    tests.value[i.ref] = { busy: false, ok: r.ok, label: r.ok ? '✓ ok' : (r.error || 'échec') }
  } catch (e) {
    tests.value[i.ref] = { busy: false, ok: false, label: humanize(e) }
  }
}
const scopeLabel = (i: ConnectorInstance) =>
  i.level === 'group' ? (i.owner.label || `équipe #${i.owner.id}`) : 'org'
</script>

<template>
  <div class="content-inner">
    <ConsoleCard title="clés partagées"
      sub="les clés de connecteur fournies par ton org et tes équipes — teste-les d'ici. une clé perso, si tu en poses une, prime toujours.">
      <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

      <table v-if="loaded && rows.length" class="keys">
        <thead><tr><th>connecteur</th><th>portée</th><th>posée par</th><th>test</th></tr></thead>
        <tbody>
          <tr v-for="i in rows" :key="i.ref">
            <td class="k-name">{{ i.name }}</td>
            <td><Tag :tone="i.level === 'group' ? 'cobalt' : 'olive'">{{ scopeLabel(i) }}</Tag></td>
            <td class="k-dim">{{ i.set_by || '—' }}<span v-if="i.set_at"> · {{ fmtDate(i.set_at) }}</span></td>
            <td class="k-test">
              <span v-if="tests[i.ref]?.label" class="k-res" :class="{ ok: tests[i.ref]?.ok }">{{ tests[i.ref]?.label }}</span>
              <Btn kind="mini" @click="test(i)">{{ tests[i.ref]?.busy ? '…' : 'tester' }}</Btn>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-else-if="loaded && !error" class="state-empty" style="margin-top: 24px">
        <h3>aucune clé partagée</h3>
        <p>ton org et tes équipes ne fournissent pas encore de clé partagée. les clés d'org/équipe se posent depuis la gouvernance des connecteurs.</p>
      </div>
    </ConsoleCard>
  </div>
</template>

<style scoped>
.keys { width: 100%; border-collapse: collapse; font-size: 13px; }
.keys th { text-align: left; font-family: var(--font-mono); font-size: 9.5px; letter-spacing: .12em; text-transform: uppercase; color: var(--color-mute); font-weight: 500; padding: 8px 10px; border-bottom: 1px solid var(--color-hair); }
.keys td { padding: 10px; border-bottom: 1px solid var(--color-hair-soft); vertical-align: middle; }
.k-name { font-weight: 600; color: var(--color-ink); }
.k-dim { color: var(--color-faint); font-size: 12px; }
.k-test { display: flex; align-items: center; gap: 10px; }
.k-res { font-size: 11.5px; color: var(--color-saffron-ink); }
.k-res.ok { color: var(--color-olive-ink); }
</style>
