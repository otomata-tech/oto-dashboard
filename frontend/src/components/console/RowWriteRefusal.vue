<script setup lang="ts">
// Ce qu'une écriture de ligne refusée laisse à la personne (oto#213). Le brouillon est
// toujours gardé, et RIEN n'est renvoyé d'ici :
//   · conflit de révision — la version relue est montrée à côté du brouillon, colonne par
//     colonne ; la personne tranche ce qui s'oppose, reprend sur la version relue, puis
//     réenregistre elle-même. Aucun bouton ne se contente de mettre à jour la révision ;
//   · ligne réservée — dit, sans rien renvoyer ;
//   · refus du schéma qu'aucun champ affiché ne porte — dit en tête (sinon sous le champ).
import { useI18n } from 'vue-i18n'
import Btn from './Btn.vue'
import Notice from './Notice.vue'
import { VIDE_ASSUME, valeurDe } from '@/lib/rowCells'
import type { RefusDeLigne } from '@/lib/rowRefusal'
import type { Choix, ColonneOpposee } from '@/lib/rowConflict'

defineProps<{
  refus: RefusDeLigne | null
  echec: string | null            // un échec qui n'est pas un refus traité (réseau, 500…)
  echecRelecture: string | null
  opposees: ColonneOpposee[] | null
  choix: Record<string, Choix>
  tranche: boolean
  horsChamp: boolean
}>()
const emit = defineEmits<{ choisir: [cle: string, choix: Choix]; reprendre: []; relire: [] }>()
const { t } = useI18n()

function texte(v: unknown): string {
  const x = valeurDe(v)
  if (x === VIDE_ASSUME) return t('rowEditor.leftEmptyShort')
  if (x == null || x === '') return '—'
  return typeof x === 'object' ? JSON.stringify(x) : String(x)
}
</script>

<template>
  <div class="rwr">
    <Notice v-if="refus?.sorte === 'conflit'" tone="warn">
      <strong class="rwr-line">{{ t('rowEditor.conflict.title') }}</strong>
      <span v-if="echecRelecture" class="rwr-line">
        {{ t('rowEditor.conflict.rereadFailed', { reason: echecRelecture }) }}
        <Btn kind="link" @click="emit('relire')">{{ t('common.retry') }}</Btn>
      </span>
      <span v-else-if="!opposees" class="rwr-line">{{ t('rowEditor.conflict.rereading') }}</span>
      <template v-else>
        <span v-if="!opposees.length" class="rwr-line">{{ t('rowEditor.conflict.noDataChange') }}</span>
        <span v-else class="rwr-cols" role="list">
          <span v-for="c in opposees" :key="c.cle" class="rwr-col" role="listitem" :data-col="c.cle">
            <span class="rwr-label">{{ c.libelle }}</span>
            <span class="rwr-val"><em>{{ t('rowEditor.conflict.read') }}</em> {{ texte(c.relue) }}</span>
            <span v-if="c.opposition !== 'ailleurs'" class="rwr-val">
              <em>{{ t('rowEditor.conflict.draft') }}</em> {{ texte(c.ecrite) }}</span>
            <span v-if="c.opposition === 'ailleurs'" class="rwr-note">{{ t('rowEditor.conflict.takenFromRead') }}</span>
            <span v-else-if="c.opposition === 'brouillon'" class="rwr-note">{{ t('rowEditor.conflict.draftKept') }}</span>
            <span v-else class="rwr-choice">
              <Btn kind="mini" :aria-pressed="choix[c.cle] === 'relue'" @click="emit('choisir', c.cle, 'relue')">
                {{ t('rowEditor.conflict.keepRead') }}</Btn>
              <Btn kind="mini" :aria-pressed="choix[c.cle] === 'brouillon'" @click="emit('choisir', c.cle, 'brouillon')">
                {{ t('rowEditor.conflict.keepDraft') }}</Btn>
            </span>
          </span>
        </span>
        <span class="rwr-line">{{ t('rowEditor.conflict.after') }}</span>
        <Btn kind="mini" icon="check" :disabled="!tranche" @click="emit('reprendre')">
          {{ t('rowEditor.conflict.rebase') }}</Btn>
      </template>
    </Notice>
    <Notice v-else-if="refus?.sorte === 'reservee'" tone="warn">
      {{ t('rowEditor.locked') }}
      <span v-if="refus.detail" class="rwr-line">{{ refus.detail }}</span>
    </Notice>
    <Notice v-else-if="refus?.sorte === 'invalide' && horsChamp" tone="warn">
      {{ t('rowEditor.invalid', { reason: refus.detail ?? refus.chemin ?? '—' }) }}
    </Notice>
    <Notice v-else-if="echec" tone="warn">{{ t('rowEditor.saveFailed', { reason: echec }) }}</Notice>
  </div>
</template>

<style scoped>
.rwr-line { display: block; margin-bottom: 4px; }
.rwr-cols { display: flex; flex-direction: column; gap: 6px; margin: 6px 0; }
.rwr-col {
  display: flex; flex-direction: column; gap: 2px; padding: 6px 8px;
  border-radius: var(--radius-md); background: var(--color-surface); color: var(--color-ink);
}
.rwr-label { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--color-mute); }
.rwr-val { font-size: 12px; overflow-wrap: anywhere; }
.rwr-val em { font-style: normal; color: var(--color-mute); margin-right: 4px; }
.rwr-note { font-size: 11px; color: var(--color-mute); }
.rwr-choice { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
.rwr-choice :deep([aria-pressed="true"]) { background: var(--color-saffron-soft); color: var(--color-saffron-ink); }
</style>
