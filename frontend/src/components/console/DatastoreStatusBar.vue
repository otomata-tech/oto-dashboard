<script setup lang="ts">
// Barre de statuts du COCKPIT datastore (ADR 0046 b1) — DÉRIVÉE du schéma v2 :
// un chip par état du `lifecycle` du field role="status", avec compteur serveur
// (aggregate). Cliquer filtre sur cet état ; « tous » lève le filtre. Aucune
// notion métier codée en dur : GR/Blitz/Audiens = le même composant.
// La barre NOMME la colonne (son libellé de schéma) et chaque étape en clair
// (`etatLisible`) ; une étape finale le dit — le code brut reste en infobulle.
// Le plafond de réservations (oto-backend#433) se lit ICI aussi : sans lui, l'état
// d'abandon passait pour un état métier comme un autre, et son compteur montait sans
// que rien ne dise que c'est la PLATEFORME qui y verse les lignes.
import { useI18n } from 'vue-i18n'
import { etatLisible } from '@/lib/datastoreLifecycle'

const props = defineProps<{
  label: string                  // libellé de la colonne d'avancement (« Statut »)
  states: string[]
  terminal: string[]             // étapes finales (déclarées, ou sans transition sortante)
  counts: Record<string, number>
  active: string | null
  total: number
  abandonState?: string | null   // lifecycle.abandon_state — l'état où le plafond verse
  maxClaims?: number | null      // lifecycle.max_claims — le plafond déclaré
}>()
const emit = defineEmits<{ select: [state: string | null] }>()
const { t } = useI18n()

function toggle(state: string) {
  emit('select', props.active === state ? null : state)
}
function chipTitle(state: string): string {
  const base = props.active === state
    ? t('dataUi.status.clear') : t('dataUi.status.filter', { state: etatLisible(state) })
  const filtre = props.terminal.includes(state) ? `${base} — ${t('dataUi.lifecycle.finalHint')}` : base
  if (state !== props.abandonState) return filtre
  return props.maxClaims
    ? t('dataUi.status.abandonAfter', { n: props.maxClaims, filter: filtre })
    : t('dataUi.status.abandonExhausted', { filter: filtre })
}
</script>

<template>
  <div class="dsb">
    <span class="dsb-lbl">{{ label }}</span>
    <button class="dsb-chip" :class="{ on: active === null }" @click="emit('select', null)">
      {{ t('dataUi.status.all') }} <span class="dsb-n">{{ total }}</span>
    </button>
    <button v-for="s in states" :key="s" class="dsb-chip"
      :class="{ on: active === s, abandon: !!abandonState && s === abandonState }"
      :title="chipTitle(s)" @click="toggle(s)">
      {{ etatLisible(s) }}<span v-if="terminal.includes(s)" class="dsb-final" aria-hidden="true">◼</span>
      <span class="dsb-n">{{ counts[s] ?? 0 }}</span>
    </button>
    <span v-if="maxClaims" class="dsb-ceiling">
      {{ t('dataUi.status.ceiling', { n: maxClaims }) }}
    </span>
  </div>
</template>

<style scoped>
.dsb {
  display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
  padding: 8px var(--pad-card, 16px);
  border-bottom: 1px solid var(--color-hair-soft, #e6e6e3);
}
.dsb-lbl {
  font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
  color: var(--color-mute, #675a3c); margin-right: 2px;
}
.dsb-final { font-size: 9px; color: var(--color-faint, #6d603f); }
.dsb-chip {
  font: inherit; font-size: 12px; cursor: pointer;
  display: inline-flex; align-items: center; gap: 6px;
  border: 1px solid var(--color-hair, #d8d3c4); border-radius: var(--radius-pill, 999px);
  padding: 2px 10px; background: var(--color-surface, #fff); color: var(--color-mute, #675a3c);
}
.dsb-chip:hover { background: var(--color-paper-3, #f4efe2); }
.dsb-chip.on {
  border-color: var(--color-saffron, #d9a441); color: var(--color-ink, #2a2a2a);
  background: var(--color-saffron-soft, #f7ecd4);
}
/* L'état d'abandon n'est pas un état métier : la plateforme y verse les lignes que le
   plafond a sorties de la file. L'accent le dit — il ne décore pas. */
.dsb-chip.abandon { border-color: var(--color-terra-soft); color: var(--color-terra-ink); }
.dsb-chip.abandon.on { border-color: var(--color-terra); background: var(--color-terra-soft); }
.dsb-n {
  font-size: 11px; font-family: var(--font-mono, monospace);
  color: var(--color-faint, #6d603f);
}
.dsb-chip.on .dsb-n { color: var(--color-ink, #2a2a2a); }
.dsb-ceiling { font-size: 11px; color: var(--color-faint, #6d603f); }
</style>
