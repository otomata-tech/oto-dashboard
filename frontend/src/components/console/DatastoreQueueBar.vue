<script setup lang="ts">
// Bandeau FILE DE TRAVAIL (ADR 0046 D) — supervision : les rows sous bail
// (`_claimed_by`), l'état du bail (actif / expiré — un bail expiré sera recyclé
// par le prochain claim), et la libération FORCÉE (humaine, sans garde de worker).
//
// Depuis oto-backend#433, une réservation se COMPTE : le bandeau porte aussi le
// plafond de réservations sans écriture du tableau et, par ligne, où elle en est
// (« 2/3 »). Sans lui, une ligne reprise en boucle par des agents qui ne concluent
// jamais était indiscernable d'une ligne prise pour la première fois — et sa sortie
// de la file, plus tard, arrivait sans prévenir.
import { computed } from 'vue'
import Btn from './Btn.vue'
import Tag from './Tag.vue'
import type { DatastoreLifecycle, DatastoreRow } from '@/types/api'
import { absDate } from '@/lib/cellRender'
import { abandonState, claimBudget, type ClaimBudget } from '@/lib/datastoreClaims'

const props = defineProps<{
  rows: DatastoreRow[]
  canWrite: boolean
  titleField?: string | null // field role="title" du schéma (fallback _id)
  lifecycle?: DatastoreLifecycle | null // cycle de vie du field role="status"
}>()
const emit = defineEmits<{ open: [row: DatastoreRow]; release: [rowId: string] }>()

function titleOf(row: DatastoreRow): string {
  const v = props.titleField ? row[props.titleField] : null
  return v != null && v !== '' ? String(v) : row._id
}
function expired(row: DatastoreRow): boolean {
  const t = Date.parse(String(row._claimed_until ?? ''))
  return !Number.isNaN(t) && t < Date.now()
}

const etatAbandon = computed(() => abandonState(props.lifecycle))
// Une ligne au plafond n'est PAS encore sortie de la file : le serveur épargne les
// baux actifs et ne tranche qu'au relâchement (ou au claim suivant). C'est donc un
// avertissement, pas un verdict — et le seul moment où un humain peut encore agir.
const items = computed(() => props.rows.map((row) => ({
  row,
  title: titleOf(row),
  expired: expired(row),
  budget: claimBudget(row, props.lifecycle),
})))
const atCeiling = computed(() => items.value.filter((i) => i.budget?.atCeiling).length)

function budgetTitle(b: ClaimBudget): string {
  const compte = `${b.claims} réservation${b.claims > 1 ? 's' : ''} sans écriture`
  if (!b.atCeiling) return `${compte} — une écriture réussie remet le compteur à zéro`
  return `${compte} : plafond atteint — à la libération, la ligne quitte la file`
    + (etatAbandon.value ? ` et passe en « ${etatAbandon.value} »` : '')
}
</script>

<template>
  <div class="dsq">
    <!-- Le plafond lui-même est annoncé par la barre de statuts (propriété du tableau) :
         ici on porte ce que la file en FAIT — où chaque ligne en est, et lesquelles
         sont à un cheveu d'en sortir. -->
    <span class="dsq-head">file de travail · {{ rows.length }} en cours</span>
    <span v-if="atCeiling" class="dsq-warn">
      {{ atCeiling }} ligne{{ atCeiling > 1 ? 's' : '' }} au plafond — sortie de la file à la
      prochaine libération sans écriture.
    </span>
    <div v-for="it in items" :key="it.row._id" class="dsq-item">
      <button class="dsq-title" :title="it.row._id" @click="emit('open', it.row)">{{ it.title }}</button>
      <Tag tone="cobalt">{{ it.row._claimed_by }}</Tag>
      <Tag v-if="it.budget" :tone="it.budget.atCeiling ? 'terra' : undefined" :title="budgetTitle(it.budget)">
        {{ it.budget.label }}
      </Tag>
      <Tag v-if="it.expired" tone="terra" title="le prochain claim recycle cette row">bail expiré</Tag>
      <span v-else class="dsq-lease">bail jusqu'à {{ absDate(String(it.row._claimed_until ?? '')) }}</span>
      <Btn v-if="canWrite" kind="mini" title="libération forcée (sans garde de worker)"
        @click="emit('release', it.row._id)">Libérer</Btn>
    </div>
  </div>
</template>

<style scoped>
.dsq {
  display: flex; flex-direction: column; gap: 4px; padding: 8px 16px;
  border-bottom: 1px solid var(--color-hair-soft); background: var(--color-paper-2);
}
.dsq-head { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; font-weight: 700; color: var(--color-mute); }
.dsq-warn { font-size: 11px; color: var(--color-terra-ink); }
.dsq-item { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 12px; }
.dsq-title {
  font: inherit; font-size: 12.5px; font-weight: 600; color: var(--color-ink);
  border: 0; background: none; cursor: pointer; padding: 0; text-align: left;
}
.dsq-title:hover { color: var(--color-cobalt); text-decoration: underline; }
.dsq-lease { font-size: 11px; color: var(--color-mute); }
</style>
