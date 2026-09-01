<script setup lang="ts">
// Drawer détail / édition / ajout d'une row. v2 (ADR 0046) : la MISE EN PAGE
// s'auto-adapte au schéma — les RÔLES pilotent le layout (zéro métier en dur) :
//   title  → titre éditable de l'en-tête (l'_id passe en sous-titre)
//   status → chip d'en-tête + barre de transitions (plus un input libre)
//   note / qualif → textareas pleine largeur en pied de fiche
//   object / list de sous-records → sections structurées (SubRecordEditor)
//   le reste (badge/metric/scalaires, déclarés ou non) → grille compacte 2 col,
//   inputs typés (number/bool), requis marqués (* / required_when).
import { computed, ref, watch } from 'vue'
import Btn from './Btn.vue'
import Icon from './Icon.vue'
import Tag from './Tag.vue'
import OtoSelect from './OtoSelect.vue'
import FormDialog from './FormDialog.vue'
import SubRecordEditor from './SubRecordEditor.vue'
import ModalOverlay from './ModalOverlay.vue'
import RowAbandonNotice from './RowAbandonNotice.vue'
import { useFormDialog } from '@/composables/useFormDialog'
import type { DatastoreRow, DatastoreSchema, RowActivityEntry } from '@/types/api'
import type { LifecycleIntent } from '@/lib/datastoreLifecycle'
import { abandonVerdict, claimBudget } from '@/lib/datastoreClaims'
import { cellKind, absDate, relDate } from '@/lib/cellRender'
import { actorOf, changeOf, originLabel, originTone, whenOf } from '@/lib/rowActivity'
import { bailLigne } from '@/lib/bailDeLigne'
import {
  compositeDraft, formFields, isComposite, isEmptyPayloadValue, payloadValue,
  scalarDraft, type FieldDesc,
} from '@/lib/datastoreForm'
import { getRowActivity } from '@/api/console'
import { cleTitre } from '../../lib/datastoreTitle'

const props = defineProps<{
  open: boolean
  row: DatastoreRow | null   // null + isNew = ajout ; sinon édition/lecture
  fields: string[]           // colonnes connues du namespace (pour l'ajout)
  isNew: boolean
  readOnly: boolean
  schema?: DatastoreSchema | null  // v2 (ADR 0046) : layout typé + transitions
  namespace?: string | null        // b4 : historique de la fiche (fetch lazy à l'ouverture)
}>()
const emit = defineEmits<{
  // Le 2e argument n'est posé que par une transition de cycle de vie : il porte
  // l'état d'AVANT, seul instant où on le connaît encore (cf. applyTransition).
  (e: 'save', payload: Record<string, unknown>, transition?: LifecycleIntent): void
  (e: 'delete'): void
  (e: 'close'): void
  (e: 'release'): void       // libération forcée du bail (file de travail)
}>()

const { formDialog, formDialogOpen, openForm } = useFormDialog()

// Drafts : scalaires en string d'input, composites déclarés en valeur structurée.
const scalars = ref<Record<string, string>>({})
const composites = ref<Record<string, unknown>>({})
const extra = ref<string[]>([])

const editFields = computed<FieldDesc[]>(() =>
  formFields(props.schema, props.row, props.fields, extra.value))

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
const lifecycleOpts = computed(() => lifecycleStates.value.map((s) => ({ value: s, label: s })))
const BOOL_OPTIONS = [{ value: 'true', label: 'true' }, { value: 'false', label: 'false' }]
const isLifecycleStatus = (d: FieldDesc) =>
  d.role === 'status' && lifecycleStates.value.length > 0
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

watch(() => [props.open, props.row], () => {
  if (!props.open) return
  extra.value = []
  const s: Record<string, string> = {}
  const c: Record<string, unknown> = {}
  const base: Record<string, unknown> = props.row ?? {}
  for (const d of formFields(props.schema, props.row, props.fields, [])) {
    if (d.declared && isComposite(d.field)) c[d.key] = compositeDraft(d.field!, base[d.key])
    else s[d.key] = scalarDraft(base[d.key])
  }
  scalars.value = s
  composites.value = c
}, { immediate: true })

function addField() {
  openForm({
    title: 'add field',
    fields: [{ key: 'value', label: 'field name', required: true, placeholder: 'e.g. status' }],
    onConfirm: async (v) => {
      const name = v.value
      if (!name || name.startsWith('_') || name in scalars.value || name in composites.value) return
      extra.value.push(name)
      scalars.value[name] = ''
    },
  })
}

function save() {
  const payload: Record<string, unknown> = {}
  for (const d of editFields.value) {
    const raw = d.declared && isComposite(d.field) ? composites.value[d.key] : (scalars.value[d.key] ?? '')
    const v = payloadValue(d, raw)
    if (props.isNew && isEmptyPayloadValue(v)) continue // ajout : on n'écrit pas les vides
    payload[d.key] = v
  }
  emit('save', payload)
}

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
  | 'url' | 'email' | 'textarea' | 'text'

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
const terminalStates = computed<Set<string>>(() => {
  const lc = statusField.value?.lifecycle
  if (!lc) return new Set()
  if (lc.terminal?.length) return new Set(lc.terminal.map(String))
  // dérivés : états sans transition sortante déclarée
  const outgoing = new Set(Object.entries(lc.transitions ?? {})
    .filter(([, tos]) => tos?.length).map(([from]) => from))
  return new Set((lc.states ?? []).map(String).filter((s) => !outgoing.has(s)))
})
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

// ── historique de la fiche (ADR 0046 b4, élargi) : les appels corrélés à cette
// fiche + leur run — chargé LAZY à l'ouverture (jamais en mode ajout). Le journal
// ne recense plus les seuls gestes d'agent : ceux posés dans la console y figurent
// aussi (kind=rest), d'où le badge d'origine — et le renommage de la section.
const activity = ref<RowActivityEntry[] | null>(null)
const activityFailed = ref(false)
watch(() => [props.open, props.row?._id], async () => {
  activity.value = null
  activityFailed.value = false
  if (!props.open || props.isNew || !props.row?._id || !props.namespace) return
  try {
    activity.value = (await getRowActivity(props.namespace, props.row._id)).activity
  } catch { activityFailed.value = true }
}, { immediate: true })
</script>

<template>
  <ModalOverlay :open="open" @close="emit('close')">
      <div class="modal" role="dialog" aria-modal="true" aria-label="row detail">
        <header class="rd-head">
          <div class="rd-head-txt">
            <!-- le field role=title EST le titre de la fiche -->
            <template v-if="titleDesc">
              <input v-if="!readOnly" v-model="scalars[titleDesc.key]" class="rd-title-input"
                :placeholder="titleDesc.label" />
              <h3 v-else class="modal-title">{{ scalars[titleDesc.key] || '—' }}</h3>
            </template>
            <h3 v-else class="modal-title">{{ isNew ? 'new row' : 'row detail' }}</h3>
            <p v-if="!isNew" class="modal-desc mono">{{ row?._id ?? '' }}</p>
          </div>
          <Tag v-if="currentStatus" tone="saffron">{{ currentStatus }}</Tag>
          <Tag v-if="row?._claimed_by" tone="cobalt"
            :title="`bail de traitement jusqu'à ${row?._claimed_until ?? '?'}`">
            en cours · {{ row._claimed_by }}
          </Tag>
          <Tag v-if="budget" :tone="budget.atCeiling ? 'terra' : undefined"
            :title="`${budget.claims} réservation${budget.claims > 1 ? 's' : ''} sans écriture`
              + (budget.max ? ` — plafond ${budget.max}` : '')">
            {{ budget.label }}
          </Tag>
          <button class="rd-close" aria-label="fermer" @click="emit('close')">
            <Icon name="close" :size="15" />
          </button>
        </header>

        <!-- une ligne que le plafond a sortie de la file dit POURQUOI avant tout le
             reste — et ce qui la remet en circuit. Le motif vient du serveur. -->
        <RowAbandonNotice v-if="abandon" class="rd-abandon" :verdict="abandon" :can-write="!readOnly" />

        <!-- transitions du cycle de vie, sous l'en-tête (l'état courant est le chip) -->
        <div v-if="transitions.length" class="rd-lifecycle">
          <Btn v-for="t in transitions" :key="t" kind="mini"
            :title="terminalStates.has(t) ? 'état terminal (fin de traitement)' : undefined"
            @click="applyTransition(t)">→ {{ t }}<template v-if="terminalStates.has(t)"> ◼</template></Btn>
          <Btn v-if="row?._claimed_by && !readOnly" kind="mini" @click="emit('release')">Libérer le bail</Btn>
        </div>

        <div class="rd-body">
          <!-- scalaires courts : grille compacte 2 colonnes -->
          <div v-if="gridFields.length" class="rd-grid">
            <div v-for="d in gridFields" :key="d.key" class="rd-field"
              :class="{ wide: !readOnly && isWide(d) }">
              <label class="rd-label">{{ d.label }}<span v-if="d.required" class="rd-req"
                  title="champ requis">*</span><span v-else-if="d.requiredWhen" class="rd-req rd-req--soft"
                  :title="`requis quand ${reqWhenLabel(d)}`">*</span></label>

              <template v-if="readOnly">
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
                inputmode="decimal" :placeholder="d.label" />
              <input v-else-if="widgetOf(d) === 'date'" type="date" class="rd-input"
                :value="dateInputValue(d.key, false)"
                @input="scalars[d.key] = ($event.target as HTMLInputElement).value" />
              <input v-else-if="widgetOf(d) === 'datetime'" type="datetime-local" class="rd-input"
                :value="dateInputValue(d.key, true)"
                @input="scalars[d.key] = ($event.target as HTMLInputElement).value" />
              <div v-else-if="widgetOf(d) === 'url'" class="rd-url">
                <input v-model="scalars[d.key]" class="rd-input" type="url" :placeholder="d.label" />
                <a v-if="scalars[d.key]" :href="scalars[d.key]" target="_blank" rel="noopener"
                  class="rd-open" title="Ouvrir le lien"><Icon name="ext" :size="13" /></a>
              </div>
              <input v-else-if="widgetOf(d) === 'email'" v-model="scalars[d.key]" class="rd-input"
                type="email" :placeholder="d.label" />
              <textarea v-else-if="widgetOf(d) === 'textarea'" v-model="scalars[d.key]" class="rd-input rd-area" rows="4" />
              <template v-else>
                <input v-model="scalars[d.key]" class="rd-input" :placeholder="d.label" />
                <!-- valeur ISO non déclarée `date` : on la rend lisible sans la modifier -->
                <span v-if="dateHint(d)" class="rd-hint">{{ dateHint(d) }}</span>
              </template>
            </div>
          </div>

          <!-- sous-records déclarés : sections structurées -->
          <div v-for="d in compositeFields" :key="d.key" class="rd-field rd-section">
            <label class="rd-label">{{ d.label }}<span v-if="d.required" class="rd-req"
                title="champ requis">*</span></label>
            <p v-if="readOnly" class="rd-readval">{{ readVal(d.key) }}</p>
            <SubRecordEditor v-else :field="d.field!"
              :model-value="composites[d.key]" @update:model-value="composites[d.key] = $event" />
          </div>

          <!-- prose (note / qualif) : pleine largeur en pied de fiche -->
          <div v-for="d in longFields" :key="d.key" class="rd-field rd-section">
            <label class="rd-label">{{ d.label }}<span v-if="d.required" class="rd-req"
                title="champ requis">*</span><span v-else-if="d.requiredWhen" class="rd-req rd-req--soft"
                :title="`requis quand ${reqWhenLabel(d)}`">*</span></label>
            <p v-if="readOnly" class="rd-readval">{{ readVal(d.key) }}</p>
            <textarea v-else v-model="scalars[d.key]" class="rd-input rd-area" rows="4"
              :placeholder="d.label" />
          </div>

          <p v-if="!editFields.length" class="dim" style="padding: 8px 0">no fields yet — add one below.</p>

          <!-- les trois états sont rendus : une section qui s'évapore en cas d'échec
               laisserait croire « aucune action sur cette fiche », soit exactement
               l'angle mort que cet historique est censé fermer. -->
          <div v-if="!isNew && namespace" class="rd-activity">
            <span class="rd-label">historique de la fiche</span>
            <p v-if="activityFailed" class="dim rd-activity-state">
              historique indisponible pour le moment.
            </p>
            <p v-else-if="activity && !activity.length" class="dim rd-activity-state">
              aucune action enregistrée sur cette fiche.
            </p>
            <ul v-else-if="activity" class="rd-activity-list">
              <li v-for="(a, i) in activity" :key="i" :class="{ err: !a.ok }">
                <span class="mono dim" :title="absDate(whenOf(a))">{{ relDate(whenOf(a)) }}</span>
                <Tag :tone="originTone(a)">{{ originLabel(a) }}</Tag>
                <span v-if="changeOf(a)" class="rd-activity-change">{{ changeOf(a) }}</span>
                <span class="dim">{{ actorOf(a) }}</span>
                <span v-if="a.doctrine" class="dim">· {{ a.doctrine }}</span>
                <code class="mono rd-activity-tool">{{ a.tool }}</code>
                <span v-if="!a.ok" class="rd-activity-err" :title="a.error ?? undefined">échec</span>
              </li>
            </ul>
            <p v-else class="dim rd-activity-state">chargement…</p>
            <p v-if="activity && activity.length" class="rd-activity-note dim">
              journal de travail (rétention ~30 j), pas un audit permanent.
            </p>
          </div>

          <div v-if="!isNew && row?._updated_at" class="rd-meta dim mono">
            updated {{ absDate(String(row._updated_at)) }}
            <template v-if="row?._claimed_by"> · bail
              jusqu'à {{ absDate(String(row._claimed_until ?? '?')) }}</template>
            <!-- ⚠️ « sans run » est un FAIT — bail pris à la main, ou par un agent
                 qui n'a pas passé son run — pas une donnée manquante. -->
            <template v-if="bail?.porteur === 'run'"> ·
              <RouterLink class="rd-run" :to="`/automations?run=${encodeURIComponent(bail.run!)}`"
                :title="`run ${bail.run}`">voir le travail qui la tient</RouterLink>
            </template>
            <template v-else-if="bail?.porteur === 'sans-run'"> · bail pris sans run</template>
          </div>
        </div>

        <footer class="rd-foot">
          <Btn v-if="!readOnly" kind="mini" icon="plus" @click="addField">Field</Btn>
          <span class="rd-spacer" />
          <Btn v-if="!readOnly && !isNew" kind="danger" icon="trash" @click="emit('delete')">Delete</Btn>
          <Btn kind="ghost" @click="emit('close')">{{ readOnly ? 'Close' : 'Cancel' }}</Btn>
          <Btn v-if="!readOnly" kind="mini" icon="check" @click="save">Save</Btn>
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
.rd-activity-list { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
/* états vide / échec / chargement de l'historique, même gabarit que ses lignes */
.rd-activity-state { margin: 4px 0 0; font-size: 11.5px; }
.rd-activity-list li { font-size: 11.5px; display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; color: var(--color-ink-soft); }
.rd-activity-list li.err { color: var(--color-terra-ink); }
.rd-activity-list code { font-size: 11px; }
/* ce qui a changé : la transition d'état, sinon les champs écrits */
.rd-activity-change {
  font-size: 11px; color: var(--color-ink);
  background: var(--color-paper-2); border-radius: var(--radius-md); padding: 1px 7px;
}
.rd-activity-tool { color: var(--color-faint); margin-left: auto; }
.rd-activity-err { font-size: 10px; color: var(--color-terra-ink); border: 1px solid currentColor; border-radius: var(--radius-pill); padding: 0 6px; }
.rd-activity-note { margin: 6px 0 0; font-size: 10.5px; }
.rd-foot {
  display: flex; align-items: center; gap: 8px; padding: 12px 18px 16px;
  border-top: 1px solid var(--color-hair-soft);
}
.rd-spacer { flex: 1; }
</style>
