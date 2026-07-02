<script setup lang="ts">
// Connecteurs PARTAGÉS (onglet « partagés » de /connectors) — lentille de
// CONSOMMATION, lecture seule : les connecteurs que je peux utiliser sans poser
// ma propre clé, parce que mon org ou mon équipe en fournit une (clé partagée).
// Dérivé sans fetch dédié : `me.providers[name].mode ∈ {org, group}` = la cascade
// de résolution (user > group > org > platform) tombe sur une clé partagée.
// La GESTION (connecter/masquer/outils) reste dans l'onglet « mes connecteurs ».
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Tag from '@/components/console/Tag.vue'
import ConnectorCardShell from '@/components/console/ConnectorCardShell.vue'
import ConnectorBadges from '@/components/console/ConnectorBadges.vue'
import { useMe } from '@/composables/useMe'
import { getMyConnectors } from '@/api/console'
import type { MyConnector, ConnectorState } from '@/types/api'
import { humanize } from '@/lib/errors'

const router = useRouter()
const { me } = useMe()

const catalog = ref<MyConnector[]>([])
const loaded = ref(false)
const error = ref<string | null>(null)

async function load() {
  try { catalog.value = (await getMyConnectors()).connectors }
  catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
}
onMounted(load)

// mode de résolution effectif du connecteur (clé qui gagne la cascade).
const modeOf = (name: string) => me.value?.providers?.[name]?.mode
// Partagé = résolu par une clé d'org ou d'équipe (pas ma clé perso, pas la plateforme).
const shared = computed(() =>
  catalog.value
    .filter((c) => { const m = modeOf(c.name); return m === 'org' || m === 'group' })
    .sort((a, b) => a.label.localeCompare(b.label)))

const SOURCE_LABEL: Record<string, string> = {
  org: `la clé de ${me.value?.active_org_name || 'ton org'}`,
  group: `la clé de ton équipe${me.value?.active_group_name ? ` (${me.value.active_group_name})` : ''}`,
}
const sourceLabel = (name: string) => SOURCE_LABEL[modeOf(name) ?? ''] ?? 'une clé partagée'

const STATE_LABEL: Record<ConnectorState, string> = {
  active: 'actif', paused: 'masqué', not_selected: 'non installé',
}
// Fiche de présentation (marketplace) — même geste que les cartes user/org/plateforme.
const ficheTo = (c: MyConnector) =>
  `/connectors?tab=marketplace&connector=${encodeURIComponent(c.name)}`
</script>

<template>
  <div class="content-inner">
    <ConsoleCard title="connecteurs partagés"
      sub="ce que tu peux utiliser sans poser ta propre clé — fourni par ton organisation ou ton équipe. ta clé perso, si tu en ajoutes une, prime toujours.">
      <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

      <!-- Tuiles = MÊME shell que les cartes user/org/plateforme (ADR 0024 §3) ;
           badges canoniques ; le nom mène à la fiche marketplace. -->
      <div v-if="loaded && shared.length" class="grid3">
        <ConnectorCardShell v-for="c in shared" :key="c.name"
          :label="c.label" :logo-url="c.logo_url" :subtitle="c.publisher"
          fill :to="ficheTo(c)">
          <template #header-right>
            <Tag :tone="modeOf(c.name) === 'group' ? 'cobalt' : 'olive'">
              {{ modeOf(c.name) === 'group' ? 'team key' : 'org key' }}
            </Tag>
          </template>
          <p class="sh-help">{{ c.help || '—' }}</p>
          <div class="sh-tags"><ConnectorBadges :meta="c" /></div>
          <div class="sh-foot">
            <span class="sh-src">résolu par <strong>{{ sourceLabel(c.name) }}</strong></span>
            <span class="sh-state" :class="c.state">{{ STATE_LABEL[c.state] }}</span>
          </div>
        </ConnectorCardShell>
      </div>

      <div v-else-if="loaded && !error" class="state-empty" style="margin-top: 24px">
        <h3>aucun connecteur partagé</h3>
        <p>
          ton org ou ton équipe ne fournit pas (encore) de clé partagée. en attendant, connecte
          tes propres clés depuis
          <a href="#" @click.prevent="router.push('/connectors')">mes connecteurs</a>.
        </p>
      </div>
    </ConsoleCard>
  </div>
</template>

<style scoped>
/* Le chrome de tuile (logo/nom/éditeur) vit dans ConnectorCardShell. Ici : le corps. */
.sh-help { font-size: 12.5px; line-height: 1.5; color: var(--color-ink-soft); margin: 0; flex: 1; }
.sh-tags { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.sh-foot { display: flex; align-items: center; gap: 10px; justify-content: space-between; }
.sh-src { font-size: 11.5px; color: var(--color-mute); }
.sh-src strong { color: var(--color-ink-soft); font-weight: 600; }
.sh-state {
  font-family: var(--font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.06em;
  text-transform: uppercase; padding: 2.5px 8px; border-radius: 999px;
  border: 1px solid var(--color-hair); color: var(--color-mute); white-space: nowrap;
}
.sh-state.active { border-color: var(--color-olive); color: var(--color-olive); }
</style>
