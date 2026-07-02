<script setup lang="ts">
import { computed } from 'vue'
import type { InstructionUsage } from '@/types/api'

const props = defineProps<{ usage: InstructionUsage | null; loading: boolean }>()

// Hauteur de barre normalisée au max de la série (sparkline 30 j).
const bars = computed(() => {
  const s = props.usage?.series ?? []
  const max = Math.max(1, ...s)
  return s.map((v) => ({
    h: `${Math.round(6 + (v / max) * 34)}px`,
    color: v > 0 ? 'var(--color-olive)' : 'var(--color-hair)',
  }))
})
const callersLabel = computed(() => {
  const c = props.usage?.callers ?? []
  if (!c.length) return '—'
  return c.slice(0, 3).join(' · ') + (c.length > 3 ? ` +${c.length - 3}` : '')
})
</script>

<template>
  <div class="card">
    <span class="eyebrow">usage · ce process</span>

    <div v-if="loading" class="skeleton" />
    <template v-else>
      <div class="count">
        <div class="n">{{ usage?.count ?? 0 }}</div>
        <div class="u">chargements</div>
      </div>
      <div v-if="usage && usage.count > 0" class="spark">
        <div v-for="(b, i) in bars" :key="i" class="bar" :style="{ height: b.h, background: b.color }" />
      </div>
      <div v-else class="empty">jamais chargée sur les 30 derniers jours — l'agent la tire via <code>oto_get_doctrine</code>.</div>
      <div class="foot">
        <span>30 derniers jours</span><span>par {{ callersLabel }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.card { background: var(--color-surface); border: 1px solid var(--color-hair); border-radius: 14px; padding: 16px 17px; }
.eyebrow { font-family: var(--font-mono); font-size: 10px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: var(--color-mute); }
.count { display: flex; align-items: flex-end; gap: 6px; margin-top: 9px; }
.n { font-size: 27px; font-weight: 700; letter-spacing: -0.03em; line-height: 1; color: var(--color-ink); }
.u { font-size: 12px; color: var(--color-mute); padding-bottom: 3px; }
.spark { display: flex; align-items: flex-end; gap: 2px; height: 40px; margin-top: 13px; }
.bar { flex: 1; border-radius: 1.5px; min-width: 0; }
.empty { margin-top: 11px; font-size: 11.5px; color: var(--color-faint); line-height: 1.45; }
.empty code { font-family: var(--font-mono); font-size: 10.5px; }
.foot {
  display: flex; justify-content: space-between; font-family: var(--font-mono); font-size: 9px;
  letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-faint); margin-top: 6px;
}
.skeleton {
  height: 86px; margin-top: 10px; border-radius: 8px;
  background: var(--color-paper-2); animation: oto-pulse 1.4s ease-in-out infinite;
}
</style>
