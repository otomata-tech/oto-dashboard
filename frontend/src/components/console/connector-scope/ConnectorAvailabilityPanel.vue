<script setup lang="ts" generic="R">
// Panneau disponibilité du drawer unifié — 4 variantes selon le scope :
//  master (plateforme) / binary (org, team) : toggle on/off ·
//  exposure3 (user) : off/muted/live · readonly : statut hérité, sans contrôle.
import { computed } from 'vue'
import type { AvailabilityLever, ExposureState } from './adapter'
import Toggle from '@/components/console/Toggle.vue'
import Dot from '@/components/console/Dot.vue'

const props = defineProps<{ lever: AvailabilityLever<R>; row: R }>()
const s = computed(() => props.lever.state(props.row))
const canEdit = computed(() => props.lever.canEdit(props.row))
const EXPOSURE: ExposureState[] = ['off', 'muted', 'live']
const EXPOSURE_LABEL: Record<ExposureState, string> = { off: 'Non installé', muted: 'En veille', live: 'Actif' }
</script>

<template>
  <section class="cav">
    <h4 class="cav-h">{{ lever.title }}</h4>

    <div v-if="lever.variant === 'exposure3'" class="cav-seg">
      <button v-for="opt in EXPOSURE" :key="opt" type="button"
        class="cav-segbtn" :class="{ on: s.exposure === opt }" :disabled="!canEdit"
        @click="lever.set(row, opt)">{{ EXPOSURE_LABEL[opt] }}</button>
    </div>

    <div v-else class="cav-row">
      <span class="cav-state"><Dot :tone="s.tone" /> {{ s.label }}</span>
      <Toggle v-if="canEdit && lever.variant !== 'readonly'" :on="s.on" @change="lever.set(row, $event)" />
    </div>

    <p v-if="s.note" class="cav-note">{{ s.note }}</p>
  </section>
</template>

<style scoped>
.cav { padding: 16px 20px; border-bottom: 1px solid var(--color-hair); }
.cav-h { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--color-faint); margin-bottom: 10px; }
.cav-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.cav-state { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--color-ink); }
.cav-note { font-size: 11.5px; color: var(--color-faint); margin-top: 8px; }
.cav-seg { display: inline-flex; border: 1px solid var(--color-hair-classic); border-radius: var(--radius-pill); overflow: hidden; }
.cav-segbtn { font-size: 12px; padding: 5px 14px; border: 0; background: transparent; color: var(--color-mute); cursor: pointer; }
.cav-segbtn.on { background: var(--color-ink); color: var(--color-surface); font-weight: 600; }
.cav-segbtn:disabled { cursor: default; opacity: .6; }
</style>
