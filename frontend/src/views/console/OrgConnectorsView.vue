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
import ConnectorOrgCard from '@/components/console/ConnectorOrgCard.vue'
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

// Clé partagée d'org : a-t-on une clé posée pour ce connecteur ? (le « peut-on en
// poser une » — secret_kind=api_key — est dérivé dans la carte depuis meta.)
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

      <div class="occards">
        <ConnectorOrgCard v-for="r in shown" :key="r.connector"
          :activation="r" :meta="meta[r.connector]" :has-org-key="hasOrgKey(r.connector)"
          :filters="filters" :org-id="activeOrgId" :is-org-admin="isOrgAdmin"
          @set-available="(on) => setAvailable(r, on)"
          @set-key="() => setKey(r)" @remove-key="() => removeKey(r)"
          @filters-changed="reloadFilters" />
      </div>
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
/* Grille de cartes org (mêmes cartes que la vue user — ConnectorOrgCard). */
.occards { display: flex; flex-direction: column; gap: 12px; }
</style>
