<script setup lang="ts">
// Drawer détail / édition / ajout d'une row. v2 (ADR 0046) : la MISE EN PAGE
// s'auto-adapte au schéma — les RÔLES pilotent le layout (zéro métier en dur) :
//   title  → titre éditable de l'en-tête (l'_id passe en sous-titre)
//   status → bloc « Étape : X · Passer à : [Y] » sous l'en-tête (plus un input libre)
//   note / qualif → textareas pleine largeur en pied de fiche
//   object / list de sous-records → sections structurées (SubRecordEditor)
//   le reste (badge/metric/scalaires, déclarés ou non) → grille compacte 2 col,
//   inputs typés (number/bool), requis marqués (* / required_when).
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Btn from './Btn.vue'
import Icon from './Icon.vue'
import Tag from './Tag.vue'
import OtoSelect from './OtoSelect.vue'
import FormDialog from './FormDialog.vue'
import SubRecordEditor from './SubRecordEditor.vue'
import CellLayers from './CellLayers.vue'
import ModalOverlay from './ModalOverlay.vue'
import RowAbandonNotice from './RowAbandonNotice.vue'
import RowActivityList from './RowActivityList.vue'
import RowWriteRefusal from './RowWriteRefusal.vue'
import VideAssumeToggle from './VideAssumeToggle.vue'
import { useFormDialog } from '@/composables/useFormDialog'
import { useRowEditor } from '@/composables/useRowEditor'
import type { DatastoreRow, DatastoreSchema } from '@/types/api'
import { estStatutACycle, etatLisible, etatsTerminaux, type LifecycleIntent } from '@/lib/datastoreLifecycle'
import { abandonVerdict, claimBudget } from '@/lib/datastoreClaims'
import { cellKind, absDate } from '@/lib/cellRender'
import { bailLigne } from '@/lib/bailDeLigne'
import { isComposite, scalarDraft, type FieldDesc } from '@/lib/datastoreForm'
import { accepteVideColonne } from '@/lib/rowDraft'
import { cleTitre } from '../../lib/datastoreTitle'

const props = defineProps<{
  open: boolean
  row: DatastoreRow | null   // null + isNew = ajout ; sinon édition/lecture
  fields: string[]           // colonnes connues du tableau (pour l'ajout)
  isNew: boolean
  readOnly: boolean
  schema?: DatastoreSchema | null  // v2 (ADR 0046) : layout typé + transitions
  datastore?: string | null        // b4 : historique de la fiche (fetch lazy à l'ouverture)
}>()
const emit = defineEmits<{
  // Le 2e argument n'est posé que par une transition de cycle de vie : il porte
  // l'état d'AVANT, seul instant où on le connaît encore (cf. applyTransition).
  (e: 'save', payload: Record<string, unknown>, transition?: LifecycleIntent): void
  (e: 'saved', row: DatastoreRow): void   // édition écrite par la fiche elle-même (oto#213)
  (e: 'delete'): void
  (e: 'close'): void
  (e: 'release'): void       // libération forcée du bail (file de travail)
}>()

const { t } = useI18n()
const { formDialog, formDialogOpen, openForm } = useFormDialog()

// Édition (oto#213) : la ligne est RELUE à l'ouverture, seule la différence part, sur la
// révision lue, et les refus se traitent dans la fiche — tout cela vit dans `useRowEditor`.
// Tant que la relecture n'est pas là, la fiche s'affiche en lecture (`editable`).
const extra = ref<string[]>([])
const {
  scalars, empties, composites, champs: editFields, basculerVide,
  etat, echecLecture, refus, echecEcriture, echecRelecture, envoi,
  ouvrir, rouvrir, fermer, aAjouter, enregistrer, relire,
  choix, opposees, tranche, choisir, reprendre, refusDuChamp, refusHorsChamp, erreursDeColonne,
  couches, origineDe,
} = useRowEditor({
  schema: () => props.schema,
  ligne: () => props.row,
  connues: () => props.fields,
  ajoutees: () => extra.value,
  sansCouches: () => !props.readOnly,
})
const editable = computed(() => !props.readOnly && (props.isNew || etat.value === 'prete'))

// ── répartition PAR RÔLE (l'auto-adaptation au schéma) ──────────────────────
// ⚠️ Résolu depuis le SCHÉMA puis apparié par clé : `FieldDesc` ne porte que
// `role`, et lui faire traverser `display` ajouterait une seconde règle là où
// une seule suffit.
const titleKey = computed(() => cleTitre(props.schema?.fields))
const titleDesc = computed(
  () => editFields.value.find((d) => d.key === titleKey.value) ?? null,
)
const statusField = computed(() =>
  (props.schema?.fields ?? []).find((f) => f.role === 'status') ?? null)
const lifecycleStates = computed<string[]>(() =>
  (statusField.value?.lifecycle?.states ?? []).map(String))
const lifecycleOpts = computed(() => lifecycleStates.value.map((s) => ({ value: s, label: etatLisible(s) })))
const BOOL_OPTIONS = [{ value: 'true', label: 'true' }, { value: 'false', label: 'false' }]
const isLifecycleStatus = (d: FieldDesc) =>
  d.role === 'status' && lifecycleStates.value.length > 0
// « Laisser vide » : là où le contrat accepte la sentinelle, hors statut à cycle de vie
// (qui ne change que par ses transitions). Un composite n'en a pas ; ses cellules d'élément si.
// Offert SOUS la saisie, et seulement quand elle est vide (cf. VideAssumeToggle).
const accepteVide = (d: FieldDesc) => accepteVideColonne(d) && !isLifecycleStatus(d)
const saisieVide = (cle: string) => !(scalars.value[cle] ?? '').trim()
/** Placeholder d'une saisie : le libellé, ou « Laissé vide volontairement » quand c'est le cas. */
const ph = (d: FieldDesc) => (empties.value[d.key] ? t('rowEditor.leftEmpty') : d.label)
const compositeFields = computed(() =>
  editFields.value.filter((d) => d.declared && isComposite(d.field)))
const longFields = computed(() =>
  editFields.value.filter((d) => d.role === 'note' || d.role === 'qualif'))
const gridFields = computed(() =>
  editFields.value.filter((d) =>
    d !== titleDesc.value &&
    !(d.declared && isComposite(d.field)) &&
    d.role !== 'note' && d.role !== 'qualif' &&
    !(isLifecycleStatus(d) && !props.isNew))) // le statut vit dans l'en-tête (sauf création)

watch(() => [props.open, props.row?._id, props.isNew, props.readOnly], () => {
  extra.value = []
  if (props.open && !props.isNew && !props.readOnly && props.row && props.datastore)
    void ouvrir(props.datastore, props.row._id)
  else fermer(props.row)
}, { immediate: true })

function addField() {
  openForm({
    title: t('dataUi.drawer.addField'),
    fields: [{ key: 'value', label: t('dataUi.drawer.fieldName'), required: true, placeholder: t('dataUi.drawer.fieldPlaceholder') }],
    onConfirm: async (v) => {
      const name = v.value
      if (!name || name.startsWith('_') || name in scalars.value || name in composites.value) return
      extra.value.push(name)
      scalars.value[name] = ''
    },
  })
}

async function save() {
  if (props.isNew) { emit('save', aAjouter()); return }
  const ecrite = await enregistrer()
  if (ecrite === 'inchangee') emit('close')   // rien n'a changé : aucun appel
  else if (ecrite) emit('saved', ecrite)
}

/** Le refus du schéma rattaché à ce champ — la phrase du serveur, et l'élément visé. */
function erreurDe(cle: string): string | null {
  const r = refusDuChamp(cle)
  if (!r) return null
  const raison = r.detail ?? t('rowEditor.invalidField')
  return r.chemin && r.chemin !== cle ? `${r.chemin} — ${raison}` : raison
}

const erreurAttendue = (a: string | null) => (a ? t('rowEditor.expected', { attendu: a }) : t('rowEditor.invalidField'))
const aDesCouches = (cle: string) => (editable.value && !props.isNew) // couches (oto#216) : ligne relue, ou existantes
  || !!(couches.value[cle]?.comment || couches.value[cle]?.link || origineDe(cle))

function isLong(key: string): boolean {
  const v = scalars.value[key] ?? ''
  return v.includes('\n') || v.length > 60
}

// ── widget d'édition : dérivé du TYPE, plus de la longueur de la valeur ──
// Avant, un champ >60 caractères devenait une zone de texte pleine ligne : le
// layout changeait d'une ligne à l'autre et une URL s'affichait en gros pavé.
// Le type DÉCLARÉ prime ; sans lui on ne dérive de la valeur que le cas URL
// (non destructif : un champ compact + un lien « ouvrir »), le reste gardant le
// repli historique texte/zone.
type Widget = 'lifecycle' | 'bool' | 'number' | 'enum' | 'date' | 'datetime'
  | 'url' | 'email' | 'phone' | 'textarea' | 'text'

function widgetOf(d: FieldDesc): Widget {
  if (isLifecycleStatus(d)) return 'lifecycle'
  switch (d.type) {
    case 'bool': return 'bool'
    case 'number': return 'number'
    case 'enum': return 'enum'
    case 'date': return 'date'
    case 'datetime': return 'datetime'
    case 'url': return 'url'
    case 'email': return 'email'
    case 'phone': return 'phone'
  }
  if (cellKind(scalars.value[d.key]) === 'url') return 'url'
  return isLong(d.key) ? 'textarea' : 'text'
}

// Largeur : déclarée au schéma (`width`) sinon dérivée du widget — STABLE d'une
// ligne à l'autre, contrairement à l'ancien calcul sur la longueur de la valeur.
function isWide(d: FieldDesc): boolean {
  if (d.width) return d.width === 'full'
  const w = widgetOf(d)
  return w === 'textarea' || w === 'url'
}

const enumOpts = (d: FieldDesc) =>
  (d.options ?? []).map((o) => ({ value: o, label: o }))

/** Partie éditable d'une date/datetime pour les inputs natifs (YYYY-MM-DD[THH:mm]). */
function dateInputValue(key: string, withTime: boolean): string {
  const v = String(scalars.value[key] ?? '').replace(' ', 'T')
  return withTime ? v.slice(0, 16) : v.slice(0, 10)
}

/** Date lisible affichée SOUS un champ texte dont la valeur est un ISO non déclaré
 * `date` — on n'altère pas la donnée, on la rend juste déchiffrable. */
function dateHint(d: FieldDesc): string {
  if (d.type) return ''
  const v = scalars.value[d.key]
  return cellKind(v) === 'date' ? absDate(String(v)) : ''
}
function urlOf(key: string): string | null {
  const v = props.row?.[key]
  return cellKind(v) === 'url' ? String(v) : null
}
/** Le lien d'appel d'un champ `phone` : la forme compacte, séparateurs retirés. */
function telOf(key: string): string | undefined {
  const v = (scalars.value[key] ?? '').replace(/[^+0-9]/g, '')
  return v ? `tel:${v}` : undefined
}
function readVal(key: string): string {
  return scalarDraft(props.row?.[key]) || '—'
}
function reqWhenLabel(d: FieldDesc): string {
  return Object.entries(d.requiredWhen ?? {}).map(([k, v]) => `${k} = ${v}`).join(', ')
}

// ── cycle de vie (ADR 0046 b1) : chip d'état en tête + transitions DÉRIVÉES du
// schéma — seuls les états atteignables sont proposés ; le backend refuse de
// toute façon une transition illégale ou un état incomplet (required_when).
// Le bail de la fiche — et, depuis oto-backend #723, le RUN qui la tient. La
// fiche disait « en cours · <sub du worker> » : on savait qu'un agent la tenait,
// jamais lequel, donc on ne pouvait pas aller voir ce qu'il faisait.
const bail = computed(() => (props.row ? bailLigne(props.row, Date.now()) : null))

const currentStatus = computed<string | null>(() => {
  const k = statusField.value?.key
  const v = k ? props.row?.[k] : null
  return v == null || v === '' ? null : String(v)
})
const transitions = computed<string[]>(() => {
  const lc = statusField.value?.lifecycle
  if (!lc?.states?.length || props.isNew || props.readOnly) return []
  const cur = currentStatus.value
  if (cur == null) return lc.states.map(String)          // pas encore d'état → tous
  return (lc.transitions?.[cur] ?? []).map(String)       // sinon les cibles déclarées
})
const terminalStates = computed(() => etatsTerminaux(statusField.value?.lifecycle))
// Le bloc d'étape : il NOMME la colonne (« Statut ») et l'étape en clair — un badge
// `A_QUALIFIER` et des boutons « → non_interesse ◼ » ne disaient pas de quoi il s'agissait.
const cycle = computed(() => !props.isNew && estStatutACycle(statusField.value))
const stepLabel = computed(() => statusField.value?.label || t('dataUi.lifecycle.step'))
function moveHint(etat: string): string {
  const geste = t('dataUi.lifecycle.moveHint', { state: etatLisible(etat) })
  return terminalStates.value.has(etat) ? `${geste} — ${t('dataUi.lifecycle.finalHint')}` : geste
}
// Ce que la FILE sait de la fiche (oto-backend#433) : le compteur de réservations
// sans écriture, et le motif si le plafond l'a sortie de la file. Les deux étaient
// muets ici — on voyait « en cours · worker » sans savoir que c'était la 3ᵉ fois,
// ni pourquoi la ligne avait cessé d'être servie.
const budget = computed(() => claimBudget(props.row, statusField.value?.lifecycle))
const abandon = computed(() =>
  abandonVerdict(props.row, statusField.value?.key, statusField.value?.lifecycle))

function applyTransition(state: string) {
  const k = statusField.value?.key
  if (!k) return
  // patch partiel ; erreurs (guard-rail) en toast. On transmet l'intention complète
  // — dont l'état d'AVANT — pour que le parent puisse proposer l'annulation : après
  // l'écriture, plus personne ne sait d'où la fiche venait.
  emit('save', { [k]: state }, { key: k, from: currentStatus.value, to: state })
}

</script>

<template>
  <ModalOverlay :open="open" @close="emit('close')">
      <div class="modal" role="dialog" aria-modal="true" :aria-label="t('dataUi.drawer.detail')">
        <header class="rd-head">
          <div class="rd-head-txt">
            <!-- le field role=title EST le titre de la fiche -->
            <template v-if="titleDesc">
              <div v-if="editable" class="rd-title-row">
                <input v-model="scalars[titleDesc.key]" class="rd-title-input" :placeholder="ph(titleDesc)" />
                <VideAssumeToggle v-if="accepteVide(titleDesc)" :model-value="!!empties[titleDesc.key]"
                  :vide="saisieVide(titleDesc.key)" :raison="couches[titleDesc.key]?.comment"
                  @update:model-value="basculerVide(titleDesc.key, $event)" />
              </div>
              <h3 v-else class="modal-title">{{ scalars[titleDesc.key] || '—' }}</h3>
              <p v-if="erreurDe(titleDesc.key)" class="rd-err" role="alert">{{ erreurDe(titleDesc.key) }}</p>
            </template>
            <h3 v-else class="modal-title">{{ isNew ? t('dataUi.drawer.newRow') : t('dataUi.drawer.detail') }}</h3>
            <p v-if="!isNew" class="modal-desc mono">{{ row?._id ?? '' }}</p>
          </div>
          <Tag v-if="row?._claimed_by" tone="cobalt"
            :title="t('dataUi.drawer.leaseUntil', { date: row?._claimed_until ?? '?' })">
            {{ t('dataUi.cards.inProgress', { who: row._claimed_by }) }}
          </Tag>
          <Tag v-if="budget" :tone="budget.atCeiling ? 'terra' : undefined"
            :title="budget.max
              ? t('dataUi.drawer.claimsMax', { count: t('dataUi.claims.count', budget.claims), max: budget.max })
              : t('dataUi.claims.count', budget.claims)">
            {{ budget.label }}
          </Tag>
          <button class="rd-close" :aria-label="t('common.close')" @click="emit('close')">
            <Icon name="close" :size="15" />
          </button>
        </header>

        <!-- une ligne que le plafond a sortie de la file dit POURQUOI avant tout le
             reste — et ce qui la remet en circuit. Le motif vient du serveur. -->
        <RowAbandonNotice v-if="abandon" class="rd-abandon" :verdict="abandon" :can-write="!readOnly" />

        <!-- l'étape de la fiche, dite comme telle, puis les passages que le schéma permet -->
        <div v-if="cycle" class="rd-lifecycle" data-lifecycle>
          <span class="rd-step-lbl">{{ stepLabel }}</span>
          <b class="rd-step" :title="currentStatus ? t('dataUi.lifecycle.code', { code: currentStatus }) : undefined">
            {{ currentStatus ? etatLisible(currentStatus) : t('dataUi.lifecycle.none') }}</b>
          <span v-if="currentStatus && terminalStates.has(currentStatus)" class="rd-final"
            :title="t('dataUi.lifecycle.finalHint')">◼ {{ t('dataUi.lifecycle.final') }}</span>
          <template v-if="transitions.length">
            <span class="rd-step-sep" aria-hidden="true">·</span>
            <span class="rd-step-lbl">{{ t('dataUi.lifecycle.moveTo') }}</span>
            <Btn v-for="etat in transitions" :key="etat" kind="mini" :data-state="etat"
              :title="moveHint(etat)" :aria-label="moveHint(etat)" @click="applyTransition(etat)">
              {{ etatLisible(etat) }}<span v-if="terminalStates.has(etat)" class="rd-final">◼ {{ t('dataUi.lifecycle.final') }}</span>
            </Btn>
          </template>
          <Btn v-if="row?._claimed_by && !readOnly" kind="mini" @click="emit('release')">{{ t('dataUi.drawer.release') }}</Btn>
        </div>

        <!-- une écriture refusée : le brouillon reste, rien n'est renvoyé d'ici (oto#213) -->
        <RowWriteRefusal v-if="refus || echecEcriture" class="rd-refus" :refus="refus"
          :echec="echecEcriture" :echec-relecture="echecRelecture" :opposees="opposees"
          :choix="choix" :tranche="tranche" :hors-champ="refusHorsChamp"
          @choisir="choisir" @reprendre="reprendre" @relire="relire" />

        <div class="rd-body">
          <p v-if="etat === 'lecture'" class="dim rd-state">{{ t('rowEditor.reading') }}</p>
          <p v-else-if="etat === 'echec'" class="rd-err rd-state" role="alert">
            {{ t('rowEditor.readFailed', { reason: echecLecture }) }}
            <Btn kind="link" @click="rouvrir">{{ t('common.retry') }}</Btn>
          </p>
          <!-- scalaires courts : grille compacte 2 colonnes -->
          <div v-if="gridFields.length" class="rd-grid">
            <div v-for="d in gridFields" :key="d.key" class="rd-field" :data-field="d.key"
              :class="{ wide: editable && isWide(d) }">
              <div class="rd-label-row">
                <label class="rd-label">{{ d.label }}<span v-if="d.required" class="rd-req"
                    :title="t('dataUi.drawer.required')">*</span><span v-else-if="d.requiredWhen" class="rd-req rd-req--soft"
                    :title="t('dataUi.drawer.requiredWhen', { when: reqWhenLabel(d) })">*</span></label>
              </div>

              <template v-if="!editable">
                <a v-if="urlOf(d.key)" :href="urlOf(d.key)!" target="_blank" rel="noopener" class="rd-link">
                  {{ row?.[d.key] }}
                </a>
                <p v-else class="rd-readval">{{ readVal(d.key) }}</p>
              </template>
              <template v-else-if="isLifecycleStatus(d)">
                <OtoSelect :model-value="scalars[d.key] ?? ''" @update:model-value="(v: string) => (scalars[d.key] = v)" :options="lifecycleOpts" none-label="—" trigger-class="w-full" />
              </template>
              <OtoSelect v-else-if="widgetOf(d) === 'bool'" :model-value="scalars[d.key] ?? ''" @update:model-value="(v: string) => (scalars[d.key] = v)" :options="BOOL_OPTIONS" none-label="—" trigger-class="w-full" />
              <OtoSelect v-else-if="widgetOf(d) === 'enum'" :model-value="scalars[d.key] ?? ''" @update:model-value="(v: string) => (scalars[d.key] = v)" :options="enumOpts(d)" none-label="—" trigger-class="w-full" />
              <input v-else-if="widgetOf(d) === 'number'" v-model="scalars[d.key]" class="rd-input"
                inputmode="decimal" :placeholder="ph(d)" />
              <input v-else-if="widgetOf(d) === 'date'" type="date" class="rd-input"
                :value="dateInputValue(d.key, false)"
                @input="scalars[d.key] = ($event.target as HTMLInputElement).value" />
              <input v-else-if="widgetOf(d) === 'datetime'" type="datetime-local" class="rd-input"
                :value="dateInputValue(d.key, true)"
                @input="scalars[d.key] = ($event.target as HTMLInputElement).value" />
              <div v-else-if="widgetOf(d) === 'url'" class="rd-url">
                <input v-model="scalars[d.key]" class="rd-input" type="url" :placeholder="ph(d)" />
                <a v-if="scalars[d.key]" :href="scalars[d.key]" target="_blank" rel="noopener"
                  class="rd-open" :title="t('dataUi.drawer.openLink')"><Icon name="ext" :size="13" /></a>
              </div>
              <input v-else-if="widgetOf(d) === 'email'" v-model="scalars[d.key]" class="rd-input"
                type="email" :placeholder="ph(d)" />
              <!-- `phone` (oto#103) : clavier téléphonique, et le lien d'appel sur la forme
                   compacte (séparateurs retirés, comme la validation du serveur). -->
              <div v-else-if="widgetOf(d) === 'phone'" class="rd-url">
                <input v-model="scalars[d.key]" class="rd-input" type="tel" autocomplete="tel"
                  :placeholder="ph(d)" />
                <a v-if="telOf(d.key)" :href="telOf(d.key)" class="rd-open" :title="t('rowEditor.call')">
                  <Icon name="ext" :size="13" /></a>
              </div>
              <textarea v-else-if="widgetOf(d) === 'textarea'" v-model="scalars[d.key]" class="rd-input rd-area" rows="4" :placeholder="ph(d)" />
              <template v-else>
                <input v-model="scalars[d.key]" class="rd-input" :placeholder="ph(d)" />
                <!-- valeur ISO non déclarée `date` : on la rend lisible sans la modifier -->
                <span v-if="dateHint(d)" class="rd-hint">{{ dateHint(d) }}</span>
              </template>
              <VideAssumeToggle v-if="editable && accepteVide(d)" :model-value="!!empties[d.key]"
                :vide="saisieVide(d.key)" :raison="couches[d.key]?.comment"
                @update:model-value="basculerVide(d.key, $event)" />
              <CellLayers v-if="aDesCouches(d.key)" v-model="couches[d.key]" :editable="editable" :origine="origineDe(d.key)" />
              <p v-if="erreurDe(d.key)" class="rd-err" role="alert">{{ erreurDe(d.key) }}</p>
            </div>
          </div>

          <!-- sous-records déclarés : sections structurées -->
          <div v-for="d in compositeFields" :key="d.key" class="rd-field rd-section" :data-field="d.key">
            <label class="rd-label">{{ d.label }}<span v-if="d.required" class="rd-req"
                :title="t('dataUi.drawer.required')">*</span></label>
            <p v-if="!editable" class="rd-readval">{{ readVal(d.key) }}</p>
            <SubRecordEditor v-else-if="composites[d.key]" :field="d.field!" :erreurs="erreursDeColonne(d.key, erreurAttendue)"
              :model-value="composites[d.key]!" @update:model-value="composites[d.key] = $event" />
            <p v-if="erreurDe(d.key)" class="rd-err" role="alert">{{ erreurDe(d.key) }}</p>
          </div>

          <!-- prose (note / qualif) : pleine largeur en pied de fiche -->
          <div v-for="d in longFields" :key="d.key" class="rd-field rd-section" :data-field="d.key">
            <div class="rd-label-row">
              <label class="rd-label">{{ d.label }}<span v-if="d.required" class="rd-req"
                  :title="t('dataUi.drawer.required')">*</span><span v-else-if="d.requiredWhen" class="rd-req rd-req--soft"
                  :title="t('dataUi.drawer.requiredWhen', { when: reqWhenLabel(d) })">*</span></label>
            </div>
            <p v-if="!editable" class="rd-readval">{{ readVal(d.key) }}</p>
            <textarea v-else v-model="scalars[d.key]" class="rd-input rd-area" rows="4"
              :placeholder="ph(d)" />
            <VideAssumeToggle v-if="editable && accepteVide(d)" :model-value="!!empties[d.key]"
              :vide="saisieVide(d.key)" :raison="couches[d.key]?.comment"
              @update:model-value="basculerVide(d.key, $event)" />
            <CellLayers v-if="aDesCouches(d.key)" v-model="couches[d.key]" :editable="editable" :origine="origineDe(d.key)" />
            <p v-if="erreurDe(d.key)" class="rd-err" role="alert">{{ erreurDe(d.key) }}</p>
          </div>

          <p v-if="!editFields.length" class="dim" style="padding: 8px 0">{{ t('dataUi.drawer.noFields') }}</p>

          <!-- historique de la fiche : ses trois états sont rendus (RowActivityList) -->
          <div v-if="!isNew && datastore" class="rd-activity">
            <span class="rd-label">{{ t('dataUi.drawer.history') }}</span>
            <RowActivityList :datastore="datastore" :row-id="row?._id ?? null" />
          </div>

          <div v-if="!isNew && row?._updated_at" class="rd-meta dim mono">
            {{ t('dataUi.drawer.updated', { date: absDate(String(row._updated_at)) }) }}
            <template v-if="row?._claimed_by"> · {{ t('dataUi.queue.until', { date: absDate(String(row._claimed_until ?? '?')) }) }}</template>
            <!-- ⚠️ « sans run » est un FAIT — bail pris à la main, ou par un agent
                 qui n'a pas passé son run — pas une donnée manquante. -->
            <template v-if="bail?.porteur === 'run'"> ·
              <RouterLink class="rd-run" :to="`/automations?run=${encodeURIComponent(bail.run!)}`"
                :title="t('dataUi.queue.run', { run: bail.run })">{{ t('dataUi.drawer.seeRun') }}</RouterLink>
            </template>
            <template v-else-if="bail?.porteur === 'sans-run'"> · {{ t('dataUi.queue.noRun') }}</template>
          </div>
        </div>

        <footer class="rd-foot">
          <Btn v-if="editable" kind="mini" icon="plus" @click="addField">{{ t('dataUi.drawer.field') }}</Btn>
          <span class="rd-spacer" />
          <Btn v-if="!readOnly && !isNew" kind="danger" icon="trash" @click="emit('delete')">{{ t('common.delete') }}</Btn>
          <Btn kind="ghost" @click="emit('close')">{{ readOnly ? t('common.close') : t('common.cancel') }}</Btn>
          <!-- un conflit se tranche AVANT de réenregistrer : aucun renvoi tant qu'il est ouvert -->
          <Btn v-if="!readOnly" kind="mini" icon="check" :disabled="!editable || envoi || refus?.sorte === 'conflit'"
            @click="save">{{ t('common.save') }}</Btn>
        </footer>

        <FormDialog v-if="formDialog" v-model:open="formDialogOpen"
          :title="formDialog.title" :description="formDialog.description"
          :fields="formDialog.fields" :submit-label="formDialog.submitLabel" :on-confirm="formDialog.onConfirm" />
      </div>
  </ModalOverlay>
</template>

<style scoped>
.modal {
  width: 100%; max-width: 680px; max-height: 85vh; display: flex; flex-direction: column;
  background: var(--color-bg); border: 1px solid var(--color-hair); border-radius: 14px;
  box-shadow: 0 18px 50px -12px color-mix(in srgb, var(--color-ink) 35%, transparent);
}
.rd-head { display: flex; align-items: flex-start; gap: 8px; padding: 16px 18px 10px; }
.rd-head-txt { flex: 1; min-width: 0; }
.modal-title { font-size: 16px; font-weight: 700; color: var(--color-ink); margin: 0; }
.modal-desc { font-size: 11px; color: var(--color-faint); margin: 3px 0 0; word-break: break-all; }
.rd-title-input {
  width: 100%; font: inherit; font-size: 16px; font-weight: 700; color: var(--color-ink);
  padding: 2px 6px; margin-left: -6px; border: 1px solid transparent; border-radius: 6px;
  background: transparent;
}
.rd-title-input:hover { border-color: var(--color-hair-soft); }
.rd-title-input:focus { outline: none; border-color: var(--color-cobalt); background: var(--color-surface); }
.rd-title-row, .rd-label-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.rd-label-row { justify-content: space-between; margin-bottom: 4px; }
.rd-label-row .rd-label { margin-bottom: 0; }
.rd-err { margin: 3px 0 0; font-size: 11.5px; color: var(--color-terra-ink); overflow-wrap: anywhere; }
.rd-state { margin: 0 0 8px; font-size: 12px; }
.rd-refus { margin: 0 18px 10px; }
.rd-close {
  flex: none; border: 0; background: transparent; cursor: pointer; padding: 3px;
  border-radius: 7px; color: var(--color-faint); line-height: 0;
}
.rd-close:hover { background: var(--color-paper-2); color: var(--color-ink); }
.rd-abandon { margin: 0 18px 10px; }
.rd-lifecycle {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
  padding: 0 18px 10px;
  border-bottom: 1px solid var(--color-hair-soft);
}
.rd-step-lbl { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--color-mute); }
.rd-step {
  font-size: 12.5px; font-weight: 700; color: var(--color-saffron-ink);
  background: var(--color-saffron-soft); border-radius: var(--radius-pill); padding: 2px 10px;
}
.rd-step-sep { color: var(--color-faint); margin: 0 2px; }
.rd-final { margin-left: 5px; font-size: 10.5px; font-weight: 600; color: var(--color-faint); white-space: nowrap; }
.rd-body { overflow-y: auto; padding: 10px 18px 8px; }
.rd-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; }
.rd-grid .rd-field.wide { grid-column: 1 / -1; }
.rd-field { min-width: 0; margin-bottom: 2px; }
.rd-section { grid-column: 1 / -1; margin-top: 12px; }
.rd-label { display: block; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--color-mute); margin-bottom: 4px; }
.rd-req { color: var(--color-terra-ink); margin-left: 2px; }
.rd-req--soft { opacity: .55; }
.rd-readval { margin: 0; font-size: 13px; color: var(--color-ink); white-space: pre-wrap; line-height: 1.5; overflow-wrap: break-word; }
.rd-link { font-size: 13px; color: var(--color-cobalt); word-break: break-all; }
.rd-input {
  width: 100%; font: inherit; font-size: 13px; padding: 6px 8px;
  border: 1px solid var(--color-hair-soft); border-radius: 6px;
  background: var(--color-surface); color: var(--color-ink);
}
.rd-input:focus { outline: none; border-color: var(--color-cobalt); }
.rd-area { resize: vertical; line-height: 1.5; font-family: var(--font-mono); font-size: 12px; }
/* champ URL : saisie compacte + accès direct au lien (au lieu d'un pavé de texte) */
.rd-url { display: flex; align-items: center; gap: 6px; }
.rd-url .rd-input { flex: 1; min-width: 0; }
.rd-open {
  flex: none; display: inline-flex; align-items: center; justify-content: center;
  height: 30px; width: 30px; border-radius: var(--radius-pill);
  color: var(--color-mute); background: transparent;
}
.rd-open:hover { background: var(--color-paper-2); color: var(--color-cobalt); }
/* date lisible sous une valeur ISO non typée (aide, la donnée reste intacte) */
.rd-hint { display: block; margin-top: 3px; font-size: 10.5px; color: var(--color-faint); }
.rd-meta { padding: 10px 0 2px; font-size: 11px; }
.rd-run { font-weight: 600; color: var(--color-saffron-ink); }
.rd-run:hover { color: var(--color-ink); }
.rd-activity { margin: 14px 0 4px; padding-top: 8px; border-top: 1px dashed var(--color-hair-soft); }
.rd-foot {
  display: flex; align-items: center; gap: 8px; padding: 12px 18px 16px;
  border-top: 1px solid var(--color-hair-soft);
}
.rd-spacer { flex: 1; }
</style>
