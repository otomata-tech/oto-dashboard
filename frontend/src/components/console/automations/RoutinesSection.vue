<script setup lang="ts">
// Routines Claude Code — déclenchables depuis oto, listées en bas de /automations.
//
// Une routine est hébergée chez Anthropic (prompt figé + connecteur oto branché), et son
// credential porte sa cible : `routine_id` + jeton de déclenchement. UNE INSTANCE = UNE
// ROUTINE, parce que le jeton `/fire` est scopé par Anthropic à une seule routine — la
// liste se dérive donc des instances du connecteur `routine`, sans endpoint ni type en
// double.
//
// La section LISTE. Le bouton « déclencher » a quitté le dashboard (oto#192, 12/09/2026 :
// aucun déclenchement en 45 jours) — une routine part de son déclencheur chez Anthropic,
// et son résultat se lit dans la session. Elle s'appelait « Automatisations » alors
// qu'elle ne montre que ces routines (renommée par oto#205).
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ConsoleCard from '../ConsoleCard.vue'
import { getConnectorInstances } from '@/api/console'
import type { ConnectorInstance } from '@/types/api'
import { humanize } from '@/lib/errors'

const { t } = useI18n()
const instances = ref<ConnectorInstance[]>([])
const loaded = ref(false)
const error = ref<string | null>(null)

const routines = computed(() => instances.value.filter((i) => i.connector === 'routine'))

const LEVEL_LABEL: Record<string, string> = {
  member: 'à moi', group: 'équipe', org: 'organisation', platform: 'plateforme',
}

async function load() {
  try {
    instances.value = (await getConnectorInstances()).instances
    error.value = null
  } catch (e) {
    error.value = humanize(e)
  } finally {
    loaded.value = true
  }
}

onMounted(load)
</script>

<template>
  <ConsoleCard :title="t('automations.routines.title')" :sub="t('automations.routines.sub')">
    <div class="card-body">
      <p v-if="error" class="au-err">{{ error }}</p>

      <p v-else-if="loaded && !routines.length" class="au-empty">
        Aucune automatisation configurée. Crée une routine sur
        <a href="https://claude.ai/code/routines" target="_blank" rel="noopener">claude.ai/code/routines</a>
        (prompt + connecteur Oto), active son lancement par <strong>API</strong>, génère
        son jeton — il n'est affiché qu'une fois — puis pose-le ici comme credential du
        connecteur <RouterLink to="/connectors">Routine Claude Code</RouterLink>.
        Une routine par automatisation : le jeton ne déclenche que la sienne.
      </p>

      <ul v-else class="au-list">
        <li v-for="i in routines" :key="i.ref" class="au-item">
          <span class="au-name">{{ i.name || i.account || 'routine' }}</span>
          <span class="au-lvl">{{ LEVEL_LABEL[i.level] ?? i.level }}</span>
          <span v-if="i.suspended" class="au-susp">mise de côté</span>
        </li>
      </ul>
    </div>
  </ConsoleCard>
</template>

<style scoped>
.au-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.au-item {
  display: flex; align-items: center; gap: 8px;
  border: 1px solid var(--color-hair); border-radius: var(--radius-md); padding: 10px 12px;
}
.au-name { font-weight: 600; font-size: 13.5px; color: var(--color-ink); }
.au-lvl {
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em;
  color: var(--color-mute); border: 1px solid var(--color-hair);
  border-radius: var(--radius-pill); padding: 1px 7px;
}
.au-susp { font-size: 11px; color: var(--color-terra-ink); }
.au-err { margin: 8px 0 0; font-size: 12.5px; color: var(--color-terra-ink); }
.au-empty { font-size: 13px; line-height: 1.6; color: var(--color-mute); }
</style>
