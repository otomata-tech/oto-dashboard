<script setup lang="ts">
// Cockpit connecteurs PLATEFORME (/platform/connectors, ADR 0022) — wrapper mince :
// la coquille unifiée `ConnectorScopeView` (scope=platform : master switch + clé
// plateforme) + les cartes propres au scope (ordre de résolution + audit des sièges
// unipile, super_admin). Les leviers vivent dans `usePlatformAdapter`.
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Btn from '@/components/console/Btn.vue'
import ConnectorScopeView from '@/components/console/connector-scope/ConnectorScopeView.vue'
import { useMe } from '@/composables/useMe'
import { getUnipilePlatformSeats, releaseUnipileSeat } from '@/api/console'
import type { UnipileSeat } from '@/types/api'

const { me } = useMe()
const isSuperAdmin = computed(() => me.value?.role === 'super_admin')
const seats = ref<UnipileSeat[]>([])
const seatsConfigured = ref(false)
const orphanCount = computed(() => seats.value.filter((s) => s.state === 'orphan').length)
// Un siège déconnecté se paie AUSSI : c'est le vrai gisement d'économies.
const reclaimable = computed(() => seats.value.filter((s) => s.state !== 'bound').length)

const confirming = ref<string | null>(null)   // account_id en attente de confirmation
const busy = ref<string | null>(null)         // account_id en cours de libération
const error = ref('')

const STATE_LABEL: Record<UnipileSeat['state'], string> = {
  bound: 'en service',
  disconnected: 'déconnecté',
  orphan: 'orphelin',
}

onMounted(async () => {
  // Sièges de la clé plateforme unipile — réservé super_admin (révèle l'ownership
  // cross-user) ; best-effort, la carte se masque sans clé plateforme.
  if (!isSuperAdmin.value) return
  try {
    const s = await getUnipilePlatformSeats()
    seats.value = s.seats
    seatsConfigured.value = s.configured
  } catch { /* pas de clé plateforme ou 403 → carte masquée */ }
})

async function release(seat: UnipileSeat) {
  error.value = ''
  busy.value = seat.account_id
  try {
    await releaseUnipileSeat(seat.account_id)
    seats.value = seats.value.filter((s) => s.account_id !== seat.account_id)
    confirming.value = null
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <div class="content-inner fadein">
    <ConnectorScopeView />

    <ConsoleCard title="ordre de résolution">
      <div class="helptext" style="font-size: 12.5px">
        quand un outil a besoin d'une clé : <strong>clé perso</strong> → <strong>clé partagée d'org</strong> →
        <strong>prêt plateforme</strong> (sous quota) → interdit. sans clé ni prêt = pas d'accès tant qu'une clé n'est pas posée.
        le prêt d'une clé plateforme se fait depuis la fiche de l'utilisateur, dans « utilisateurs ».
      </div>
    </ConsoleCard>

    <ConsoleCard v-if="isSuperAdmin && seatsConfigured" title="clé plateforme unipile · sièges"
      :sub="`comptes vivant sur l'instance unipile partagée, réconciliés avec leurs bindings oto. un siège se paie ~5 €/mois tant qu'il EXISTE ici — se déconnecter côté oto ne le rend pas.${reclaimable ? ` ${reclaimable} à récupérer, dont ${orphanCount} sans propriétaire.` : ''}`">
      <p v-if="error" class="dim-note" style="color: var(--color-terra-ink)">{{ error }}</p>
      <table class="tbl">
        <thead><tr><th>compte</th><th>canal</th><th>propriétaire</th><th>statut</th><th></th></tr></thead>
        <tbody>
          <tr v-for="s in seats" :key="s.account_id">
            <td>
              <div style="font-weight: 600; color: var(--color-ink)">{{ s.name || '—' }}</div>
              <code class="mono" style="font-size: 11px; color: var(--color-faint)">{{ s.account_id }}</code>
            </td>
            <td style="font-size: 12px">{{ (s.provider || s.type || '').toLowerCase() }}</td>
            <td>
              <div style="font-size: 12.5px"
                :style="{ color: s.state === 'bound' ? 'var(--color-ink)' : 'var(--color-terra-ink)' }">
                {{ s.owner_email || 'aucun compte oto' }}
              </div>
              <div class="dim" style="font-size: 11px">
                {{ STATE_LABEL[s.state] }}<template v-if="s.org_name"> · {{ s.org_name }}</template>
              </div>
            </td>
            <td style="font-size: 11px"
              :style="{ color: s.status && s.status.toUpperCase() === 'OK' ? 'var(--color-ink)' : 'var(--color-terra-ink)' }">
              {{ s.status }}
            </td>
            <td style="text-align: right; white-space: nowrap">
              <!-- Un siège en service ne se libère pas d'ici : ce serait couper LinkedIn
                   à quelqu'un qui s'en sert (le backend le refuse aussi). -->
              <template v-if="s.state !== 'bound'">
                <template v-if="confirming === s.account_id">
                  <span class="dim-note">libérer ? irréversible</span>
                  <Btn kind="danger" :disabled="busy === s.account_id" @click="release(s)">Oui</Btn>
                  <Btn kind="mini" :disabled="busy === s.account_id" @click="confirming = null">Non</Btn>
                </template>
                <Btn v-else kind="mini" :disabled="!!busy" @click="confirming = s.account_id">
                  Libérer le siège
                </Btn>
              </template>
            </td>
          </tr>
          <tr v-if="!seats.length">
            <td colspan="5" class="dim" style="text-align: center; padding: 16px">aucun compte sur l'instance plateforme</td>
          </tr>
        </tbody>
      </table>
    </ConsoleCard>
  </div>
</template>
