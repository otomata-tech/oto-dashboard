<script setup lang="ts">
// Bandeau FILE DE TRAVAIL (ADR 0046 D) — supervision : les rows sous bail
// (`_claimed_by`), l'état du bail (actif / expiré — un bail expiré sera recyclé
// par le prochain claim), et la libération FORCÉE (humaine, sans garde de worker).
//
// Depuis oto-backend #723, le bail dit aussi POUR QUEL RUN (`_claimed_run`) : ce
// bandeau disait qu'un agent tenait une ligne, jamais lequel tenait laquelle. Le
// run est désormais cliquable — il ouvre le travail sur la page Automatisations.
//
// Depuis oto-backend#433, une réservation se COMPTE : le bandeau porte aussi le
// plafond de réservations sans écriture du tableau et, par ligne, où elle en est
// (« 2/3 »). Sans lui, une ligne reprise en boucle par des agents qui ne concluent
// jamais était indiscernable d'une ligne prise pour la première fois — et sa sortie
// de la file, plus tard, arrivait sans prévenir.
//
// Les deux se lisent sur la MÊME ligne et ne se recouvrent pas : `bailLigne` dit qui
// la tient et jusqu'à quand, `claimBudget` dit combien de fois on l'a déjà reprise.
import { computed } from 'vue'
import Btn from './Btn.vue'
import Tag from './Tag.vue'
import type { DatastoreLifecycle, DatastoreRow } from '@/types/api'
import { absDate } from '@/lib/cellRender'
import { bailLigne } from '@/lib/bailDeLigne'
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

const etatAbandon = computed(() => abandonState(props.lifecycle))
// Une ligne au plafond n'est PAS encore sortie de la file : le serveur épargne les
// baux actifs et ne tranche qu'au relâchement (ou au claim suivant). C'est donc un
// avertissement, pas un verdict — et le seul moment où un humain peut encore agir.
//
// L'instant est lu une fois pour toutes les lignes : sans instant commun, deux lignes
// du même bandeau se compareraient à deux « maintenant » différents.
const items = computed(() => {
  const t = Date.now()
  return props.rows.map((row) => ({
    row,
    title: titleOf(row),
    bail: bailLigne(row, t),
    budget: claimBudget(row, props.lifecycle),
  }))
})
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
      <!-- Le travail qui la tient. ⚠️ « sans run » n'est pas une donnée manquante :
           c'est un bail pris à la main, ou par un agent qui n'a pas passé son run. -->
      <RouterLink
        v-if="it.bail.porteur === 'run'"
        class="dsq-run" :title="`run ${it.bail.run}`"
        :to="`/automations?run=${encodeURIComponent(it.bail.run!)}`"
      >ouvrir le travail</RouterLink>
      <span v-else-if="it.bail.porteur === 'sans-run'" class="dsq-lease">
        bail pris sans run
      </span>
      <Tag v-if="it.bail.etat === 'expire'" tone="terra"
        title="le prochain claim recycle cette row">bail expiré</Tag>
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
.dsq-run { font-size: 11px; font-weight: 600; color: var(--color-saffron-ink); }
.dsq-run:hover { color: var(--color-ink); }
</style>
