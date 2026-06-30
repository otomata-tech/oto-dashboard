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
import Btn from '@/components/console/Btn.vue'
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
const monogram = (c: MyConnector) => (c.label || c.name).charAt(0).toUpperCase()
</script>

<template>
  <div class="content-inner">
    <ConsoleCard title="connecteurs partagés"
      sub="ce que tu peux utiliser sans poser ta propre clé — fourni par ton organisation ou ton équipe. ta clé perso, si tu en ajoutes une, prime toujours.">
      <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

      <div v-if="loaded && shared.length" class="grid3">
        <article v-for="c in shared" :key="c.name" class="sh-card">
          <div class="sh-head">
            <div class="sh-logo">
              <img v-if="c.logo_url" :src="c.logo_url" :alt="c.label" loading="lazy" />
              <span v-else class="sh-mono">{{ monogram(c) }}</span>
            </div>
            <div style="min-width: 0; flex: 1">
              <div class="sh-name">{{ c.label }}</div>
              <div class="sh-pub">{{ c.publisher }}</div>
            </div>
            <Tag :tone="modeOf(c.name) === 'group' ? 'cobalt' : 'olive'">
              {{ modeOf(c.name) === 'group' ? 'team key' : 'org key' }}
            </Tag>
          </div>
          <p class="sh-help">{{ c.help || '—' }}</p>
          <div class="sh-foot">
            <span class="sh-src">résolu par <strong>{{ sourceLabel(c.name) }}</strong></span>
            <span class="sh-state" :class="c.state">{{ STATE_LABEL[c.state] }}</span>
          </div>
        </article>
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
.sh-card {
  display: flex; flex-direction: column; gap: 10px; padding: 16px;
  border: 1px solid var(--color-hair); border-radius: 12px; background: var(--color-paper);
}
.sh-head { display: flex; align-items: center; gap: 11px; }
.sh-logo {
  width: 40px; height: 40px; border-radius: 9px; flex: 0 0 auto; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--color-hair); background: var(--color-surface);
}
.sh-logo img { width: 100%; height: 100%; object-fit: contain; }
.sh-mono { font-family: var(--font-mono); font-weight: 700; font-size: 17px; color: var(--color-ink-soft); }
.sh-name { font-weight: 600; font-size: 14px; line-height: 1.2; }
.sh-pub { font-size: 11.5px; color: var(--color-faint); margin-top: 2px; }
.sh-help { font-size: 12.5px; line-height: 1.5; color: var(--color-ink-soft); margin: 0; flex: 1; }
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
