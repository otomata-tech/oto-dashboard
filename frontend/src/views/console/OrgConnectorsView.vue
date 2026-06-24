<script setup lang="ts">
// Cockpit connecteurs de l'ORG (/org/connectors, ADR 0022) — la projection « org »
// du connecteur : ce que l'org propose & impose à ses membres. Leviers par connecteur :
// disponibilité (BINAIRE, bornée par la plateforme = plancher dur : on ne peut PAS
// forcer ce que la plateforme a coupé), clé partagée d'org, abonnement (add-on payant),
// et rédaction de champs (éditable ici — feature ORG ; absente de la carte user). Le
// backend porte l'autz (org_admin) — l'UI masque les contrôles. « Recommandé » retiré
// (inerte aujourd'hui ; backend gardé pour plus tard).
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
  getOrgFieldFilters,
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
    defaultRules: b?.defaults?.[name]?.rules ?? [],
    customized: !!b?.filters?.[name],
  }
}
async function reloadFilters() {
  if (activeOrgId.value == null) return
  filters.value = await getOrgFieldFilters(activeOrgId.value).catch(() => filters.value)
}

// Disponibilité = BINAIRE, bornée par la plateforme (plancher dur). Personne ne peut
// FORCER un connecteur que la plateforme a coupé → si master off, aucun levier.
// on = hérite (la plateforme l'expose, donc dispo) ; off = override « coupé pour mes membres ».
async function setAvailable(r: OrgConnectorActivation, on: boolean) {
  if (!isOrgAdmin.value || r.master_enabled !== true) return
  try {
    if (on) await clearOrgConnectorActivation(activeOrgId.value!, r.connector)
    else await setOrgConnectorActivation(activeOrgId.value!, r.connector, false)
    toast(`${r.label} : ${on ? 'disponible pour tes membres' : 'coupé pour tes membres'}`)
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
        sub="pour chaque connecteur : ce que tes membres peuvent installer (disponibilité), la clé partagée de l'org et la rédaction des champs. la plateforme borne — tu ne peux pas exposer un connecteur qu'elle a coupé.">
        <template #actions>
          <input v-model="q" class="cc-search" placeholder="rechercher…" />
        </template>
        <div v-if="!isOrgAdmin" class="helptext">lecture seule — seul un admin de l'org peut régler ces leviers.</div>
      </ConsoleCard>

      <ConsoleCard v-for="r in shown" :key="r.connector" :title="r.label"
        :sub="r.namespaces.join(', ')">
        <!-- Effet en clair AVANT les leviers : ce que vivent tes membres. -->
        <div class="ocstatus" :class="r.effective ? 'is-on' : 'is-off'">
          <span class="ocstatus-dot" />
          <span class="ocstatus-txt">
            <strong>{{ r.effective ? 'disponible pour tes membres' : 'coupé pour tes membres' }}</strong>
            <span class="dim"> — {{ r.effective ? 'ils peuvent l\'installer dans leur toolbox' : 'invisible dans leur catalogue' }}</span>
          </span>
        </div>

        <div class="ocrow">
          <!-- Levier 1 : disponibilité — BINAIRE, bornée par la plateforme (plancher dur) -->
          <div class="ocfield">
            <span class="oclabel">disponibilité</span>
            <span class="ochelp">ce que tes membres peuvent installer</span>
            <Toggle v-if="r.master_enabled === true" :on="r.effective" :disabled="!isOrgAdmin"
              @change="setAvailable(r, !r.effective)" />
            <span v-else class="dim ocnote">coupé par la plateforme — tu ne peux pas l'exposer</span>
          </div>

          <!-- Levier 2 : clé partagée d'org (connecteurs à clé simple) -->
          <div v-if="canHaveOrgKey(r.connector)" class="ocfield">
            <span class="oclabel">clé d'org</span>
            <span class="ochelp">héritée par les membres sans clé perso</span>
            <div class="ockey">
              <Tag v-if="hasOrgKey(r.connector)" tone="olive">posée</Tag>
              <span v-else class="dim" style="font-size: 11.5px">aucune</span>
              <template v-if="isOrgAdmin">
                <button class="oclink" @click="setKey(r)">{{ hasOrgKey(r.connector) ? 'remplacer' : 'poser' }}</button>
                <button v-if="hasOrgKey(r.connector)" class="oclink oclink-danger" @click="removeKey(r)">retirer</button>
              </template>
            </div>
          </div>

          <!-- Levier 3 : abonnement (couche 3) — add-on payant (ex. unipile) -->
          <div v-if="r.paid_option" class="ocfield">
            <span class="oclabel">abonnement</span>
            <span class="ochelp">add-on payant de l'org</span>
            <div class="ockey">
              <Tag v-if="r.subscribed" tone="olive">souscrit</Tag>
              <span v-else class="dim" style="font-size: 11.5px">non souscrit</span>
            </div>
          </div>
        </div>

        <!-- Rédaction des champs (éditable ici) -->
        <button class="oclink" @click="openId = openId === r.connector ? null : r.connector">
          {{ openId === r.connector ? '▾' : '▸' }} rédaction des champs
        </button>
        <ConnectorTransforms v-if="openId === r.connector"
          :service="r.connector" :fields="transformsOf(r.connector).schema" :rules="transformsOf(r.connector).rules"
          :default-rules="transformsOf(r.connector).defaultRules" :templates="filters?.templates"
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
.ocstatus { display: flex; align-items: center; gap: 9px; padding: 2px 0 12px; font-size: 13px; border-bottom: 1px solid var(--color-hair-soft); margin-bottom: 12px; }
.ocstatus-dot { width: 8px; height: 8px; border-radius: 999px; flex: none; }
.ocstatus.is-on .ocstatus-dot { background: var(--color-olive); }
.ocstatus.is-off .ocstatus-dot { background: var(--color-faint); }
.ocstatus-txt { flex: 1; min-width: 0; }
.ocrow { display: flex; gap: 28px; flex-wrap: wrap; align-items: flex-start; padding: 4px 0 8px; }
.ocfield { display: flex; flex-direction: column; gap: 4px; }
.oclabel { font-size: 11px; font-weight: 600; color: var(--color-mute); text-transform: uppercase; letter-spacing: 0.04em; }
.ochelp { font-size: 11px; color: var(--color-faint); margin-top: -2px; max-width: 30ch; line-height: 1.35; }
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
