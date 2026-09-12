<script setup lang="ts">
// Automatisations — les routines Claude Code déclenchables depuis oto.
//
// Une automatisation = une routine hébergée chez Anthropic (prompt figé + connecteur
// oto branché), et son credential porte sa cible : `routine_id` + jeton de
// déclenchement. UNE INSTANCE = UNE ROUTINE, parce que le jeton `/fire` est scopé par
// Anthropic à une seule routine — la liste se dérive donc des instances du connecteur
// `routine`, sans endpoint ni type en double.
//
// Ce que cette page fait : elle LISTE les automatisations. Le bouton « déclencher » a quitté
// le dashboard (oto#192, 12/09/2026 : aucun déclenchement en 45 jours) — une routine part
// de son déclencheur chez Anthropic, et son résultat se lit dans la session.
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import RunnerMonitorCard from '@/components/console/RunnerMonitorCard.vue'
import RunnerJobsCard from '@/components/console/RunnerJobsCard.vue'
import RunnerTriggersCard from '@/components/console/RunnerTriggersCard.vue'
import RunnerFleetsCard from '@/components/console/RunnerFleetsCard.vue'
import { getConnectorInstances } from '@/api/console'
import type { ConnectorInstance } from '@/types/api'
import { humanize } from '@/lib/errors'

const instances = ref<ConnectorInstance[]>([])
const loaded = ref(false)
const error = ref<string | null>(null)

const automations = computed(() =>
  instances.value.filter((i) => i.connector === 'routine'))

const LEVEL_LABEL: Record<string, string> = {
  member: 'à moi', group: 'équipe', org: 'organisation', platform: 'plateforme',
}

async function load() {
  try {
    instances.value = (await getConnectorInstances()).instances
  } catch (e) {
    error.value = humanize(e)
  } finally {
    loaded.value = true
  }
}

onMounted(load)
</script>

<template>
  <!-- Le poste de surveillance des agents, du général au particulier : l'état de
       la flotte d'abord (les gardes, l'avancement, le coût, qui est bloqué), la
       file ensuite (quel travail, dans quel état), puis les déclencheurs et les
       routines. On ouvre cette page pour savoir si la campagne va bien, pas pour
       lire le travail n° 47 — la file seule obligeait à reconstituer la réponse
       de tête, ligne par ligne. -->
  <RunnerMonitorCard />
  <RunnerFleetsCard />
  <RunnerJobsCard />
  <RunnerTriggersCard />
  <ConsoleCard
    title="Automatisations"
    sub="Des routines Claude Code — un agent autonome qui tourne chez Anthropic avec tes outils oto branchés."
  >
    <div class="card-body">
      <p v-if="error" class="au-err">{{ error }}</p>

      <p v-else-if="loaded && !automations.length" class="dim au-empty">
        Aucune automatisation configurée. Crée une routine sur
        <a href="https://claude.ai/code/routines" target="_blank" rel="noopener">claude.ai/code/routines</a>
        (prompt + connecteur Oto), ajoute-lui un déclencheur <strong>API</strong>, génère
        son jeton — il n'est affiché qu'une fois — puis pose-le ici comme credential du
        connecteur <RouterLink to="/connectors">Routine Claude Code</RouterLink>.
        Une routine par automatisation : le jeton ne déclenche que la sienne.
      </p>

      <ul v-else class="au-list">
        <li v-for="i in automations" :key="i.ref" class="au-item">
          <div class="au-head">
            <span class="au-name">{{ i.name || i.account || 'routine' }}</span>
            <span class="au-lvl">{{ LEVEL_LABEL[i.level] ?? i.level }}</span>
            <span v-if="i.suspended" class="au-susp">mise de côté</span>
          </div>
        </li>
      </ul>
    </div>
  </ConsoleCard>
</template>

<style scoped>
.au-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.au-item { border: 1px solid var(--color-hair); border-radius: 8px; padding: 10px 12px; }
.au-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.au-name { font-weight: 600; font-size: 13.5px; color: var(--color-ink); }
.au-lvl {
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em;
  color: var(--color-ink-soft); border: 1px solid var(--color-hair);
  border-radius: 999px; padding: 1px 7px;
}
.au-susp { font-size: 11px; color: var(--color-terra, #a8442a); }
.au-fire { display: flex; gap: 8px; align-items: center; }
.au-in {
  flex: 1; min-width: 0; font-size: 12.5px; padding: 5px 8px;
  border: 1px solid var(--color-hair); border-radius: 6px; background: transparent;
  color: var(--color-ink);
}
.au-ok { margin: 8px 0 0; font-size: 12.5px; }
.au-err { margin: 8px 0 0; font-size: 12.5px; color: var(--color-terra, #a8442a); }
.au-empty { font-size: 13px; line-height: 1.6; }
.au-note { margin: 14px 0 0; font-size: 12px; line-height: 1.55; }
</style>
