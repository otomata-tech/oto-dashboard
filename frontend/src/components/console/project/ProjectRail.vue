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
const emit = defineEmits<{ select: [RailItem]; add: [RailGroup['addKind']] }>()

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
          :class="{ 'rail__it--on': isSel(it) }"
          :style="{ paddingLeft: (10 + (it.pad ?? 0) * 15) + 'px', boxShadow: edge(it) }"
          :title="it.hint || undefined"
          @click="emit('select', it)">
          <span v-if="hasKids(g, it)" class="rail__chev" :class="{ 'rail__chev--folded': collapsed.has(it.key) }"
            title="Déplier / replier" @click.stop="toggle(it.key)"><Icon name="chevd" :size="12" /></span>
          <span v-if="it.home" class="rail__homeic"><Icon name="house" :size="13" /></span>
          <span class="rail__lbl">{{ it.label }}</span>
          <Tag v-if="it.railTag" :tone="it.railTag.tone">{{ it.railTag.label }}</Tag>
        </button>
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
</style>
