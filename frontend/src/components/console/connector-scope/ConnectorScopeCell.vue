<script setup lang="ts">
// Rend un `CellVM` (dot + tag + label + sous-ligne) d'une colonne de la liste
// unifiée — évite toute logique par-scope dans le template de ligne.
import type { CellVM } from './adapter'
import Dot from '@/components/console/Dot.vue'
import Tag from '@/components/console/Tag.vue'

defineProps<{ vm?: CellVM }>()
</script>

<template>
  <template v-if="vm">
    <span v-if="vm.bar" class="csc-bar-wrap">
      <span class="csc-bar"><i :style="{ width: vm.bar.pct + '%' }"></i></span>
      <span v-if="vm.sub" class="mono csc-barnum">{{ vm.sub }}</span>
    </span>
    <template v-else>
      <span class="csc" :class="{ dim: vm.muted }">
        <Dot v-if="vm.dot" :tone="vm.dot" />
        <Tag v-if="vm.tag" :tone="vm.tag.tone">{{ vm.tag.text }}</Tag>
        <span v-if="vm.label">{{ vm.label }}</span>
      </span>
      <div v-if="vm.sub" class="csc-sub">{{ vm.sub }}</div>
    </template>
  </template>
</template>

<style scoped>
.csc { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; color: var(--color-ink-soft); }
.csc.dim { color: var(--color-faint); font-size: 11.5px; }
.csc-sub { font-size: 11px; color: var(--color-faint); margin-top: 2px; }
.csc-bar-wrap { display: flex; align-items: center; gap: 9px; }
.csc-bar { height: 5px; width: 62px; border-radius: 999px; background: var(--color-hair-soft); overflow: hidden; display: inline-block; flex: none; }
.csc-bar > i { display: block; height: 100%; border-radius: 999px; background: var(--color-olive); }
.csc-barnum { font-size: 11px; color: var(--color-mute); }
</style>
