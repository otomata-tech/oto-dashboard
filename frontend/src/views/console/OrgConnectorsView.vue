<script setup lang="ts">
// Cockpit connecteurs de l'ORG (/org/connectors, ADR 0022) — la projection « org »
// du connecteur : ce que l'org propose & impose à ses membres. Trois leviers par
// connecteur : plafond dur (override d'activation on/off/hérite), recommandation
// (baseline default_connectors), et rédaction de champs (éditable ici ; lecture
// seule côté carte user). Le backend porte l'autz (org_admin) — l'UI masque les
// contrôles. La clé partagée d'org et la baseline toolset restent pour l'instant
// dans /org (rapatriement ultérieur).
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Tag from '@/components/console/Tag.vue'
import Toggle from '@/components/console/Toggle.vue'
import ConnectorTransforms from '@/components/console/ConnectorTransforms.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useMe } from '@/composables/useMe'
import {
  getOrgConnectorActivation, setOrgConnectorActivation, clearOrgConnectorActivation,
  setOrgConnectors, getOrgFieldFilters,
  getConnectors, getOrg, setOrgSecret, deleteOrgSecret,
} from '@/api/console'
import type { OrgConnectorActivation, FieldFiltersBundle, ConnectorMeta } from '@/types/api'
import { humanize } from '@/lib/errors'

const { toast } = useToast()
const { promptForm, confirmAction } = usePrompt()
const { me } = useMe()

const rows = ref<OrgConnectorActivation[]>([])
const filters = ref<FieldFiltersBundle | null>(null)
const meta = ref<Record<string, ConnectorMeta>>({})   // catalogue (secret_kind…)
const orgSecrets = ref<Set<string>>(new Set())        // connecteurs avec une clé partagée d'org
const error = ref<string | null>(null)
const loaded = ref(false)
const q = ref('')
const openId = ref<string | null>(null)   // connecteur dont la rédaction est dépliée

const activeOrgId = computed(() => me.value?.active_org ?? null)
const isOrgAdmin = computed(() => me.value?.org_role === 'org_admin' || me.value?.role === 'admin')

// override d'org : null → 'inherit' (suit le master) ; true → 'on' ; false → 'off'.
type ActState = 'inherit' | 'on' | 'off'
function actState(r: OrgConnectorActivation): ActState {
  return r.org_enabled === null ? 'inherit' : (r.org_enabled ? 'on' : 'off')
}

const shown = computed(() => {
  const needle = q.value.trim().toLowerCase()
  return rows.value
    .filter((r) => !needle || r.connector.toLowerCase().includes(needle) || r.label.toLowerCase().includes(needle))
    .sort((a, b) => Number(b.effective) - Number(a.effective) || a.label.localeCompare(b.label))
})

async function load() {
  if (activeOrgId.value == null) { loaded.value = true; return }
  try {
    const [act, ff, cat, org] = await Promise.all([
      getOrgConnectorActivation(activeOrgId.value),
      getOrgFieldFilters(activeOrgId.value).catch(() => null),
      getConnectors().catch(() => ({ connectors: [] as ConnectorMeta[] })),
      getOrg(activeOrgId.value).catch(() => null),
    ])
    rows.value = act.connectors
    filters.value = ff
    meta.value = Object.fromEntries(cat.connectors.map((c) => [c.name, c]))
    orgSecrets.value = new Set((org?.secrets ?? []).map((s) => s.provider))
  } catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
}
onMounted(load)

// Clé partagée d'org : possible pour les connecteurs à clé simple (secret_kind=api_key).
// Les multi-champs / oauth / cookie ne passent pas par cette voie (clé unique en base).
const canHaveOrgKey = (name: string) => meta.value[name]?.secret_kind === 'api_key'
const hasOrgKey = (name: string) => orgSecrets.value.has(name)

async function setKey(r: OrgConnectorActivation) {
  if (!isOrgAdmin.value) return
  const res = await promptForm({
    title: `${r.label} — clé partagée d'org`,
    description: 'clé du compte de l\'org, héritée par tous les membres (cascade : clé perso > équipe > org > plateforme). stockée chiffrée.',
    fields: [{ key: 'api_key', label: 'clé api', type: 'password', required: true, placeholder: `colle la clé ${r.label}` }],
    submitLabel: 'enregistrer',
  })
  if (!res || !res.api_key) return
  try { await setOrgSecret(activeOrgId.value!, r.connector, res.api_key); toast(`${r.label} : clé d'org enregistrée`); await load() }
  catch (e) { toast(humanize(e)) }
}

async function removeKey(r: OrgConnectorActivation) {
  if (!isOrgAdmin.value) return
  if (!await confirmAction({ title: 'retirer la clé d\'org', danger: true, confirmLabel: 'retirer',
    message: `retirer la clé partagée ${r.label} ? les membres sans clé perso perdent l'accès.` })) return
  try { await deleteOrgSecret(activeOrgId.value!, r.connector); toast(`${r.label} : clé d'org retirée`); await load() }
  catch (e) { toast(humanize(e)) }
}

// Rédaction par connecteur : schéma déclaré + règles effectives (org sinon défaut).
function transformsOf(name: string) {
  const b = filters.value
  return {
    schema: b?.schemas?.[name] ?? [],
    rules: b?.filters?.[name]?.rules ?? b?.defaults?.[name]?.rules ?? [],
    customized: !!b?.filters?.[name],
  }
}
async function reloadFilters() {
  if (activeOrgId.value == null) return
  filters.value = await getOrgFieldFilters(activeOrgId.value).catch(() => filters.value)
}

async function setActivation(r: OrgConnectorActivation, next: ActState) {
  if (!isOrgAdmin.value || actState(r) === next) return
  try {
    if (next === 'inherit') await clearOrgConnectorActivation(activeOrgId.value!, r.connector)
    else await setOrgConnectorActivation(activeOrgId.value!, r.connector, next === 'on')
    toast(`${r.label} : ${next === 'inherit' ? 'suit la plateforme' : (next === 'on' ? 'forcé actif' : 'forcé inactif')}`)
    await load()
  } catch (e) { toast(humanize(e)) }
}

async function toggleRecommend(r: OrgConnectorActivation) {
  if (!isOrgAdmin.value) return
  const names = new Set(rows.value.filter((x) => x.recommended).map((x) => x.connector))
  if (r.recommended) names.delete(r.connector); else names.add(r.connector)
  try {
    await setOrgConnectors(activeOrgId.value!, [...names])
    toast(`${r.label} : ${r.recommended ? 'retiré des' : 'ajouté aux'} recommandés`)
    await load()
  } catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <ConsoleCard v-if="loaded && activeOrgId == null" title="aucune org active">
      <div class="helptext">la gouvernance des connecteurs se règle au niveau d'une organisation — sélectionne ou crée-en une.</div>
    </ConsoleCard>

    <template v-else>
      <ConsoleCard title="connecteurs de l'org"
        sub="ce que ton org propose & impose à ses membres. plafond dur (forcer actif/inactif), recommandation, et rédaction des champs. la plateforme borne : on ne peut pas activer un connecteur qu'elle a coupé.">
        <template #actions>
          <input v-model="q" class="cc-search" placeholder="rechercher…" />
        </template>
        <div v-if="!isOrgAdmin" class="helptext">lecture seule — seul un admin de l'org peut régler ces leviers.</div>
      </ConsoleCard>

      <ConsoleCard v-for="r in shown" :key="r.connector" :title="r.label" flush
        :sub="r.namespaces.join(', ')">
        <template #actions>
          <Tag :tone="r.effective ? 'olive' : 'ink'">{{ r.effective ? 'exposé' : 'masqué' }}</Tag>
          <Tag v-if="r.recommended" tone="saffron">recommandé</Tag>
        </template>

        <div class="ocrow">
          <!-- Plafond dur : hérite / forcé ON / forcé OFF -->
          <div class="ocfield">
            <span class="oclabel">activation</span>
            <div class="ocseg" role="radiogroup" aria-label="org activation">
              <button :class="{ on: actState(r) === 'inherit' }" :disabled="!isOrgAdmin" @click="setActivation(r, 'inherit')">
                hérite<span class="dim"> ({{ r.master_enabled ? 'on' : 'off' }})</span>
              </button>
              <button :class="{ on: actState(r) === 'on' }" :disabled="!isOrgAdmin || r.master_enabled !== true"
                :title="r.master_enabled !== true ? 'désactivé par la plateforme' : ''" @click="setActivation(r, 'on')">
                forcer on
              </button>
              <button :class="{ on: actState(r) === 'off' }" :disabled="!isOrgAdmin" @click="setActivation(r, 'off')">
                forcer off
              </button>
            </div>
            <span v-if="r.master_enabled !== true" class="dim ocnote">désactivé par la plateforme</span>
          </div>

          <!-- Recommandation (baseline consultative) -->
          <div class="ocfield">
            <span class="oclabel">recommandé</span>
            <Toggle :on="r.recommended" :disabled="!isOrgAdmin" @change="toggleRecommend(r)" />
          </div>

          <!-- Clé partagée d'org (connecteurs à clé simple) -->
          <div v-if="canHaveOrgKey(r.connector)" class="ocfield">
            <span class="oclabel">clé d'org</span>
            <div class="ockey">
              <Tag v-if="hasOrgKey(r.connector)" tone="olive">posée</Tag>
              <span v-else class="dim" style="font-size: 11.5px">aucune</span>
              <template v-if="isOrgAdmin">
                <button class="oclink" @click="setKey(r)">{{ hasOrgKey(r.connector) ? 'remplacer' : 'poser' }}</button>
                <button v-if="hasOrgKey(r.connector)" class="oclink oclink-danger" @click="removeKey(r)">retirer</button>
              </template>
            </div>
          </div>
        </div>

        <!-- Rédaction des champs (éditable ici) -->
        <button class="oclink" @click="openId = openId === r.connector ? null : r.connector">
          {{ openId === r.connector ? '▾' : '▸' }} rédaction des champs
        </button>
        <ConnectorTransforms v-if="openId === r.connector"
          :service="r.connector" :fields="transformsOf(r.connector).schema" :rules="transformsOf(r.connector).rules"
          :action-schema="filters?.schema ?? []" :customized="transformsOf(r.connector).customized"
          :org-id="activeOrgId" :is-org-admin="isOrgAdmin" @changed="reloadFilters" />
      </ConsoleCard>
      <p v-if="loaded && !shown.length" class="helptext" style="text-align: center; padding: 16px">aucun connecteur.</p>
    </template>
  </div>
</template>

<style scoped>
.cc-search {
  font-size: 12px; padding: 5px 10px; border: 1px solid var(--color-hair-classic);
  border-radius: 8px; background: var(--color-surface); color: var(--color-ink); width: 200px;
}
.cc-search:focus { outline: none; border-color: var(--color-ink); }
.ocrow { display: flex; gap: 28px; flex-wrap: wrap; align-items: flex-start; padding: 4px 0 8px; }
.ocfield { display: flex; flex-direction: column; gap: 5px; }
.oclabel { font-size: 11px; font-weight: 600; color: var(--color-mute); text-transform: uppercase; letter-spacing: 0.04em; }
.ocseg { display: inline-flex; border: 1px solid var(--color-hair-classic); border-radius: 999px; overflow: hidden; }
.ocseg button {
  font-size: 11.5px; padding: 4px 12px; border: 0; background: transparent; cursor: pointer;
  color: var(--color-mute); border-left: 1px solid var(--color-hair-soft);
}
.ocseg button:first-child { border-left: 0; }
.ocseg button.on { background: var(--color-ink); color: var(--color-paper); font-weight: 600; }
.ocseg button:disabled { cursor: not-allowed; opacity: 0.5; }
.ocnote { font-size: 11px; }
.oclink { background: none; border: 0; padding: 4px 0; cursor: pointer; font-size: 12px; color: var(--color-cobalt-ink); font-weight: 600; }
.ockey { display: flex; align-items: center; gap: 8px; min-height: 22px; }
.oclink-danger { color: var(--color-terra-ink); }
</style>
