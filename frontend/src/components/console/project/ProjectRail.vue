<script setup lang="ts">
// Rail d'entités d'un projet (refonte UX, ADR 0032) — colonne GAUCHE du navigateur.
// Purement présentationnel : reçoit les groupes déjà construits + la sélection courante,
// émet `select` (item) et `add` (kind du groupe). Sous-pages repliables (façon Notion) :
// le repli est un état LOCAL (les clés des pages parentes dépliées).
import { computed, ref } from 'vue'
import Icon from '@/components/console/Icon.vue'
import Tag from '@/components/console/Tag.vue'
import type { RailGroup, RailItem } from './rail'

const props = defineProps<{ groups: RailGroup[]; sel: string; readOnly?: boolean }>()
const emit = defineEmits<{
  select: [RailItem]; add: [RailGroup['addKind']]
  // Déplacement d'une PAGE (Ship 2 + reparentage) : `parentId` = parent de destination
  // (null = racine), `beforeId` = page avant laquelle s'insérer (null = fin). Le parent
  // résout l'INDEX dans les enfants de `parentId` puis appelle moveDoc (parent_id + position).
  move: [{ id: number; parentId: number | null; beforeId: number | null }]
}>()

// Drag natif (pas de dépendance) — pages seulement. 3 zones sur la ligne cible : haut =
// insérer AVANT · bas = insérer APRÈS · milieu = IMBRIQUER SOUS (reparentage). Garde
// anti-cycle : jamais déposer une page sur elle-même ni sur un de ses descendants.
const dragKey = ref<string | null>(null)
const overKey = ref<string | null>(null)
const dropMode = ref<'before' | 'after' | 'inside' | null>(null)
const draggable = (it: RailItem) => !props.readOnly && it.kind === 'page' && !it.home && !!it.doc
const allItems = () => props.groups.flatMap((g) => g.items)
const dragged = computed<RailItem | null>(() =>
  dragKey.value ? allItems().find((x) => x.key === dragKey.value) ?? null : null)

// `cand` est-il un descendant de `anc` (ou lui-même) ? — remonte la chaîne parentKey.
function isSelfOrDescendant(cand: RailItem, anc: RailItem): boolean {
  let cur: RailItem | undefined = cand
  const items = allItems()
  while (cur) {
    if (cur.key === anc.key) return true
    cur = cur.parentKey ? items.find((x) => x.key === cur!.parentKey) : undefined
  }
  return false
}
function parentDocId(it: RailItem): number | null {
  return it.parentKey ? (allItems().find((x) => x.key === it.parentKey)?.doc?.id ?? null) : null
}
function nextSiblingDocId(it: RailItem): number | null {
  const sibs = allItems().filter((x) => x.kind === 'page' && (x.parentKey ?? null) === (it.parentKey ?? null))
  return sibs[sibs.findIndex((x) => x.key === it.key) + 1]?.doc?.id ?? null
}

function onDragStart(it: RailItem, e: DragEvent) {
  dragKey.value = it.key
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
function onDragOver(it: RailItem, e: DragEvent) {
  const src = dragged.value
  if (!src || !draggable(it) || isSelfOrDescendant(it, src)) return
  e.preventDefault()
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const y = (e.clientY - r.top) / r.height
  dropMode.value = y < 0.28 ? 'before' : y > 0.72 ? 'after' : 'inside'
  overKey.value = it.key
}
function onDrop(target: RailItem | null) {
  const src = dragged.value
  if (src?.doc) {
    if (target === null) {
      emit('move', { id: src.doc.id, parentId: null, beforeId: null })   // droptail = racine, fin
    } else if (draggable(target) && !isSelfOrDescendant(target, src) && dropMode.value) {
      const id = src.doc.id
      if (dropMode.value === 'inside') emit('move', { id, parentId: target.doc!.id, beforeId: null })
      else if (dropMode.value === 'before') emit('move', { id, parentId: parentDocId(target), beforeId: target.doc!.id })
      else emit('move', { id, parentId: parentDocId(target), beforeId: nextSiblingDocId(target) })
    }
  }
  onDragEnd()
}
function onDragEnd() { dragKey.value = null; overKey.value = null; dropMode.value = null }

// Pages dépliées (par clé). Défaut : tout déplié — on replie à la demande.
const collapsed = ref<Set<string>>(new Set())
function toggle(key: string) {
  const next = new Set(collapsed.value)
  next.has(key) ? next.delete(key) : next.add(key)
  collapsed.value = next
}
function hasKids(g: RailGroup, it: RailItem): boolean {
  return g.items.some((x) => x.parentKey === it.key)
}
// Item masqué si un de ses ancêtres est replié.
function hidden(g: RailGroup, it: RailItem): boolean {
  return it.parentKey != null && collapsed.value.has(it.parentKey)
}
const visibleItems = (g: RailGroup) => g.items.filter((it) => !hidden(g, it))
const isSel = (it: RailItem) => it.key === props.sel
// Grille saffron de sélection (motif récurrent du DS, ADR guide §4).
const edge = (it: RailItem) => (isSel(it) ? 'inset 2px 0 0 var(--color-saffron)' : 'none')
const nonEmpty = computed(() => props.groups.filter((g) => g.items.length || g.addKind))
</script>

<template>
  <div class="rail">
    <div v-for="g in nonEmpty" :key="g.key" class="rail__grp">
      <div class="rail__hd">
        <span class="rail__hdic"><Icon :name="g.icon" :size="14" /></span>
        <span class="rail__hdl">{{ g.label }}</span>
        <button v-if="!readOnly" class="rail__add" :aria-label="'ajouter ' + g.label" title="Ajouter"
          @click="emit('add', g.addKind)"><Icon name="plus" :size="12" /></button>
      </div>
      <div class="rail__items">
        <button v-for="it in visibleItems(g)" :key="it.key" class="rail__it"
          :class="{ 'rail__it--on': isSel(it), 'rail__it--drag': dragKey === it.key,
            'rail__it--before': overKey === it.key && dropMode === 'before',
            'rail__it--after': overKey === it.key && dropMode === 'after',
            'rail__it--inside': overKey === it.key && dropMode === 'inside' }"
          :style="{ paddingLeft: (10 + (it.pad ?? 0) * 15) + 'px', boxShadow: edge(it) }"
          :title="it.hint || undefined"
          :draggable="draggable(it)"
          @click="emit('select', it)"
          @dragstart="onDragStart(it, $event)" @dragover="onDragOver(it, $event)"
          @drop="onDrop(it)" @dragend="onDragEnd">
          <span v-if="draggable(it)" class="rail__grip" aria-hidden="true"><Icon name="grip" :size="11" /></span>
          <span v-if="hasKids(g, it)" class="rail__chev" :class="{ 'rail__chev--folded': collapsed.has(it.key) }"
            title="Déplier / replier" @click.stop="toggle(it.key)"><Icon name="chevd" :size="12" /></span>
          <span v-if="it.home" class="rail__homeic"><Icon name="house" :size="13" /></span>
          <span class="rail__lbl">{{ it.label }}</span>
          <Tag v-if="it.railTag" :tone="it.railTag.tone">{{ it.railTag.label }}</Tag>
        </button>
        <div v-if="dragKey && g.kind === 'page'" class="rail__droptail"
          @dragover.prevent="overKey = '__tail__'" @drop="onDrop(null)"
          :class="{ 'rail__droptail--over': overKey === '__tail__' }" />
        <p v-if="!g.items.length" class="rail__empty">—</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rail { background: var(--color-paper); border-right: 1px solid var(--color-hair); padding: 18px 14px; display: flex; flex-direction: column; gap: 20px; min-width: 0; }
.rail__hd { display: flex; align-items: center; gap: 7px; margin: 0 4px 8px; padding-bottom: 7px; border-bottom: 1px solid var(--color-hair); }
.rail__hdic { display: inline-flex; flex: none; color: color-mix(in srgb, var(--color-saffron) 55%, var(--color-saffron-ink)); }
.rail__hdl { flex: 1; min-width: 0; font-family: var(--font-mono); font-size: 10px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--color-saffron-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rail__add { height: 20px; width: 20px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--color-hair); background: var(--color-surface); border-radius: var(--radius-pill); color: var(--color-mute); cursor: pointer; flex: none; padding: 0; transition: background var(--t-fast), color var(--t-fast); }
.rail__add:hover { background: var(--color-paper-2); border-color: var(--color-hair); color: var(--color-ink); }
.rail__items { display: flex; flex-direction: column; gap: 1px; }
.rail__it { display: flex; align-items: center; gap: 6px; width: 100%; text-align: left; padding: 6.5px 10px; border: 0; border-radius: 6px; cursor: pointer; font-family: var(--font-sans); font-size: 12.5px; background: transparent; color: var(--color-ink-soft); font-weight: 500; }
.rail__it:hover { background: var(--color-paper-2); }
.rail__it--on { background: var(--color-saffron-soft); color: var(--color-saffron-ink); font-weight: 600; }
.rail__chev { display: inline-flex; flex: none; opacity: .7; cursor: pointer; transition: transform var(--t-fast); }
.rail__chev--folded { transform: rotate(-90deg); }
.rail__homeic { display: inline-flex; flex: none; opacity: .9; }
.rail__lbl { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rail__empty { margin: 0 0 0 10px; font-size: 12px; color: var(--color-faint); }
.rail__grip { display: inline-flex; flex: none; opacity: 0; cursor: grab; color: var(--color-faint); margin-left: -3px; transition: opacity var(--t-fast); }
.rail__it:hover .rail__grip { opacity: .6; }
.rail__it--drag { opacity: .45; }
/* 3 zones de drop : avant (filet haut) · après (filet bas) · imbriquer (contour plein). */
.rail__it--before { box-shadow: inset 0 2px 0 var(--color-saffron) !important; }
.rail__it--after { box-shadow: inset 0 -2px 0 var(--color-saffron) !important; }
.rail__it--inside { box-shadow: inset 0 0 0 2px var(--color-saffron) !important; border-radius: 6px; }
.rail__droptail { height: 6px; border-radius: 3px; margin: 1px 6px; }
.rail__droptail--over { background: var(--color-saffron-soft); box-shadow: inset 0 2px 0 var(--color-saffron); }
</style>
