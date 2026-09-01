<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import Btn from './Btn.vue'
import OtoLoading from './OtoLoading.vue'
import OtoSelect from './OtoSelect.vue'
import ColumnFilterCell from './ColumnFilterCell.vue'
import FilterChips from './FilterChips.vue'
import DatastoreSearchBar from './DatastoreSearchBar.vue'
import type { ColumnFilter, DatastoreRow, DatastoreSchema } from '@/types/api'
import { cellKind, cellShort, absDate, relDate } from '@/lib/cellRender'
import {
  buildFilters, columnFilterKind, defaultOp, filterChipLabel, isMetaDateField,
  metaFieldLabel, META_DATE_FIELDS,
  type ColFilterState, type FilterKind,
} from '@/lib/datastoreFilters'
import { userFields, defaultColumns } from '@/lib/datastoreColumns'

// Grille SERVER-DRIVEN : tri/pagination/recherche/filtres côté API (le parent fetch).
// Ce composant n'affiche que la page courante et émet les changements.
const props = defineProps<{
  rows: DatastoreRow[]
  total: number
  page: number              // 0-based
  pageSize: number
  sortField: string | null
  sortDir: 'asc' | 'desc'
  search: string
  filters: ColumnFilter[]
  loading?: boolean
  schema?: DatastoreSchema | null   // libellés + priorité des colonnes (ADR 0046)
  cols?: string[] | null            // colonnes choisies (null = celles du schéma)
  canSaveView?: boolean             // droit de figer la vue dans le schéma du tableau
}>()
const emit = defineEmits<{
  (e: 'open', row: DatastoreRow): void
  (e: 'update:page', page: number): void
  (e: 'update:pageSize', size: number): void
  (e: 'update:sort', field: string, dir: 'asc' | 'desc'): void
  (e: 'update:search', q: string): void
  (e: 'update:filters', filters: ColumnFilter[]): void
  (e: 'update:cols', cols: string[] | null): void
  (e: 'save-view', hidden: string[]): void   // figer la vue = déclarer `hidden` au schéma
}>()

const DEFAULT_SORT = '_updated_at'
const PAGE_SIZES = [25, 50, 100]

// Colonnes = champs user de la page courante (ordre de 1re apparition) + « updated ».
// Tout champ méta `_…` est exclu (dont `_claimed_by`/`_claimed_until`, bail de la
// file de travail v2 — rendu en badge dans les fiches, pas en colonne). Règle
// partagée avec l'export CSV (`lib/datastoreColumns`, oto-dashboard#137) : deux
// calculs indépendants du « quelles colonnes » sont ce qui a laissé les colonnes
// internes fuiter côté export.
const fields = computed<string[]>(() => userFields(props.rows))
// ── colonnes AFFICHÉES ──────────────────────────────────────────────────────
// **Le schéma décide.** Un champ déclaré `hidden` est masqué, tous les autres sont
// affichés — sans plafond. Un plafond arbitraire par-dessus `hidden` contredisait
// l'intention de l'auteur du tableau : il fallait rallumer une à une les colonnes
// qu'on avait explicitement laissées visibles (vécu en démo client sur un tableau
// à ~30 champs enrichis). Le débordement horizontal se règle en déclarant `hidden`
// (ou en décochant puis en enregistrant la vue), pas en devinant à la place de l'auteur.
// Sans schéma (table libre) : tout, comme avant — il n'y a ni `hidden` à déclarer ni
// vue à enregistrer, plafonner n'y laisserait aucun moyen de revenir en arrière.
const schemaFields = computed(() => props.schema?.fields ?? [])
const fieldByKey = computed(() =>
  Object.fromEntries(schemaFields.value.filter((f) => f.key).map((f) => [f.key, f])))

/** Colonnes par défaut : tout ce que le schéma ne masque pas, dans son ordre. */
const defaultCols = computed<string[]>(() => defaultColumns(fields.value, props.schema))

// `cols` est CONTRÔLÉ par le parent (miroir d'URL) comme la recherche et les filtres :
// une valeur locale se perdait à chaque remontage du composant — c'est ce qui faisait
// « disparaître » les colonnes choisies en naviguant.
const chosenCols = computed<string[] | null>(() => props.cols ?? null)
const shownFields = computed<string[]>(() =>
  (chosenCols.value ?? defaultCols.value).filter((k) => fields.value.includes(k)))
const hiddenCount = computed(() => fields.value.length - shownFields.value.length)
const colsOpen = ref(false)
/** La sélection courante s'écarte-t-elle de ce que le schéma déclare ? */
const colsDiffer = computed(() => {
  const a = shownFields.value, b = defaultCols.value
  return a.length !== b.length || a.some((k, i) => k !== b[i])
})

function toggleCol(k: string) {
  const cur = new Set(shownFields.value)
  cur.has(k) ? cur.delete(k) : cur.add(k)
  emit('update:cols', fields.value.filter((f) => cur.has(f)))   // ordre stable
}
const isShown = (k: string) => shownFields.value.includes(k)

// ── dates système ───────────────────────────────────────────────────────────
// « modifié le » est toujours en bout de table (c'est le tri par défaut) ;
// « créé le » s'ajoute à la demande, via le même sélecteur de colonnes. Les deux
// se trient ET se filtrent (le WHERE serveur les route hors du JSON, cf.
// db._DS_META_TS_COLS) — le filtre y était jusqu'ici explicitement omis.
const shownMeta = ref<string[]>(['_updated_at'])
const isMetaShown = (k: string) => shownMeta.value.includes(k)
function toggleMeta(k: string) {
  shownMeta.value = isMetaShown(k)
    ? shownMeta.value.filter((m) => m !== k)
    : META_DATE_FIELDS.filter((m) => m === k || isMetaShown(m))
}

const columns = computed(() => [...shownFields.value, ...shownMeta.value])

// Largeur par NATURE du champ : un statut ou une date n'a pas besoin de la même place
// qu'une note. Dérivée du schéma quand il existe (rôle puis type), sinon largeur médiane.
const TIGHT_ROLES = new Set(['status', 'badge', 'metric'])
const TIGHT_TYPES = new Set(['bool', 'number', 'date', 'datetime', 'enum'])
const WIDE_ROLES = new Set(['note'])
function colWidthClass(col: string): string {
  if (isMetaDateField(col)) return 'dt-td--tight'
  const f = fieldByKey.value[col]
  if (!f) return ''
  if (WIDE_ROLES.has(f.role ?? '')) return 'dt-td--wide'
  if (TIGHT_ROLES.has(f.role ?? '') || TIGHT_TYPES.has(f.type ?? '')) return 'dt-td--tight'
  return ''
}

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
const rangeText = computed(() => {
  if (!props.total) return '0 rows'
  const from = props.page * props.pageSize + 1
  const to = Math.min(props.total, (props.page + 1) * props.pageSize)
  return `${from}–${to} / ${props.total}`
})

// En-tête = libellé du schéma quand il existe (« Paiement GoCardless »), pas la clé
// technique (« payment_id »).
function header(col: string): string {
  if (isMetaDateField(col)) return metaFieldLabel(col)
  return fieldByKey.value[col]?.label || col
}
function sortGlyph(col: string): string {
  if (props.sortField !== col) return '↕'
  return props.sortDir === 'desc' ? '↓' : '↑'
}
// Tri 3 états : desc → asc → retour au tri par défaut (« updated », plus récent d'abord).
function toggleSort(col: string) {
  if (props.sortField !== col) emit('update:sort', col, 'desc')
  else if (props.sortDir === 'desc') emit('update:sort', col, 'asc')
  else if (col === DEFAULT_SORT) emit('update:sort', col, 'desc')
  else emit('update:sort', DEFAULT_SORT, 'desc')
}
function sortTitle(col: string): string {
  if (props.sortField !== col) return `trier par ${header(col)}`
  return props.sortDir === 'desc' ? 'tri croissant' : (col === DEFAULT_SORT ? 'inverser' : 'annuler le tri')
}
function cellVal(row: DatastoreRow, col: string): unknown { return row[col] }

// Recherche : champ partagé (frappe locale + débounce dans DatastoreSearchBar),
// la source de vérité reste `props.search` côté parent.

// ── filtres par colonne (server-side via le parent) ──────────────────────────
const showFilters = ref(false)
// État local par champ user (source de vérité des inputs). On NE reseed PAS depuis
// props.filters à chaque refetch (éviter les sauts de curseur) — seulement les
// champs que l'état local ne connaît pas encore (restauration deep-link, montage)
// et le reset externe (changement de namespace → props.filters=[]) qui vide tout.
const local = reactive<Record<string, ColFilterState>>({})
const kindCache = new Map<string, FilterKind>()
function colKind(field: string): FilterKind {
  let k = kindCache.get(field)
  if (!k) {
    k = columnFilterKind(props.rows, field, fieldByKey.value[field]?.type)
    kindCache.set(field, k)
  }
  return k
}
function modelFor(field: string): ColFilterState {
  return local[field] ?? { op: defaultOp(colKind(field)), value: '' }
}
let ftimer: ReturnType<typeof setTimeout> | null = null
function onCell(field: string, v: ColFilterState) {
  local[field] = v
  if (ftimer) clearTimeout(ftimer)
  ftimer = setTimeout(() => emit('update:filters', buildFilters(local)), 300)
}
function clearFilters() {
  for (const k of Object.keys(local)) delete local[k]
  emit('update:filters', [])
}
function clearAll() {
  emit('update:search', '')
  clearFilters()
}
// Chips = les filtres APPLIQUÉS (props), retirables un à un sans ouvrir la ligne.
const chips = computed(() =>
  props.filters.map((f) => ({
    field: f.field,
    label: filterChipLabel(f, colKind(f.field), header(f.field)),
  })))
function removeChip(field: string) {
  delete local[field]
  emit('update:filters', buildFilters(local))
}
const activeFilterCount = computed(() => props.filters.length)
watch(() => props.rows, () => kindCache.clear())  // colonnes/typage peuvent changer de namespace
watch(() => props.filters, (f) => {
  if (!f.length) {
    if (Object.keys(local).length) for (const k of Object.keys(local)) delete local[k]
    return
  }
  for (const cf of f) {
    if (!local[cf.field])
      local[cf.field] = { op: cf.op, value: Array.isArray(cf.value) ? cf.value.join(',') : cf.value }
    // Un filtre restauré d'un `?f=` partagé doit être VISIBLE : sinon la chip
    // annonce un filtre sur une colonne absente de la table, inéditable.
    if (isMetaDateField(cf.field) && !isMetaShown(cf.field)) toggleMeta(cf.field)
  }
}, { immediate: true })
</script>

<template>
  <div class="dt">
    <div class="dt-bar">
      <DatastoreSearchBar :model-value="search" placeholder="search…"
        @update:model-value="(q: string) => emit('update:search', q)" />
      <button class="dt-filter-toggle" :class="{ on: showFilters || activeFilterCount }"
        :title="showFilters ? 'hide column filters' : 'filter by column'"
        @click="showFilters = !showFilters">
        filters<span v-if="activeFilterCount" class="dt-filter-badge">{{ activeFilterCount }}</span>
      </button>
      <button v-if="activeFilterCount" class="dt-filter-clear" @click="clearFilters">Clear</button>
      <!-- sélecteur de colonnes : ce qui est masqué par défaut reste accessible ici -->
      <span v-if="fields.length" class="dt-cols">
        <button class="dt-filter-toggle" :class="{ on: colsOpen || hiddenCount > 0 }"
          title="Choisir les colonnes affichées" @click="colsOpen = !colsOpen">
          colonnes<span v-if="hiddenCount > 0" class="dt-filter-badge">{{ shownFields.length }}/{{ fields.length }}</span>
        </button>
        <template v-if="colsOpen">
          <span class="dt-cols__scrim" @click="colsOpen = false"></span>
          <div class="dt-cols__pop">
            <label v-for="k in fields" :key="k" class="dt-cols__item">
              <input type="checkbox" :checked="isShown(k)" @change="toggleCol(k)" />
              <span>{{ header(k) }}</span>
            </label>
            <div class="dt-cols__sep">dates système</div>
            <label v-for="k in META_DATE_FIELDS" :key="k" class="dt-cols__item">
              <input type="checkbox" :checked="isMetaShown(k)" @change="toggleMeta(k)" />
              <span>{{ metaFieldLabel(k) }}</span>
            </label>
            <!-- Figer la vue = écrire `hidden` dans le SCHÉMA du tableau (pas une
                 préférence locale) : la vue vaut alors pour tous ceux qui l'ouvrent,
                 depuis n'importe quel poste, et reste le mécanisme qu'on éditait déjà
                 à la main. Réservé à qui peut gouverner le tableau. -->
            <button v-if="canSaveView && colsDiffer" class="dt-cols__save"
              title="Les colonnes décochées seront masquées par défaut pour tout le monde"
              @click="emit('save-view', fields.filter((k) => !isShown(k))); colsOpen = false">
              Enregistrer comme vue par défaut
            </button>
            <button v-if="chosenCols" class="dt-cols__reset" @click="emit('update:cols', null)">
              Rétablir les colonnes du schéma
            </button>
          </div>
        </template>
      </span>
      <span class="dim dt-count">{{ total }} row{{ total === 1 ? '' : 's' }}</span>
    </div>

    <FilterChips :chips="chips" class="dt-chips" @remove="removeChip" />

    <div class="tbl-scroll">
      <table class="tbl">
        <thead>
          <tr>
            <th v-for="col in columns" :key="col" class="dt-th"
              :class="{ num: isMetaDateField(col), sorted: sortField === col }"
              :title="sortTitle(col)" @click="toggleSort(col)">
              <span class="dt-th-inner">{{ header(col) }}<span class="dt-sort">{{ sortGlyph(col) }}</span></span>
            </th>
          </tr>
          <tr v-if="showFilters" class="dt-filter-row">
            <th v-for="col in columns" :key="col">
              <ColumnFilterCell :field="col" :kind="colKind(col)"
                :model-value="modelFor(col)" @update:model-value="onCell(col, $event)" />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row._id" class="dt-row" @click="emit('open', row)">
            <td v-for="col in columns" :key="col"
              :class="[colWidthClass(col), { num: isMetaDateField(col) }]">
              <span v-if="isMetaDateField(col)" class="dim mono" :title="absDate(String(cellVal(row, col) ?? ''))">
                {{ relDate(cellVal(row, col)) }}
              </span>
              <a v-else-if="cellKind(cellVal(row, col)) === 'url'" :href="String(cellVal(row, col))"
                target="_blank" rel="noopener" class="dt-link" @click.stop>
                {{ cellShort(cellVal(row, col)) }}
              </a>
              <span v-else-if="cellKind(cellVal(row, col)) === 'date'" class="mono"
                :title="relDate(cellVal(row, col))">
                {{ absDate(String(cellVal(row, col))) }}
              </span>
              <span v-else-if="cellKind(cellVal(row, col)) === 'number'" class="num mono">
                {{ cellShort(cellVal(row, col)) }}
              </span>
              <span v-else :title="cellShort(cellVal(row, col))">{{ cellShort(cellVal(row, col)) }}</span>
            </td>
          </tr>
          <tr v-if="!rows.length">
            <td :colspan="columns.length" class="dim" style="text-align: center; padding: 16px">
              <OtoLoading v-if="loading" label="chargement…" style="justify-content: center" />
              <template v-else-if="search || filters.length">
                no rows match —
                <button class="dt-clear-inline" @click="clearAll">Clear filters &amp; search</button>
              </template>
              <template v-else>no rows match.</template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="total" class="dt-pager">
      <span class="dim dt-range">{{ rangeText }}</span>
      <div v-if="pageCount > 1" class="dt-pager-nav">
        <Btn kind="ghost" :disabled="page <= 0" title="première page" @click="emit('update:page', 0)">«</Btn>
        <Btn kind="ghost" :disabled="page <= 0" @click="emit('update:page', page - 1)">‹ Prev</Btn>
        <span class="dim">page {{ page + 1 }} / {{ pageCount }}</span>
        <Btn kind="ghost" :disabled="page >= pageCount - 1" @click="emit('update:page', page + 1)">Next ›</Btn>
        <Btn kind="ghost" :disabled="page >= pageCount - 1" title="dernière page"
          @click="emit('update:page', pageCount - 1)">»</Btn>
      </div>
      <label class="dim dt-psize">
        <OtoSelect :model-value="String(pageSize)" size="sm"
          @update:model-value="(v: string) => emit('update:pageSize', Number(v))"
          :options="PAGE_SIZES.map((s) => ({ value: String(s), label: String(s) }))" />
        / page
      </label>
    </div>
  </div>
</template>

<style scoped>
.dt-bar { display: flex; align-items: center; gap: 12px; padding: 8px var(--pad-card); }
/* sélecteur de colonnes (popin ancrée, même patron que les menus de la console) */
.dt-cols { position: relative; display: inline-flex; }
.dt-cols__scrim { position: fixed; inset: 0; z-index: var(--z-menu); }
.dt-cols__pop {
  position: absolute; top: calc(100% + 6px); left: 0; z-index: var(--z-menu);
  min-width: 220px; max-height: 320px; overflow-y: auto; padding: 6px;
  background: var(--color-surface); border: 1px solid var(--border-card);
  border-radius: var(--radius-md); box-shadow: var(--shadow-pop);
}
.dt-cols__item {
  display: flex; align-items: center; gap: 8px; padding: 6px 8px;
  font-size: 12.5px; color: var(--color-ink); cursor: pointer; border-radius: var(--radius-md);
}
.dt-cols__item:hover { background: var(--color-paper-2); }
.dt-cols__sep {
  margin-top: 4px; padding: 6px 8px 2px; border-top: 1px solid var(--color-hair-soft);
  font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: var(--color-faint);
}
.dt-cols__reset {
  width: 100%; margin-top: 4px; padding: 6px 8px; border: 0; border-top: 1px solid var(--color-hair-soft);
  background: transparent; font-size: 11.5px; color: var(--color-mute); cursor: pointer; text-align: left;
}
.dt-cols__reset:hover { color: var(--color-ink); }
.dt-cols__save {
  width: 100%; margin-top: 4px; padding: 6px 8px; border: 0; border-top: 1px solid var(--color-hair-soft);
  background: transparent; font-size: 11.5px; color: var(--color-cobalt); cursor: pointer; text-align: left;
}
.dt-cols__save:hover { text-decoration: underline; }
.dt-count { font-size: 11px; white-space: nowrap; }
.dt-filter-toggle, .dt-filter-clear {
  font: inherit; font-size: 11px; cursor: pointer; border: 1px solid var(--color-hair);
  background: var(--color-surface); color: var(--color-mute); border-radius: var(--radius-md);
  padding: 2px 8px; display: inline-flex; align-items: center; gap: 5px; white-space: nowrap;
}
.dt-filter-toggle.on { color: var(--color-cobalt); border-color: var(--color-cobalt); }
.dt-filter-clear { border-color: transparent; color: var(--color-faint); }
.dt-filter-clear:hover { color: var(--color-terra-ink); }
.dt-filter-badge {
  font-size: 10px; background: var(--color-cobalt); color: var(--color-paper);
  border-radius: var(--radius-md); padding: 0 5px; line-height: 1.5;
}
.dt-chips { padding: 0 var(--pad-card) 8px; }
.dt-clear-inline {
  font: inherit; font-size: inherit; border: 0; background: none; cursor: pointer;
  color: var(--color-cobalt); text-decoration: underline; padding: 0;
}
/* En-tête sticky : le scroll vertical vit dans .tbl-scroll, les deux lignes de
   thead restent visibles (hauteur de la 1re ligne figée → offset déterministe). */
.dt { --dt-head-h: 30px; }
.tbl-scroll { overflow: auto; max-height: min(65vh, 640px); }
.dt thead th { position: sticky; z-index: 2; background: var(--color-surface); }
.dt thead tr:first-child th { top: 0; height: var(--dt-head-h); }
.dt thead tr.dt-filter-row th { top: var(--dt-head-h); }
.dt-filter-row th { padding: 4px var(--cell-pad, 8px) 6px; vertical-align: top; }
.dt-th { cursor: pointer; user-select: none; white-space: nowrap; }
.dt-th-inner { display: inline-flex; align-items: center; gap: 4px; }
.dt-sort { color: var(--color-faint); }
.dt-th.sorted .dt-sort { color: var(--color-cobalt); }
.dt-row { cursor: pointer; }
/* Largeur ADAPTATIVE au contenu : une largeur unique de 320px donnait des colonnes
   étroites illisibles pour la prose et un gâchis de place pour un statut ou un code
   postal. On borne par nature de champ (classe posée sur la cellule), le tout restant
   tronqué sur une ligne — la valeur entière se lit dans la fiche. */
.tbl-scroll .tbl td {
  max-width: 340px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.tbl-scroll .tbl td.dt-td--tight { max-width: 130px; }   /* statut, badge, date, booléen, nombre */
.tbl-scroll .tbl td.dt-td--wide  { max-width: 520px; }   /* note, texte long, angle d'appel */
.dt-link { color: var(--color-cobalt); text-decoration: none; }
.dt-link:hover { text-decoration: underline; }
.dt-pager {
  display: flex; align-items: center; gap: 12px; padding: 8px var(--pad-card);
}
.dt-pager-nav { display: flex; align-items: center; gap: 8px; margin-inline: auto; }
.dt-range { font-size: 11px; white-space: nowrap; }
.dt-psize { font-size: 11px; margin-left: auto; white-space: nowrap; }
.dt-pager-nav + .dt-psize { margin-left: 0; }
.dt-psize select {
  font: inherit; font-size: 11px; border: 1px solid var(--color-hair); border-radius: var(--radius-md);
  background: var(--color-surface); color: var(--color-mute); padding: 1px 4px; cursor: pointer;
}
</style>
