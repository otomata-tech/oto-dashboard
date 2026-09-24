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
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

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
  const maintenant = Date.now()
  return props.rows.map((row) => ({
    row,
    title: titleOf(row),
    bail: bailLigne(row, maintenant),
    budget: claimBudget(row, props.lifecycle),
  }))
})
const atCeiling = computed(() => items.value.filter((i) => i.budget?.atCeiling).length)

function budgetTitle(b: ClaimBudget): string {
  const compte = t('dataUi.claims.count', b.claims)
  if (!b.atCeiling) return t('dataUi.claims.resets', { count: compte })
  return etatAbandon.value
    ? t('dataUi.claims.ceilingTo', { count: compte, state: etatAbandon.value })
    : t('dataUi.claims.ceiling', { count: compte })
}
</script>

<template>
  <div class="dsq">
    <!-- Le plafond lui-même est annoncé par la barre de statuts (propriété du tableau) :
         ici on porte ce que la file en FAIT — où chaque ligne en est, et lesquelles
         sont à un cheveu d'en sortir. -->
    <span class="dsq-head">{{ t('dataUi.queue.head', { n: rows.length }) }}</span>
    <span v-if="atCeiling" class="dsq-warn">{{ t('dataUi.queue.atCeiling', atCeiling) }}</span>
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
        class="dsq-run" :title="t('dataUi.queue.run', { run: it.bail.run })"
        :to="`/automations?run=${encodeURIComponent(it.bail.run!)}`"
      >{{ t('dataUi.queue.openRun') }}</RouterLink>
      <span v-else-if="it.bail.porteur === 'sans-run'" class="dsq-lease">{{ t('dataUi.queue.noRun') }}</span>
      <Tag v-if="it.bail.etat === 'expire'" tone="terra"
        :title="t('dataUi.queue.expiredHint')">{{ t('dataUi.queue.expired') }}</Tag>
      <span v-else class="dsq-lease">{{ t('dataUi.queue.until', { date: absDate(String(it.row._claimed_until ?? '')) }) }}</span>
      <Btn v-if="canWrite" kind="mini" :title="t('dataUi.queue.releaseHint')"
        @click="emit('release', it.row._id)">{{ t('dataUi.queue.release') }}</Btn>
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
