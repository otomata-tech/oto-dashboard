<script setup lang="ts">
// VerdictLine (CDC lot 2, composant §5 · principes 1 & 6 « disclosure inversée »).
// Forme PRIMAIRE = 1 dot + la phrase de verdict en langage clair (réutilise la même
// dérivation que la liste, `connectorVerdict`). Le diagnostic technique (pastilles
// disponibilité · connexion · option) devient un DÉPLIABLE « Pourquoi ? » — plus la
// forme par défaut. La pastille « option » n'existe que pour les connecteurs à option.
import { computed, ref } from 'vue'
import Dot from '@/components/console/Dot.vue'
import { useMe } from '@/composables/useMe'
import { connectorVerdict } from '@/lib/connectorVerdict'
import type { MyConnector } from '@/types/api'
import type { DotTone } from '@/lib/consoleTypes'

const props = defineProps<{ connector: MyConnector }>()
const { me } = useMe()
const c = computed(() => props.connector)
const status = computed(() => me.value?.providers?.[c.value.name])

const verdict = computed(() => connectorVerdict(c.value, status.value))

// Diagnostic 3 couches (déplié) — la décomposition technique derrière le verdict.
const isOpenData = computed(() => c.value.auth.method === 'none')
const mode = computed(() => status.value?.mode)
const resolves = computed(() => isOpenData.value || (!!mode.value && mode.value !== 'forbidden'))
const source = computed(() => {
  if (isOpenData.value) return 'open data'
  switch (mode.value) {
    case 'user': return 'ta clé'
    case 'group': return 'clé d’équipe'
    case 'org': return 'clé d’org'
    case 'platform': return 'clé oto'
    default: return ''
  }
})
const optionRequired = computed(() => c.value.paid_option ?? null)
const optionOk = computed(() => c.value.option_ok !== false)
const connTone = computed<DotTone>(() => (isOpenData.value ? 'faint' : resolves.value ? 'olive' : 'saffron'))
const optTone = computed<DotTone>(() => (!optionRequired.value ? 'faint' : optionOk.value ? 'olive' : 'saffron'))

const why = ref(false)
</script>

<template>
  <div class="vl">
    <div class="vl-head">
      <Dot :tone="verdict.dot" />
      <span class="vl-phrase" :class="verdict.dot">{{ verdict.phrase }}</span>
    </div>
    <button class="vl-why" @click="why = !why">{{ why ? 'Masquer' : 'Pourquoi ?' }}</button>

    <div v-if="why" class="vl-diag">
      <span class="spill"><Dot tone="olive" />disponibilité</span>
      <span class="spill"><Dot :tone="connTone" />connexion<span v-if="source" class="dim"> · {{ source }}</span></span>
      <span class="spill">
        <Dot :tone="optTone" />option<span v-if="!optionRequired" class="dim"> · n/a</span>
        <span v-else class="dim"> · {{ optionRequired }}</span>
      </span>
    </div>
  </div>
</template>

<style scoped>
.vl-head { display: flex; align-items: center; gap: 8px; }
.vl-phrase { font-size: 13px; font-weight: 600; }
.vl-phrase.olive { color: var(--color-olive-ink); }
.vl-phrase.saffron { color: var(--color-saffron-ink); }
.vl-phrase.terra { color: var(--color-terra-ink); }
.vl-phrase.faint { color: var(--color-mute); }
.vl-why { margin-top: 7px; background: none; border: none; padding: 0; cursor: pointer;
  color: var(--color-cobalt-ink); font-weight: 600; font-size: 12px; font-family: inherit; }
.vl-why:hover { text-decoration: underline; }
.vl-diag { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 11px; }
.spill { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 600; color: var(--color-ink); }
.dim { color: var(--color-faint); font-weight: 500; }
</style>
