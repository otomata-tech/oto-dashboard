<script setup lang="ts">
// Signaux BRUTS d'un agrégat déplié (drill-down de SignalAggCard) : chaque ligne =
// une remontée datée et attribuée, dont le `body` est le détail écrit par l'agent
// (ou l'humain). Extrait de UsageView avec la carte qu'il complète.
import type { UsageSignal } from '@/types/api'

defineProps<{ rows: UsageSignal[] }>()

const fmt = (ts: string | null) => (ts ? ts.replace('T', ' ').slice(0, 16) : '—')
// Rapporteur : email > sub > source (un agent anonyme n'a que sa source).
const who = (s: UsageSignal) => s.email || s.sub || s.source
</script>

<template>
  <div v-for="(s, i) in rows" :key="i"
    style="padding: 8px 12px; border-top: 1px solid var(--color-hair-soft)">
    <div class="dim" style="font-size: 11px">{{ fmt(s.created_at) }} · {{ who(s) }}</div>
    <div style="font-size: 12.5px; white-space: pre-wrap">{{ s.body || '—' }}</div>
  </div>
  <div v-if="!rows.length" class="dim" style="padding: 12px">chargement…</div>
</template>
