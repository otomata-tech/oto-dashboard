<script setup lang="ts">
// Carte connecteur — projection PLATEFORME (ADR 0022 §plateforme, ADR 0024 §3).
// MÊME shell visuel que les cartes user (`ConnectorCard`) et org (`ConnectorOrgCard`) ;
// le corps porte les leviers plateforme : master switch d'activation (deny-by-default,
// dans l'en-tête — le pendant du sélecteur 3 états de la carte user) + clé(s)
// plateforme (studio-owned, mutation réservée super_admin). Présentation pure :
// les actions remontent à la vue (qui détient fetch + reload + dialogs).
import { computed } from 'vue'
import ConnectorCardShell from './ConnectorCardShell.vue'
import ConnectorBadges from './ConnectorBadges.vue'
import Toggle from './Toggle.vue'
import Btn from './Btn.vue'
import type { ConnectorActivation, ConnectorMeta, PlatformKey } from '@/types/api'

const props = defineProps<{
  activation: ConnectorActivation
  meta?: ConnectorMeta
  keys: PlatformKey[]        // clés plateforme de CE connecteur
  isSuperAdmin: boolean
}>()
const emit = defineEmits<{
  (e: 'toggle'): void
  (e: 'set-key'): void
  (e: 'remove-key', k: PlatformKey): void
}>()

const c = computed(() => props.activation)
const subtitle = computed(() =>
  [props.meta?.publisher, c.value.help].filter(Boolean).join(' · '))
// Un connecteur porte une clé plateforme ssi son provider est platform-éligible
// (auth_modes inclut 'platform') — les byo-only la refuseraient.
const platformEligible = computed(() => !!props.meta?.auth_modes?.includes('platform'))
// Fiche de présentation (marketplace) — même geste que les cartes user/org.
const ficheTo = computed(() =>
  `/connectors?tab=marketplace&connector=${encodeURIComponent(c.value.connector)}`)
</script>

<template>
  <ConnectorCardShell :label="c.label" :logo-url="meta?.logo_url" :subtitle="subtitle"
    :off="c.enabled !== true" :to="ficheTo">
    <!-- Badges CANONIQUES — même vocabulaire que les projections user/org. -->
    <template #badges><ConnectorBadges :meta="meta" /></template>
    <template #header-right>
      <!-- Master switch : ce que la plateforme autorise (effet au prochain restart). -->
      <div class="ac-master">
        <span class="ac-state" :class="{ on: c.enabled === true }">{{ c.enabled ? 'active' : 'off' }}</span>
        <Toggle :on="c.enabled === true" @change="emit('toggle')" />
      </div>
    </template>

    <div class="ac-row">
      <div class="ac-field">
        <span class="ac-label">clé plateforme</span>
        <span class="ac-help">clé studio, prêtée aux users via grants (quota/jour)</span>
        <div class="ac-keys">
          <template v-if="platformEligible">
            <span v-for="k in keys" :key="k.id" class="ac-pk">
              <code class="mono">{{ k.label }} …{{ k.api_key_tail }}</code>
              <button v-if="isSuperAdmin" class="ac-pk-x" title="supprimer"
                @click="emit('remove-key', k)">×</button>
            </span>
            <Btn v-if="isSuperAdmin" kind="mini" icon="plus" @click="emit('set-key')">Key</Btn>
            <span v-else-if="!keys.length" class="dim" style="font-size: 11.5px">aucune</span>
          </template>
          <span v-else class="dim" style="font-size: 11.5px">byo-only — chaque membre/org pose sa clé</span>
        </div>
      </div>
      <div class="ac-field">
        <span class="ac-label">namespaces</span>
        <span class="ac-help">préfixes des outils exposés</span>
        <code class="mono ac-ns">{{ c.namespaces.join(', ') }}</code>
      </div>
    </div>
  </ConnectorCardShell>
</template>

<style scoped>
/* Le chrome vit dans ConnectorCardShell. Ici : le corps plateforme — mêmes
   patrons de champs que la carte org (oclabel/ochelp) pour une lecture identique. */
.ac-master { display: inline-flex; align-items: center; gap: 8px; flex: 0 0 auto; }
.ac-state { font-size: 11px; font-weight: 600; color: var(--color-faint); }
.ac-state.on { color: var(--color-ink); }
.ac-row { display: flex; gap: 28px; flex-wrap: wrap; align-items: flex-start; padding: 4px 0 2px; }
.ac-field { display: flex; flex-direction: column; gap: 4px; }
.ac-label { font-size: 11px; font-weight: 600; color: var(--color-mute); text-transform: uppercase; letter-spacing: 0.04em; }
.ac-help { font-size: 11px; color: var(--color-faint); margin-top: -2px; max-width: 36ch; line-height: 1.35; }
.ac-keys { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-height: 22px; }
.ac-pk { display: inline-flex; align-items: center; gap: 3px; font-size: 12px; }
.ac-pk-x { border: 0; background: none; cursor: pointer; color: var(--color-terra-ink); font-size: 14px; line-height: 1; padding: 0 2px; }
.ac-ns { font-size: 11.5px; color: var(--color-ink-soft); }
</style>
