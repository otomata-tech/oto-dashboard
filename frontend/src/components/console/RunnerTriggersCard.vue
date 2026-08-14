<script setup lang="ts">
// Déclencheurs programmés du runner — quelle procédure part quand, et le
// robinet enabled. La CRÉATION passe par l'agent (`oto_trigger`) : cette carte
// surveille et coupe/rouvre, elle ne fabrique pas — configurer un cron est un
// dialogue, pas un formulaire.
import { onMounted, ref } from 'vue'
import ConsoleCard from './ConsoleCard.vue'
import Tag from './Tag.vue'
import Toggle from './Toggle.vue'
import { listRunnerTriggers, setRunnerTriggerEnabled } from '@/api/console'
import type { RunnerTrigger } from '@/api/console'
import { humanize } from '@/lib/errors'
import { absDate } from '@/lib/cellRender'

const triggers = ref<RunnerTrigger[]>([])
const loaded = ref(false)
const error = ref<string | null>(null)
const busy = ref<number | null>(null)

async function load() {
  try {
    triggers.value = (await listRunnerTriggers()).triggers
  } catch (e) {
    error.value = humanize(e)
  } finally {
    loaded.value = true
  }
}

async function toggle(t: RunnerTrigger) {
  busy.value = t.id
  try {
    const { trigger } = await setRunnerTriggerEnabled(t.id, !t.enabled)
    Object.assign(t, trigger)
  } catch (e) {
    error.value = humanize(e)
  } finally {
    busy.value = null
  }
}

onMounted(load)
</script>

<template>
  <ConsoleCard
    title="Déclencheurs programmés"
    sub="Les procédures qui partent toutes seules, à heure fixe — et leur robinet."
  >
    <div class="card-body">
      <p v-if="error" class="rt-err">{{ error }}</p>
      <p v-else-if="loaded && !triggers.length" class="dim rt-empty">
        Aucun déclencheur. Demande à ton agent d'en créer un
        (« déclenche la procédure X tous les jours à 8 h ») — il utilisera
        <code>oto_trigger</code>.
      </p>
      <ul v-else class="rt-list">
        <li v-for="t in triggers" :key="t.id" class="rt-item">
          <Toggle :on="t.enabled" :disabled="busy === t.id" @click="toggle(t)" />
          <span class="rt-name">{{ t.label || t.procedure }}</span>
          <span class="rt-cron">{{ t.cron }} · {{ t.tz }}</span>
          <Tag v-if="!t.enabled" tone="ink">coupé</Tag>
          <span v-else-if="t.next_due" class="rt-next">
            prochain : {{ absDate(t.next_due) }}</span>
        </li>
      </ul>
    </div>
  </ConsoleCard>
</template>

<style scoped>
.rt-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.rt-item { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 12.5px; }
.rt-name { font-weight: 600; color: var(--color-ink); }
.rt-cron { font-family: var(--font-mono, monospace); font-size: 11.5px; color: var(--color-mute); }
.rt-next { font-size: 11.5px; color: var(--color-faint); }
.rt-err { font-size: 12px; color: var(--color-terra, #a8442a); }
.rt-empty { font-size: 13px; line-height: 1.6; }
</style>
