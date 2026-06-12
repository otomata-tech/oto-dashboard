<script setup lang="ts">
import { onMounted, ref } from 'vue'
import ConnectorCard from '@/components/ConnectorCard.vue'
import { api } from '@/api'
import type { ConnectorMeta, Me } from '@/types/api'

const connectors = ref<ConnectorMeta[]>([])
const me = ref<Me | null>(null)
const error = ref<string | null>(null)

async function load() {
  try {
    // Ordre du registre préservé (ne jamais trier — il pilote status_for).
    const [cat, m] = await Promise.all([
      api<{ connectors: ConnectorMeta[] }>('/api/connectors'),
      api<Me>('/api/me'),
    ])
    connectors.value = cat.connectors
    me.value = m
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

function sessionConfigured(c: ConnectorMeta): boolean | undefined {
  if (!c.personal_session || !me.value) return undefined
  if (c.name === 'linkedin') return me.value.linkedin.configured
  if (c.name === 'crunchbase') return me.value.crunchbase.configured
  return undefined
}

onMounted(load)
</script>

<template>
  <main class="min-h-screen bg-background p-8">
    <div class="max-w-3xl mx-auto space-y-6">
      <header>
        <h1 class="text-2xl font-semibold">connecteurs</h1>
        <p class="text-sm text-muted-foreground">
          le catalogue est dérivé du registre serveur — source unique, rien en dur ici.
        </p>
      </header>

      <p v-if="error" class="text-sm text-destructive">{{ error }}</p>

      <div class="grid gap-3 sm:grid-cols-2">
        <ConnectorCard
          v-for="c in connectors"
          :key="c.name"
          :connector="c"
          :status="me?.providers[c.name]"
          :session-configured="sessionConfigured(c)"
          @changed="load"
        />
      </div>
    </div>
  </main>
</template>
