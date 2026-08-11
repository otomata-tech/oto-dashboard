<script setup lang="ts">
// Automatisations — les routines Claude Code déclenchables depuis oto.
//
// Une automatisation = une routine hébergée chez Anthropic (prompt figé + connecteur
// oto branché), et son credential porte sa cible : `routine_id` + jeton de
// déclenchement. UNE INSTANCE = UNE ROUTINE, parce que le jeton `/fire` est scopé par
// Anthropic à une seule routine — la liste se dérive donc des instances du connecteur
// `routine`, sans endpoint ni type en double.
//
// Ce que cette page fait, et ce qu'elle ne fait PAS : elle déclenche et renvoie vers
// la session. Le RÉSULTAT du run se lit chez Anthropic, dans la session — l'appel ne
// l'attend pas, et prétendre l'afficher ici serait mentir.
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Btn from '@/components/console/Btn.vue'
import Icon from '@/components/console/Icon.vue'
import { getConnectorInstances, fireAutomation, type FireResult } from '@/api/console'
import type { ConnectorInstance } from '@/types/api'
import { humanize } from '@/lib/errors'

const instances = ref<ConnectorInstance[]>([])
const loaded = ref(false)
const error = ref<string | null>(null)

// Contexte de run, par automatisation. Il arrive à l'agent ÉTIQUETÉ DONNÉE NON FIABLE
// (bloc `<routine-fire-payload>`), et le prompt de la routine doit explicitement opter
// pour le lire — d'où le libellé « référence » plutôt que « message ».
const text = ref<Record<string, string>>({})
const firing = ref<string | null>(null)
const result = ref<Record<string, FireResult>>({})
const failed = ref<Record<string, string>>({})

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

async function fire(i: ConnectorInstance) {
  firing.value = i.ref
  delete failed.value[i.ref]
  delete result.value[i.ref]
  try {
    result.value[i.ref] = await fireAutomation({
      text: text.value[i.ref]?.trim() || undefined,
      account: i.account || undefined,
    })
  } catch (e) {
    failed.value[i.ref] = humanize(e)
  } finally {
    firing.value = null
  }
}

onMounted(load)
</script>

<template>
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

          <div class="au-fire">
            <input
              v-model="text[i.ref]"
              class="au-in"
              placeholder="référence à passer au run (id de ligne, projet…) — facultatif"
            />
            <Btn kind="mini" :disabled="firing === i.ref" @click="fire(i)">
              {{ firing === i.ref ? '…' : 'Déclencher' }}
            </Btn>
          </div>

          <p v-if="failed[i.ref]" class="au-err">{{ failed[i.ref] }}</p>
          <p v-else-if="result[i.ref]" class="au-ok">
            Session lancée.
            <a
              v-if="result[i.ref]!.session_url"
              :href="result[i.ref]!.session_url!"
              target="_blank"
              rel="noopener"
            >Suivre le run <Icon name="ext" :size="11" /></a>
            <span class="dim"> — le résultat se lit dans la session, pas ici.</span>
          </p>
        </li>
      </ul>

      <p v-if="loaded && automations.length" class="dim au-note">
        Le texte passé au run arrive à l'agent comme une <strong>donnée non fiable</strong> :
        la routine ne l'exploite que si son propre prompt le prévoit. Passe une référence
        que l'agent rechargera par oto, jamais l'enregistrement lui-même.
      </p>
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
