<script setup lang="ts">
// Section « Context » — projection ORG (ADR 0022). Le SOCLE garanti à tout membre de
// l'org active : readme org (éditable), readme d'équipe (par groupe), connecteurs
// activés, baseline de toolset. PAS l'artefact d'un membre précis (il dépend de son
// équipe). Pas de « voir en tant que membre » : la fonction n'existe pas (le backend
// réserve le view-as à l'opérateur plateforme) ; une carte « à venir » l'annonçait,
// retirée par oto#193 — une promesse n'est pas un écran.
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import AgentReadmeCard from '@/components/console/AgentReadmeCard.vue'
import GuidesCard from '@/components/console/GuidesCard.vue'
import { useMe } from '@/composables/useMe'
import {
  getInitGuide, setInitGuide, listGroups, getOrgConnectorActivation,
} from '@/api/console'
import type { GroupListItem, OrgConnectorActivation } from '@/types/api'
import { humanize } from '@/lib/errors'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const { me } = useMe()
const activeOrgId = computed(() => me.value?.active_org ?? null)
const orgName = computed(() => me.value?.active_org_name ?? null)
const isOrgAdmin = computed(() => me.value?.org_role === 'org_admin')

// Le readme d'org = un guide `delivery=init` au scope org (ADR 0042) — ciblé par l'id
// de l'org affichée, jamais implicitement « celle de la session ».
const loadOrgReadme = () => getInitGuide('org', activeOrgId.value ?? undefined)
const saveOrgReadme = (body: string) => setInitGuide('org', body, activeOrgId.value ?? undefined)

const groups = ref<GroupListItem[]>([])
const connectors = ref<OrgConnectorActivation[]>([])
const error = ref<string | null>(null)
const loaded = ref(false)

const activeConnectors = computed(() => connectors.value.filter((c) => c.effective))

async function load() {
  if (activeOrgId.value == null) { loaded.value = true; return }
  try {
    const [g, c] = await Promise.all([
      listGroups(activeOrgId.value),
      getOrgConnectorActivation(activeOrgId.value),
    ])
    groups.value = g.groups
    connectors.value = c.connectors
  } catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
}
onMounted(load)
</script>

<template>
  <div class="content-inner fadein">
    <header class="ctx-intro">
      <h2 class="ctx-h1">{{ t('contextUi.org.title') }}</h2>
      <i18n-t keypath="contextUi.org.lead" tag="p" class="ctx-lead">
        <template #every><strong>{{ t('contextUi.org.every') }}</strong></template>
        <template #org>{{ orgName || t('contextUi.org.yourOrg') }}</template>
      </i18n-t>
    </header>

    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>
    <p v-else-if="activeOrgId == null" class="helptext">{{ t('contextUi.org.noOrg') }}</p>

    <template v-else>
      <!-- readme org (éditable) -->
      <AgentReadmeCard :title="t('contextUi.org.readmeTitle')"
        :sub="t('contextUi.org.readmeSub', { vars: '{{org}} {{user}} {{équipe}} {{connecteurs_actifs}}' })"
        :can-edit="isOrgAdmin"
        :placeholder="t('contextUi.org.readmePlaceholder')"
        :load="loadOrgReadme" :save="saveOrgReadme" />

      <!-- readme d'équipe -->
      <ConsoleCard :title="t('contextUi.org.teamTitle')" flush :sub="t('contextUi.org.teamSub')">
        <template #actions>
          <RouterLink to="/org/teams"><Btn kind="mini">{{ t('contextUi.org.manageTeams') }}</Btn></RouterLink>
        </template>
        <p v-if="!loaded" class="helptext">{{ t('common.loading') }}</p>
        <div v-else-if="!groups.length" class="helptext">{{ t('contextUi.org.noTeam') }}</div>
        <div v-else class="rowlist">
          <div v-for="g in groups" :key="g.id" class="rowitem" style="gap: 10px">
            <Tag tone="saffron">{{ g.name }}</Tag>
            <span style="font-size: 12px; color: var(--color-faint)">{{ t('contextUi.org.members', g.member_count ?? 0) }}</span>
          </div>
        </div>
      </ConsoleCard>

      <!-- guides ON-DEMAND de l'org (pendant du readme : chargés à la demande) -->
      <GuidesCard scope="org" :can-edit="isOrgAdmin" :title="t('contextUi.org.guidesTitle')" :sub="t('contextUi.org.guidesSub')" />

      <!-- connecteurs activés (socle d'outils) -->
      <ConsoleCard :title="t('contextUi.org.connectorsTitle')" flush :sub="t('contextUi.org.connectorsSub')">
        <template #actions>
          <RouterLink to="/org/connectors"><Btn kind="mini">{{ t('contextUi.org.manageConnectors') }}</Btn></RouterLink>
        </template>
        <p v-if="!loaded" class="helptext">{{ t('common.loading') }}</p>
        <div v-else-if="!activeConnectors.length" class="helptext">{{ t('contextUi.org.noConnector') }}</div>
        <div v-else style="display: flex; flex-wrap: wrap; gap: 8px">
          <Tag v-for="c in activeConnectors" :key="c.connector" tone="olive">{{ c.label || c.connector }}</Tag>
        </div>
      </ConsoleCard>
    </template>
  </div>
</template>

<style scoped>
.ctx-intro { margin-bottom: 18px; }
.ctx-h1 { font-weight: 700; font-size: 20px; color: var(--color-ink); letter-spacing: -0.01em; }
.ctx-lead { font-size: 13.5px; color: var(--color-mute); line-height: 1.6; margin-top: 6px; max-width: 720px; }
</style>
