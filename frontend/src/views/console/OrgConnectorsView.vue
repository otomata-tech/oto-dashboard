<script setup lang="ts">
// Cockpit connecteurs de l'ORG (/org/connectors, ADR 0022) — la projection « org »
// du connecteur : ce que l'org propose & impose à ses membres. Leviers par connecteur :
// disponibilité (BINAIRE, bornée par la plateforme = plancher dur : on ne peut PAS
// forcer ce que la plateforme a coupé), clé partagée d'org, option de connecteur,
// et rédaction de champs (éditable ici — feature ORG ; absente de la carte user). Le
// backend porte l'autz (org_admin) — l'UI masque les contrôles. « Recommandé » retiré
// (inerte aujourd'hui ; backend gardé pour plus tard).
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import OrgConnectorDrawer from '@/components/console/OrgConnectorDrawer.vue'
import CategoryChips from '@/components/console/CategoryChips.vue'
import Avatar from '@/components/console/Avatar.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import FormDialog from '@/components/console/FormDialog.vue'
import CredentialFieldsDialog from '@/components/console/CredentialFieldsDialog.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useFormDialog } from '@/composables/useFormDialog'
import { useMe } from '@/composables/useMe'
import {
  getOrgConnectorActivation, setOrgConnectorActivation, clearOrgConnectorActivation,
  getOrgFieldFilters, getOrgEmailSettings, listScheduledEmails, cancelScheduledEmail,
  getConnectors, getOrg, setOrgSecret, deleteOrgSecret,
  getConnectorAcl, setConnectorAccess, clearConnectorAccess, forceConnectorForMember, listGroups,
} from '@/api/console'
import type {
  OrgConnectorActivation, FieldFiltersBundle, ConnectorMeta,
  EmailSettingsBundle, ScheduledEmail, ConnectorAclEntry, GroupListItem, OrgMember,
} from '@/types/api'
import { fmtDateTime } from '@/types/api'
import { humanize } from '@/lib/errors'

const { toast } = useToast()
const { confirmAction } = usePrompt()
const { formDialog, formDialogOpen, openForm } = useFormDialog()
const { me } = useMe()

const rows = ref<OrgConnectorActivation[]>([])
const filters = ref<FieldFiltersBundle | null>(null)
const emailBundle = ref<EmailSettingsBundle | null>(null)
const meta = ref<Record<string, ConnectorMeta>>({})   // catalogue (secret_kind…)

// Clé d'org multi-champs (zoho/silae/zohodesk…) : saisie via CredentialFieldsDialog.
const credOpen = ref(false)
const credConn = ref<{ label: string; provider: string; fields: ConnectorMeta['credential_fields'] } | null>(null)
const orgSecrets = ref<Set<string>>(new Set())        // connecteurs avec une clé partagée d'org
const acl = ref<ConnectorAclEntry[]>([])              // RBAC connecteur (ADR 0025)
const groups = ref<GroupListItem[]>([])               // départements de l'org (picker)
const members = ref<OrgMember[]>([])                  // membres de l'org (picker)
const error = ref<string | null>(null)
const loaded = ref(false)
const q = ref('')
const category = ref<string | null>(null)
const selectedName = ref<string | null>(null)   // ligne ouverte dans le drawer

const activeOrgId = computed(() => me.value?.active_org ?? null)
const isOrgAdmin = computed(() => me.value?.org_role === 'org_admin' || me.value?.role === 'admin')

// Catégorie d'un connecteur = celle du registre (les lignes d'activation ne la
// portent pas) ; sert au filtre par chips et à la cellule de table.
const catOf = (connector: string) => meta.value[connector]?.category ?? ''
const pubOf = (connector: string) => meta.value[connector]?.publisher ?? ''
const logoOf = (connector: string) => meta.value[connector]?.logo_url

const shown = computed(() => {
  const needle = q.value.trim().toLowerCase()
  return rows.value
    .filter((r) => !category.value || catOf(r.connector) === category.value)
    .filter((r) => !needle || r.connector.toLowerCase().includes(needle) || r.label.toLowerCase().includes(needle))
    .sort((a, b) => Number(b.effective) - Number(a.effective) || a.label.localeCompare(b.label))
})

const selected = computed(() => rows.value.find((r) => r.connector === selectedName.value) ?? null)

// ── cellules de table (dérivées des mêmes leviers que le drawer) ──
const canHaveKey = (connector: string) => meta.value[connector]?.secret_kind === 'api_key'
const accessCountOf = (connector: string) => acl.value.filter((e) => e.connector === connector).length

async function load() {
  if (activeOrgId.value == null) { loaded.value = true; return }
  try {
    const [act, ff, em, cat, org, aclRes, grps] = await Promise.all([
      getOrgConnectorActivation(activeOrgId.value),
      getOrgFieldFilters(activeOrgId.value).catch(() => null),
      getOrgEmailSettings(activeOrgId.value).catch(() => null),
      getConnectors().catch(() => ({ connectors: [] as ConnectorMeta[] })),
      getOrg(activeOrgId.value).catch(() => null),
      getConnectorAcl(activeOrgId.value).catch(() => ({ access: [] as ConnectorAclEntry[] })),
      listGroups(activeOrgId.value).catch(() => ({ groups: [] as GroupListItem[] })),
    ])
    rows.value = act.connectors
    filters.value = ff
    emailBundle.value = em
    meta.value = Object.fromEntries(cat.connectors.map((c) => [c.name, c]))
    orgSecrets.value = new Set((org?.secrets ?? []).map((s) => s.provider))
    acl.value = aclRes.access
    groups.value = grps.groups
    members.value = org?.members ?? []
    await loadScheduled()
  } catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
}
onMounted(load)

async function reloadEmail() {
  if (activeOrgId.value == null) return
  emailBundle.value = await getOrgEmailSettings(activeOrgId.value).catch(() => emailBundle.value)
  await loadScheduled()
}

// L'encart « envois programmés » n'a de sens que si au moins un connecteur email a
// des expéditeurs (sinon rien ne peut partir).
const hasEmailSenders = computed(() =>
  Object.values(emailBundle.value?.settings ?? {}).some((b) => (b.senders?.length ?? 0) > 0))

// Clé partagée d'org : a-t-on une clé posée pour ce connecteur ? (le « peut-on en
// poser une » — secret_kind=api_key — est dérivé dans la carte depuis meta.)
const hasOrgKey = (name: string) => orgSecrets.value.has(name)

function setKey(r: OrgConnectorActivation) {
  if (!isOrgAdmin.value) return
  // Connecteur multi-champs (secret_kind=fields) → dialog N-champs, comme côté user.
  const m = meta.value[r.connector]
  if (m?.secret_kind === 'fields' && (m.credential_fields?.length ?? 0) > 0) {
    credConn.value = { label: r.label, provider: r.connector, fields: m.credential_fields }
    credOpen.value = true
    return
  }
  openForm({
    title: `${r.label} — clé partagée d'org`,
    description: 'clé du compte de l\'org, héritée par tous les membres (cascade : clé perso > équipe > org > plateforme). stockée chiffrée.',
    fields: [{ key: 'api_key', label: 'clé api', type: 'password', required: true, placeholder: `colle la clé ${r.label}` }],
    submitLabel: 'enregistrer',
    onConfirm: async (v) => {
      try { await setOrgSecret(activeOrgId.value!, r.connector, v.api_key ?? ''); toast(`${r.label} : clé d'org enregistrée`); await load() }
      catch (e) { toast(humanize(e)); throw e }
    },
  })
}

// Soumission d'une clé d'org MULTI-CHAMPS (api_key vide, `fields` peuplé).
async function doSetOrgCred(values: Record<string, string>) {
  const c = credConn.value
  if (!c) return
  try { await setOrgSecret(activeOrgId.value!, c.provider, '', undefined, values); toast(`${c.label} : clé d'org enregistrée`); await load() }
  catch (e) { toast(humanize(e)); throw e }
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

// « Tout activer » — rend disponibles à tes membres tous les connecteurs actuellement
// coupés (override d'org off) que la plateforme expose. Un connecteur déjà effectif est
// ignoré. Chaque activation = suppression de l'override → repli sur le master (dispo).
const enableableAll = computed(() =>
  rows.value.filter((r) => r.master_enabled === true && !r.effective))
async function enableAll() {
  if (!isOrgAdmin.value || activeOrgId.value == null) return
  const targets = enableableAll.value
  if (!targets.length) { toast('tous les connecteurs sont déjà disponibles pour tes membres'); return }
  if (!await confirmAction({
    title: 'tout activer',
    confirmLabel: `activer ${targets.length} connecteur${targets.length > 1 ? 's' : ''}`,
    message: `rendre disponibles à tes membres les ${targets.length} connecteurs actuellement coupés (parmi ceux que la plateforme expose) ?`,
  })) return
  try {
    await Promise.all(targets.map((r) => clearOrgConnectorActivation(activeOrgId.value!, r.connector)))
    toast(`${targets.length} connecteur${targets.length > 1 ? 's rendus disponibles' : ' rendu disponible'} pour tes membres`)
    await load()
  } catch (e) { toast(humanize(e)) }
}

// ── RBAC connecteur interne à l'org (ADR 0025) ────────────────────────────
const aclFor = (connector: string) => acl.value.filter((e) => e.connector === connector)
async function reloadAcl() {
  if (activeOrgId.value == null) return
  acl.value = (await getConnectorAcl(activeOrgId.value).catch(() => ({ access: acl.value }))).access
}
function addAccess(r: OrgConnectorActivation) {
  if (!isOrgAdmin.value) return
  const opts = [
    ...groups.value.map((g) => ({ value: `group:${g.id}`, label: `équipe · ${g.name}` })),
    ...members.value.map((m) => ({ value: `user:${m.sub}`, label: `membre · ${m.name || m.email || m.sub}` })),
  ]
  if (!opts.length) { toast('crée d\'abord un département ou ajoute des membres'); return }
  openForm({
    title: `${r.label} — réserver l'accès`,
    description: 'ajoute un département ou un membre autorisé. dès le 1er ajout, le connecteur devient RÉSERVÉ (invisible + bloqué pour les autres, même avec leur propre clé).',
    fields: [{ key: 'principal', label: 'autoriser', type: 'select', required: true, options: opts }],
    submitLabel: 'autoriser',
    onConfirm: async (v) => {
      const raw = String(v.principal)
      const i = raw.indexOf(':')
      const ptype = raw.slice(0, i)
      const pid = raw.slice(i + 1)
      if (!ptype || !pid) { toast('sélection invalide'); throw new Error('invalid principal') }
      try { await setConnectorAccess(activeOrgId.value!, r.connector, ptype, pid); toast(`${r.label} : accès réservé`); await reloadAcl() }
      catch (e) { toast(humanize(e)); throw e }
    },
  })
}
async function removeAccess(r: OrgConnectorActivation, ptype: string, pid: string) {
  if (!isOrgAdmin.value) return
  try { await clearConnectorAccess(activeOrgId.value!, r.connector, ptype, pid); await reloadAcl() }
  catch (e) { toast(humanize(e)) }
}
function forceForMember(r: OrgConnectorActivation) {
  if (!isOrgAdmin.value) return
  const opts = members.value.map((m) => ({ value: m.sub, label: m.name || m.email || m.sub }))
  if (!opts.length) { toast('ajoute d\'abord des membres à l\'org'); return }
  openForm({
    title: `${r.label} — pousser à un membre`,
    description: 'le connecteur apparaît dans la toolbox du membre (sans qu\'il l\'active). il reste libre de le masquer.',
    fields: [{ key: 'member', label: 'membre', type: 'select', required: true, options: opts }],
    submitLabel: 'pousser',
    onConfirm: async (v) => {
      try { await forceConnectorForMember(activeOrgId.value!, r.connector, String(v.member)); toast(`${r.label} : poussé au membre`) }
      catch (e) { toast(humanize(e)); throw e }
    },
  })
}

// ── envois programmés (carton unique en pied de vue) ──────────────────────
type SchedFilter = 'pending' | 'sent' | 'failed' | 'all'
const SCHED_FILTERS: SchedFilter[] = ['pending', 'sent', 'failed', 'all']
const schedFilter = ref<SchedFilter>('pending')
const scheduled = ref<ScheduledEmail[]>([])
const schedLoaded = ref(false)

async function loadScheduled() {
  if (activeOrgId.value == null) { schedLoaded.value = true; return }
  schedLoaded.value = false
  try {
    const res = await listScheduledEmails(activeOrgId.value, schedFilter.value)
    scheduled.value = res.scheduled_emails
  } catch (e) { toast(humanize(e)) }
  finally { schedLoaded.value = true }
}
function setSchedFilter(f: SchedFilter) { schedFilter.value = f; loadScheduled() }

async function cancelScheduled(eid: number) {
  if (activeOrgId.value == null) return
  if (!await confirmAction({
    title: 'annuler l\'envoi', danger: true, confirmLabel: 'annuler l\'envoi',
    message: 'cet email programmé ne partira pas. confirmer ?',
  })) return
  try {
    await cancelScheduledEmail(activeOrgId.value, eid)
    toast('envoi annulé')
    await loadScheduled()
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
      <!-- contrôles : recherche + chips + tout activer -->
      <ConsoleCard title="connecteurs de l'org"
        sub="pour chaque connecteur : ce que tes membres peuvent installer (disponibilité), la clé partagée de l'org, l'accès et la rédaction des champs. la plateforme borne — tu ne peux pas exposer un connecteur qu'elle a coupé.">
        <template #actions>
          <Btn v-if="isOrgAdmin" kind="mini" icon="plus"
            :disabled="!enableableAll.length" @click="enableAll">
            tout activer<span v-if="enableableAll.length" class="oc-count"> · {{ enableableAll.length }}</span>
          </Btn>
          <input v-model="q" class="cc-search" placeholder="rechercher…" />
        </template>
        <CategoryChips :values="rows.map((r) => catOf(r.connector))" v-model="category" />
        <div v-if="!isOrgAdmin" class="helptext" style="margin-top: 10px">lecture seule — seul un admin de l'org peut régler ces leviers.</div>
      </ConsoleCard>

      <!-- table : une ligne par connecteur ; clic → drawer de gouvernance -->
      <ConsoleCard flush title="gouvernance"
        sub="clique une ligne pour régler ses leviers (disponibilité, clé d'org, accès, rédaction).">
        <table class="tbl">
          <thead>
            <tr>
              <th style="width: 38%">connecteur</th>
              <th>disponibilité</th>
              <th>clé d'org</th>
              <th>accès</th>
              <th style="width: 24px"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in shown" :key="r.connector" class="crow" :class="{ sel: r.connector === selectedName }" @click="selectedName = r.connector">
              <td>
                <div style="display: flex; align-items: center; gap: 11px">
                  <Avatar :src="logoOf(r.connector)" :name="r.label" :size="32" shape="square" />
                  <div style="min-width: 0">
                    <div class="cv-name">{{ r.label }}</div>
                    <div class="cv-pub">{{ [pubOf(r.connector), catOf(r.connector)].filter(Boolean).join(' · ') }}</div>
                  </div>
                </div>
              </td>
              <td>
                <span class="cv-avail"><span class="cdot" :class="r.effective ? 'olive' : 'grey'"></span>{{ r.effective ? 'disponible' : 'coupé' }}</span>
              </td>
              <td>
                <Tag v-if="canHaveKey(r.connector) && hasOrgKey(r.connector)" tone="olive">posée</Tag>
                <span v-else-if="canHaveKey(r.connector)" class="dim" style="font-size: 11.5px">aucune</span>
                <span v-else class="dim" style="font-size: 11.5px">—</span>
              </td>
              <td>
                <span v-if="accessCountOf(r.connector)" class="cv-avail"><span class="cdot saffron"></span>réservé · {{ accessCountOf(r.connector) }}</span>
                <span v-else class="dim" style="font-size: 11.5px">ouvert</span>
              </td>
              <td style="text-align: right; color: var(--color-faint); font-weight: 700">›</td>
            </tr>
          </tbody>
        </table>
        <p v-if="loaded && !shown.length" class="helptext" style="text-align: center; padding: 18px">aucun connecteur.</p>
      </ConsoleCard>

      <OrgConnectorDrawer v-if="selected" :key="selected.connector"
        :activation="selected" :meta="meta[selected.connector]" :has-org-key="hasOrgKey(selected.connector)"
        :filters="filters" :email="emailBundle" :org-id="activeOrgId" :is-org-admin="isOrgAdmin"
        :acl="aclFor(selected.connector)" :groups="groups" :members="members"
        @close="selectedName = null"
        @set-available="(on) => setAvailable(selected!, on)"
        @set-key="() => setKey(selected!)" @remove-key="() => removeKey(selected!)"
        @add-access="() => addAccess(selected!)" @remove-access="(pt, pid) => removeAccess(selected!, pt, pid)"
        @force-member="() => forceForMember(selected!)"
        @filters-changed="reloadFilters" @email-changed="reloadEmail" />

      <CredentialFieldsDialog v-if="credConn" v-model:open="credOpen"
        :label="credConn.label" :fields="credConn.fields ?? []" :single="false"
        :on-confirm="doSetOrgCred" />

      <!-- Envois programmés — carton unique en pied (tous connecteurs email confondus) -->
      <ConsoleCard v-if="hasEmailSenders" title="envois programmés"
        sub="emails différés (programmés ou retenus par la fenêtre calme)">
        <template #actions>
          <div class="seg">
            <button v-for="f in SCHED_FILTERS" :key="f"
              :class="{ on: schedFilter === f }" @click="setSchedFilter(f)">{{ f }}</button>
          </div>
        </template>
        <div v-if="schedLoaded && scheduled.length" class="rowlist">
          <div v-for="m in scheduled" :key="m.id" class="rowitem">
            <div class="oc-sched-txt">
              <span class="oc-sched-subj">{{ m.subject || '(sans objet)' }}</span>
              <span class="oc-dim">{{ m.to_email || '—' }} · {{ fmtDateTime(m.scheduled_at) }}</span>
            </div>
            <span class="oc-spacer" />
            <Tag :tone="m.status === 'failed' ? 'terra' : m.status === 'sent' ? 'olive' : 'saffron'">{{ m.status }}</Tag>
            <Btn v-if="m.status === 'pending'" kind="danger" @click="cancelScheduled(m.id)">annuler</Btn>
          </div>
        </div>
        <p v-else-if="schedLoaded" class="helptext" style="padding: 6px 0">
          {{ schedFilter === 'pending' ? 'rien de programmé pour le moment.' : 'aucun email dans ce filtre.' }}
        </p>
      </ConsoleCard>
    </template>

    <FormDialog v-if="formDialog" v-model:open="formDialogOpen"
      :title="formDialog.title" :description="formDialog.description"
      :fields="formDialog.fields" :submit-label="formDialog.submitLabel" :on-confirm="formDialog.onConfirm" />
  </div>
</template>

<style scoped>
.cc-search {
  font-size: 12px; padding: 5px 10px; border: 1px solid var(--color-hair-classic);
  border-radius: 8px; background: var(--color-surface); color: var(--color-ink); width: 200px;
}
.cc-search:focus { outline: none; border-color: var(--color-ink); }
.oc-count { opacity: 0.6; font-variant-numeric: tabular-nums; }
/* Table (même dialecte que la vue USER ConnectorsView). */
.crow { cursor: pointer; }
.crow.sel td { background: var(--color-saffron-soft) !important; }
.crow.sel td:first-child { box-shadow: inset 3px 0 0 var(--color-saffron); }
.cv-name { font-weight: 600; font-size: 13px; color: var(--color-ink); white-space: nowrap; }
.cv-pub { font-size: 11px; color: var(--color-faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cv-avail { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; color: var(--color-ink-soft); }
.cdot { width: 8px; height: 8px; border-radius: 999px; display: inline-block; flex: 0 0 auto; }
.cdot.olive { background: var(--color-olive); }
.cdot.saffron { background: var(--color-saffron); }
.cdot.grey { background: var(--color-hair-classic); }
.dim { color: var(--color-faint); }
/* Lignes du carton « envois programmés ». */
.oc-sched-txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.oc-sched-subj { font-size: 13px; color: var(--color-ink); }
.oc-dim { font-size: 11.5px; color: var(--color-faint); }
.oc-spacer { flex: 1; }
</style>
