<script setup lang="ts">
// Rendu d'un namespace TYPÉ en fiches lisibles (ADR 0032 §6 / 0029, B6b). Chaque
// row devient une fiche dont la mise en page DÉRIVE des rôles de rendu du schéma
// (title/badge/metric/status/qualif/note) — vs le tableau plat. Les champs non
// déclarés au schéma restent affichés en pied de fiche (rien n'est masqué).
// v2 (ADR 0046) : les champs IMBRIQUÉS déclarés (`object`+fields, `list`+of) sont
// rendus en sous-sections structurées (ex. contacts[]) au lieu d'un JSON brut,
// et une row sous bail de file de travail porte le badge « en cours · worker ».
import { computed } from 'vue'
import Tag from '@/components/console/Tag.vue'
import type { DatastoreRow, DatastoreSchema, DatastoreField } from '@/types/api'

const props = defineProps<{ rows: DatastoreRow[]; schema: DatastoreSchema }>()
const emit = defineEmits<{ open: [row: DatastoreRow] }>()

const fields = computed<DatastoreField[]>(() => props.schema.fields ?? [])
const byRole = (role: string) => fields.value.filter((f) => f.role === role)
const isComposite = (f: DatastoreField) => f.type === 'object' || f.type === 'list'
const titleF = computed(() => byRole('title')[0])
const badgeF = computed(() => byRole('badge').filter((f) => !isComposite(f)))
const metricF = computed(() => byRole('metric'))
const statusF = computed(() => byRole('status')[0])
const qualifF = computed(() => byRole('qualif').filter((f) => !isComposite(f)))
const noteF = computed(() => byRole('note').filter((f) => !isComposite(f)))
// Champs imbriqués déclarés (hors rôles déjà rendus title/status/metric) → sections.
const compositeF = computed(() =>
  fields.value.filter((f) => isComposite(f) &&
    f !== titleF.value && f !== statusF.value && !metricF.value.includes(f)))
const declaredKeys = computed(() => new Set(fields.value.map((f) => f.key)))

const label = (f: DatastoreField) => f.label || f.key
function fmt(v: unknown): string {
  if (v == null || v === '') return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
const present = (row: DatastoreRow, f?: DatastoreField) => !!f && row[f.key] != null && row[f.key] !== ''
function otherEntries(row: DatastoreRow) {
  return Object.entries(row).filter(
    ([k, v]) => !k.startsWith('_') && !declaredKeys.value.has(k) && v != null && v !== '',
  )
}
function titleOf(row: DatastoreRow): string {
  return titleF.value ? fmt(row[titleF.value.key]) : row._id
}

// ── sous-records (object / list) ─────────────────────────────────────────────
type Pair = [string, string]
const subFields = (f: DatastoreField): DatastoreField[] =>
  f.type === 'object' ? (f.fields ?? [])
    : ((f.of && 'fields' in f.of && f.of.fields) || [])
function subLabel(f: DatastoreField, key: string): string {
  const sf = subFields(f).find((s) => s.key === key)
  return sf?.label || key
}
/** Un item (dict) → paires [label, valeur] rendables ; champs déclarés d'abord. */
function pairsOf(f: DatastoreField, item: unknown): Pair[] {
  if (item == null || typeof item !== 'object' || Array.isArray(item))
    return [['', fmt(item)]]
  const rec = item as Record<string, unknown>
  const declared = subFields(f).map((s) => s.key)
  const keys = [...declared.filter((k) => rec[k] != null && rec[k] !== ''),
                ...Object.keys(rec).filter((k) => !declared.includes(k) && rec[k] != null && rec[k] !== '')]
  return keys.map((k) => [subLabel(f, k), fmt(rec[k])])
}
/** Items d'un champ composite : object → [lui-même] ; list → ses items. */
function itemsOf(row: DatastoreRow, f: DatastoreField): unknown[] {
  const v = row[f.key]
  if (v == null || v === '') return []
  return f.type === 'list' ? (Array.isArray(v) ? v : [v]) : [v]
}
</script>

<template>
  <div class="ds-cards">
    <article v-for="row in rows" :key="row._id" class="ds-card" @click="emit('open', row)">
      <header class="ds-card__head">
        <h4 class="ds-card__title">{{ titleOf(row) }}</h4>
        <Tag v-if="present(row, statusF)" tone="saffron">{{ fmt(row[statusF!.key]) }}</Tag>
        <Tag v-if="row._claimed_by" tone="cobalt" :title="`bail de traitement (file de travail) jusqu'à ${row._claimed_until ?? '?'}`">
          en cours · {{ row._claimed_by }}
        </Tag>
        <Tag v-for="f in badgeF" :key="f.key" v-show="present(row, f)" tone="cobalt">{{ fmt(row[f.key]) }}</Tag>
      </header>

      <div v-if="metricF.some((f) => present(row, f))" class="ds-card__metrics">
        <div v-for="f in metricF" :key="f.key" v-show="present(row, f)" class="ds-metric">
          <span class="ds-metric__v">{{ fmt(row[f.key]) }}</span>
          <span class="ds-metric__l">{{ label(f) }}</span>
        </div>
      </div>

      <section v-for="f in compositeF" :key="f.key" v-show="itemsOf(row, f).length" class="ds-sub">
        <span class="ds-fieldlabel">
          {{ label(f) }}<template v-if="f.type === 'list' && itemsOf(row, f).length > 1"> · {{ itemsOf(row, f).length }}</template>
        </span>
        <div v-for="(item, i) in itemsOf(row, f)" :key="i" class="ds-sub__item">
          <template v-for="([k, v], j) in pairsOf(f, item)" :key="j">
            <span class="ds-sub__pair"><b v-if="j === 0">{{ v }}</b><template v-else>
              <span v-if="k" class="ds-sub__k">{{ k }}</span> {{ v }}</template></span>
          </template>
        </div>
      </section>

      <div v-for="f in qualifF" :key="f.key" v-show="present(row, f)" class="ds-qualif">
        <span class="ds-fieldlabel">{{ label(f) }}</span>
        <p>{{ fmt(row[f.key]) }}</p>
      </div>

      <p v-for="f in noteF" :key="f.key" v-show="present(row, f)" class="ds-note">{{ fmt(row[f.key]) }}</p>

      <dl v-if="otherEntries(row).length" class="ds-other">
        <template v-for="[k, v] in otherEntries(row)" :key="k">
          <dt>{{ k }}</dt><dd>{{ fmt(v) }}</dd>
        </template>
      </dl>
    </article>
    <p v-if="!rows.length" class="dim" style="text-align: center; padding: 24px">aucune fiche.</p>
  </div>
</template>

<style scoped>
.ds-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; padding: 12px 16px; }
.ds-card { border: 1px solid var(--color-hair-soft, #e6e6e3); border-radius: 10px; padding: 12px 14px; background: #fff; cursor: pointer; transition: box-shadow .15s var(--ease-out, ease); }
.ds-card:hover { box-shadow: 0 2px 10px rgba(0,0,0,.06); }
.ds-card__head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 8px; }
.ds-card__title { flex: 1; min-width: 0; margin: 0; font-size: 14px; font-weight: 700; color: var(--color-ink, #2a2a2a); }
.ds-card__metrics { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 8px; }
.ds-metric { display: flex; flex-direction: column; }
.ds-metric__v { font-size: 18px; font-weight: 700; color: var(--color-ink, #2a2a2a); line-height: 1.1; }
.ds-metric__l { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: var(--color-faint, #9a9a9a); }
.ds-qualif { margin: 6px 0; }
.ds-qualif p { margin: 2px 0 0; font-size: 12.5px; line-height: 1.5; color: var(--color-ink-soft, #4a463d); white-space: pre-wrap; }
.ds-fieldlabel { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: var(--color-faint, #9a9a9a); font-weight: 700; }
.ds-note { margin: 4px 0; font-size: 12px; color: var(--color-ink-soft, #6b6b6b); white-space: pre-wrap; }
.ds-sub { margin: 6px 0; }
.ds-sub__item {
  margin: 3px 0 0; padding: 4px 8px; font-size: 12px; line-height: 1.5;
  border-left: 2px solid var(--color-hair-soft, #e6e6e3);
  color: var(--color-ink-soft, #4a463d);
}
.ds-sub__pair { margin-right: 10px; }
.ds-sub__pair b { color: var(--color-ink, #2a2a2a); font-weight: 600; }
.ds-sub__k { color: var(--color-faint, #9a9a9a); font-size: 11px; }
.ds-other { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 8px 0 0; padding-top: 8px; border-top: 1px dashed var(--color-hair-soft, #e6e6e3); }
.ds-other dt { font-size: 11px; color: var(--color-faint, #9a9a9a); }
.ds-other dd { margin: 0; font-size: 11px; color: var(--color-ink-soft, #4a463d); overflow: hidden; text-overflow: ellipsis; }
</style>
