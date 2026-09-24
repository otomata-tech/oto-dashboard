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
import ConnectorTileBody from '@/components/console/ConnectorTileBody.vue'
import { useMe } from '@/composables/useMe'
import { getMyConnectors } from '@/api/console'
import type { MyConnector, ConnectorState } from '@/types/api'
import { humanize } from '@/lib/errors'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

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

function sourceLabel(name: string): string {
  const mode = modeOf(name)
  if (mode === 'org') return me.value?.active_org_name
    ? t('accountUi.shared.source.org', { org: me.value.active_org_name }) : t('accountUi.shared.source.yourOrg')
  if (mode === 'group') return me.value?.active_group_name
    ? t('accountUi.shared.source.namedTeam', { team: me.value.active_group_name }) : t('accountUi.shared.source.team')
  return t('accountUi.shared.source.shared')
}

const etat = (s: ConnectorState) => t(`accountUi.shared.state.${s}`)
// Fiche de présentation (marketplace) — même geste que les cartes user/org/plateforme.
const ficheTo = (c: MyConnector) =>
  `/connectors?tab=marketplace&connector=${encodeURIComponent(c.name)}`
</script>

<template>
  <div class="content-inner">
    <ConsoleCard :title="t('accountUi.shared.title')" :sub="t('accountUi.shared.sub')">
      <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

      <!-- Tuiles = MÊME shell que les cartes user/org/plateforme (ADR 0024 §3) ;
           badges canoniques ; le nom mène à la fiche marketplace. -->
      <div v-if="loaded && shared.length" class="grid3">
        <ConnectorCardShell v-for="c in shared" :key="c.name"
          :label="c.label" :logo-url="c.logo_url" :subtitle="c.publisher"
          fill :to="ficheTo(c)">
          <template #header-right>
            <Tag :tone="modeOf(c.name) === 'group' ? 'cobalt' : 'olive'">
              {{ modeOf(c.name) === 'group' ? t('accountUi.shared.teamKey') : t('accountUi.shared.orgKey') }}
            </Tag>
          </template>
          <ConnectorTileBody :description="c.help" :meta="c">
            <template #footer>
              <i18n-t keypath="accountUi.shared.resolvedBy" tag="span" class="sh-src">
                <template #source><strong>{{ sourceLabel(c.name) }}</strong></template>
              </i18n-t>
              <span class="sh-state" :class="c.state">{{ etat(c.state) }}</span>
            </template>
          </ConnectorTileBody>
        </ConnectorCardShell>
      </div>

      <div v-else-if="loaded && !error" class="state-empty" style="margin-top: 24px">
        <h3>{{ t('accountUi.shared.emptyTitle') }}</h3>
        <i18n-t keypath="accountUi.shared.empty" tag="p">
          <template #link><a href="#" @click.prevent="router.push('/connectors')">{{ t('accountUi.shared.myConnectors') }}</a></template>
        </i18n-t>
      </div>
    </ConsoleCard>
  </div>
</template>

<style scoped>
/* Chrome de tuile → ConnectorCardShell ; desc+badges+pied → ConnectorTileBody.
   Ici : seulement le contenu propre du pied (source résolue + état). */
.sh-src { font-size: 11.5px; color: var(--color-mute); }
.sh-src strong { color: var(--color-ink-soft); font-weight: 600; }
.sh-state {
  font-family: var(--font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.06em;
  text-transform: uppercase; padding: 2.5px 8px; border-radius: 999px;
  border: 1px solid var(--color-hair); color: var(--color-mute); white-space: nowrap;
}
.sh-state.active { border-color: var(--color-olive); color: var(--color-olive); }
</style>
