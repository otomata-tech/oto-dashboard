<script setup lang="ts">
// Section « Context » — projection ORG (ADR 0022). Le SOCLE garanti à tout membre de
// l'org active : readme org (éditable), readme d'équipe (par groupe), connecteurs
// activés, baseline de toolset. PAS l'artefact d'un membre précis (il dépend de son
// équipe) — « voir en tant que membre » viendra quand le backend autorisera un
// org_admin à consulter le contexte composé d'un membre (view-as est opérateur-only).
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import AgentReadmeCard from '@/components/console/AgentReadmeCard.vue'
import GuidesCard from '@/components/console/GuidesCard.vue'
import { useMe } from '@/composables/useMe'
import {
  getInstruction, putInstruction, listGroups, getOrgConnectorActivation,
} from '@/api/console'
import type { GroupListItem, OrgConnectorActivation } from '@/types/api'
import { humanize } from '@/lib/errors'

const { me } = useMe()
const activeOrgId = computed(() => me.value?.active_org ?? null)
const orgName = computed(() => me.value?.active_org_name ?? null)
const isOrgAdmin = computed(() => me.value?.org_role === 'org_admin')

const README_SLUG = 'claude_md'
const loadOrgReadme = () => getInstruction(README_SLUG)
const saveOrgReadme = (body: string) => putInstruction(README_SLUG, body, 'agent readme')

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
      <h2 class="ctx-h1">ce que voit l'agent · socle de l'org</h2>
      <p class="ctx-lead">
        le contexte garanti à <strong>tout membre</strong> de {{ orgName || 'ton org' }} : la prose
        de l'org, celle des équipes, et les connecteurs mis à disposition. l'artefact exact d'un
        membre dépend aussi de son équipe et de ses préférences.
      </p>
    </header>

    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>
    <p v-else-if="activeOrgId == null" class="helptext">aucune org active.</p>

    <template v-else>
      <!-- readme org (éditable) -->
      <AgentReadmeCard title="readme de l'org"
        sub="la prose de l'org (contexte métier, règles, vocabulaire) injectée au début de chaque session de chaque membre — avant l'équipe et l'utilisateur. variables : {{org}} {{user}} {{équipe}} {{connecteurs_actifs}}."
        :can-edit="isOrgAdmin"
        placeholder="ex. nous vendons des audits RGPD à des ETI ; toujours vérifier le SIREN via fr_get avant d'écrire au CRM."
        :load="loadOrgReadme" :save="saveOrgReadme" />

      <!-- readme d'équipe -->
      <ConsoleCard title="readme d'équipe" flush
        sub="chaque équipe peut ajouter sa prose, injectée après celle de l'org pour ses membres. édition par équipe.">
        <template #actions>
          <RouterLink to="/org/teams"><Btn kind="mini">Gérer les équipes →</Btn></RouterLink>
        </template>
        <p v-if="!loaded" class="helptext">chargement…</p>
        <div v-else-if="!groups.length" class="helptext">aucune équipe — l'org n'a pas d'équipe pour l'instant.</div>
        <div v-else class="rowlist">
          <div v-for="g in groups" :key="g.id" class="rowitem" style="gap: 10px">
            <Tag tone="saffron">{{ g.name }}</Tag>
            <span style="font-size: 12px; color: var(--color-faint)">{{ g.member_count }} membre(s)</span>
          </div>
        </div>
      </ConsoleCard>

      <!-- guides ON-DEMAND de l'org (pendant du readme : chargés à la demande) -->
      <GuidesCard scope="org" :can-edit="isOrgAdmin" title="guides de l'org"
        sub="des how-to que l'agent de chaque membre charge à la demande (via oto_guide) — pas injectés à chaque session comme le readme. réservé aux admins d'org." />

      <!-- connecteurs activés (socle d'outils) -->
      <ConsoleCard title="connecteurs mis à disposition" flush
        sub="les connecteurs activés pour l'org — leurs outils sont disponibles aux membres (chacun affine sa visibilité). la baseline de toolset définit ce qui est visible par défaut.">
        <template #actions>
          <RouterLink to="/org/connectors"><Btn kind="mini">Gérer connecteurs & baseline →</Btn></RouterLink>
        </template>
        <p v-if="!loaded" class="helptext">chargement…</p>
        <div v-else-if="!activeConnectors.length" class="helptext">aucun connecteur activé pour l'org.</div>
        <div v-else style="display: flex; flex-wrap: wrap; gap: 8px">
          <Tag v-for="c in activeConnectors" :key="c.connector" tone="olive">{{ c.label || c.connector }}</Tag>
        </div>
      </ConsoleCard>

      <!-- view-as membre : déféré (authz backend) -->
      <ConsoleCard title="voir en tant que membre" flush
        sub="prévisualiser l'artefact composé exact d'un membre (org + son équipe + ses préférences).">
        <p class="helptext">
          à venir — nécessite d'autoriser un admin d'org à consulter le contexte composé d'un membre
          (le « view-as » actuel est réservé à l'opérateur plateforme).
        </p>
      </ConsoleCard>
    </template>
  </div>
</template>

<style scoped>
.ctx-intro { margin-bottom: 18px; }
.ctx-h1 { font-weight: 700; font-size: 20px; color: var(--color-ink); letter-spacing: -0.01em; }
.ctx-lead { font-size: 13.5px; color: var(--color-mute); line-height: 1.6; margin-top: 6px; max-width: 720px; }
</style>
