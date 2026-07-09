<script setup lang="ts">
// Funnel d'activation (COMPTE ≠ USAGE) — carte réutilisable. Prend son funnel + la
// fenêtre par prop ; ne fetch rien. À l'échelle plateforme aujourd'hui, prête à être
// branchée org/équipe/user quand le backend scope les agrégats.
import { computed } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Stat from '@/components/console/Stat.vue'
import type { ActivationFunnel } from '@/types/api'

const props = defineProps<{
  funnel: ActivationFunnel | null
  windowDays: number
  loading?: boolean
  title?: string
  sub?: string
}>()

const f = computed(() => props.funnel)
</script>

<template>
  <ConsoleCard :title="title || 'activation funnel'"
    :sub="sub || 'un compte ≠ un usage : ces chiffres séparent « inscrit » de « a réellement invoqué un outil ».'">
    <div v-if="loading && !f" class="grid3">
      <div v-for="i in 5" :key="i" class="sk" style="height: 74px" />
    </div>
    <div v-else class="grid3">
      <Stat label="accounts" :value="f?.total_accounts ?? 0" sub="total signed up" />
      <Stat label="active" :value="f?.active ?? 0" :sub="`invoked a tool · ${windowDays}d`"
        :tone="f && f.active ? 'var(--color-olive-ink)' : undefined" />
      <Stat label="never active" :value="f?.never_active ?? 0" sub="0 tool calls ever"
        :tone="f && f.never_active ? 'var(--color-terra-ink)' : undefined" />
      <Stat label="idle (rest only)" :value="f?.rest_only ?? 0" sub="opened, never invoked" />
      <Stat label="blocked" :value="f?.blocked_by_connector ?? 0" :sub="`connector failures · ${windowDays}d`"
        :tone="f && f.blocked_by_connector ? 'var(--color-terra-ink)' : undefined" />
    </div>
  </ConsoleCard>
</template>
