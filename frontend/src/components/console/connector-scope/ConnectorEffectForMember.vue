<script setup lang="ts">
// M4 (CDC connecteurs) : « Effet pour : [membre] » — un org admin choisit un membre et
// voit COMMENT ce connecteur RÉSOUT pour lui (sa clé, la clé d'org, KO, à connecter…).
// Le backend rejoue `status_for(membre, org)` (ADR 0023 : org explicite) ; on en dérive
// une ligne lisible (la résolution de credential — pas l'état d'installation, absent du
// statut). Réservé au scope ORG (monté par le drawer).
import { computed, onMounted, ref } from 'vue'
import Dot from '@/components/console/Dot.vue'
import OtoSelect from '@/components/console/OtoSelect.vue'
import { useMe } from '@/composables/useMe'
import { useToast } from '@/composables/useToast'
import { getOrg, getConnectorEffectForMember } from '@/api/console'
import { humanize } from '@/lib/errors'
import type { OrgMember, ProviderStatus } from '@/types/api'
import type { DotTone } from '@/lib/consoleTypes'

const props = defineProps<{ connector: string }>()
const { me } = useMe()
const { toast } = useToast()

const members = ref<OrgMember[]>([])
const memberSub = ref('')
const status = ref<ProviderStatus | null>(null)
const loading = ref(false)

const memberOpts = computed(() => members.value.map((m) => ({ value: m.sub, label: m.name || m.email || m.sub })))

onMounted(async () => {
  const org = me.value?.active_org
  if (org == null) return
  try { members.value = (await getOrg(org)).members ?? [] } catch { /* best-effort */ }
})

async function pick(sub: string) {
  memberSub.value = sub
  status.value = null
  if (!sub) return
  loading.value = true
  try {
    status.value = (await getConnectorEffectForMember(props.connector, sub)).status
  } catch (e) { toast(humanize(e)) } finally { loading.value = false }
}

// Ligne de résolution dérivée du ProviderStatus (le cœur du « effet pour ce membre »).
const line = computed<{ dot: DotTone; text: string }>(() => {
  const st = status.value
  if (!st || st.mode === 'forbidden' || !st.mode) {
    return { dot: 'saffron', text: 'Aucune clé ne résout — réservé, ou à connecter par le membre.' }
  }
  if (st.health_ko) return { dot: 'terra', text: st.health_reason ? `Connexion KO — ${st.health_reason}` : 'Connexion KO.' }
  if (st.pending_action) return { dot: 'saffron', text: st.pending_action }
  if (st.mode === 'over_quota') return { dot: 'saffron', text: 'Quota du jour atteint sur la clé oto.' }
  const src = st.mode === 'user' ? 'sa propre clé'
    : st.mode === 'group' ? "une clé d'équipe"
    : st.mode === 'org' ? "la clé de l'org"
    : "la clé oto"
  return { dot: 'olive', text: `Prêt — résout via ${src}.` }
})
</script>

<template>
  <div class="efm">
    <div class="efm-row">
      <span class="efm-lbl">Effet pour :</span>
      <OtoSelect :model-value="memberSub" :options="memberOpts" placeholder="choisir un membre…"
        aria-label="membre" size="sm" grow @update:model-value="pick" />
    </div>
    <div v-if="loading" class="efm-line dim">résolution…</div>
    <div v-else-if="memberSub" class="efm-line">
      <Dot :tone="line.dot" /> <span>{{ line.text }}</span>
    </div>
    <p class="efm-hint">Ce que ce membre obtient de ce connecteur (résolution de sa clé) — vue admin, lecture seule.</p>
  </div>
</template>

<style scoped>
.efm { padding: 16px 20px; }
.efm-row { display: flex; align-items: center; gap: 8px; }
.efm-lbl { font-size: 13px; font-weight: 600; color: var(--color-ink); flex: none; }
.efm-line { display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 13px; color: var(--color-ink); }
.efm-hint { font-size: 11px; color: var(--color-faint); margin: 8px 0 0; }
.dim { color: var(--color-faint); }
</style>
