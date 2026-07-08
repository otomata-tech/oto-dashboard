<script setup lang="ts">
// Cockpit connecteurs PLATEFORME (/platform/connectors, ADR 0022) — wrapper mince :
// la coquille unifiée `ConnectorScopeView` (scope=platform : master switch + clé
// plateforme) + les cartes propres au scope (ordre de résolution + audit des sièges
// unipile, super_admin). Les leviers vivent dans `usePlatformAdapter`.
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import ConnectorScopeView from '@/components/console/connector-scope/ConnectorScopeView.vue'
import { useMe } from '@/composables/useMe'
import { getUnipilePlatformSeats } from '@/api/console'
import type { UnipileSeat } from '@/types/api'

const { me } = useMe()
const isSuperAdmin = computed(() => me.value?.role === 'super_admin')
const seats = ref<UnipileSeat[]>([])
const seatsConfigured = ref(false)
const orphanCount = computed(() => seats.value.filter((s) => s.orphan).length)

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
</script>

<template>
  <div class="content-inner fadein">
    <ConnectorScopeView />

    <ConsoleCard title="resolution order">
      <div class="helptext" style="font-size: 12.5px">
        when a tool needs a key: <strong>user key</strong> → <strong>org shared key</strong> →
        <strong>platform grant</strong> (quota-metered) → forbidden. no key and no grant = no access until one is set.
        grant a platform key to a user from their fiche in « users ».
      </div>
    </ConsoleCard>

    <ConsoleCard v-if="isSuperAdmin && seatsConfigured" title="unipile platform key · seats"
      :sub="`accounts living on the shared unipile instance, reconciled with their oto owner. an orphan account belongs to no oto user (a churned user) and still bills ~€5/mo.${orphanCount ? ` ${orphanCount} orphan(s).` : ''}`">
      <table class="tbl">
        <thead><tr><th>account</th><th>channel</th><th>owner</th><th>status</th></tr></thead>
        <tbody>
          <tr v-for="s in seats" :key="s.account_id">
            <td>
              <div style="font-weight: 600; color: var(--color-ink)">{{ s.name || '—' }}</div>
              <code class="mono" style="font-size: 11px; color: var(--color-faint)">{{ s.account_id }}</code>
            </td>
            <td style="font-size: 12px">{{ (s.type || '').toLowerCase() }}</td>
            <td>
              <template v-if="s.orphan">
                <span style="font-weight: 600; color: var(--color-terra-ink)">orphan</span>
                <span class="dim" style="font-size: 11px"> · no oto user</span>
              </template>
              <template v-else>
                <div style="font-size: 12.5px; color: var(--color-ink)">{{ s.owner_email }}</div>
                <div v-if="s.org_name" class="dim" style="font-size: 11px">{{ s.org_name }}</div>
              </template>
            </td>
            <td style="font-size: 11px"
              :style="{ color: s.status && s.status.toUpperCase() === 'OK' ? 'var(--color-ink)' : 'var(--color-terra-ink)' }">
              {{ s.status }}
            </td>
          </tr>
          <tr v-if="!seats.length">
            <td colspan="4" class="dim" style="text-align: center; padding: 16px">no accounts on the platform instance</td>
          </tr>
        </tbody>
      </table>
    </ConsoleCard>
  </div>
</template>
