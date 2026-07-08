<script setup lang="ts">
// Fiche d'une organisation (plateforme) — page DÉDIÉE navigable `/platform/orgs/:id`
// (comme la fiche user `/platform/users/:sub`), montée par ConsoleLayout via
// `meta.detail === 'admin-org'`. Cockpit admin : profil / plan / membres / clés BYO /
// entitlements / options + entrée en CONSULTATION lecture (ADR 0023).
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import Dot from '@/components/console/Dot.vue'
import Avatar from '@/components/console/Avatar.vue'
import Dropzone from '@/components/console/Dropzone.vue'
import FormDialog from '@/components/console/FormDialog.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useFormDialog } from '@/composables/useFormDialog'
import { useMe, isSuperAdmin } from '@/composables/useMe'
import {
  getAdminOrg, archiveAdminOrg, addAdminOrgMember, setAdminOrgMemberRole,
  removeAdminOrgMember, putAdminOrgSecret, deleteAdminOrgSecret,
  grantOrgEntitlement, revokeOrgEntitlement, getConnectors, setOptionComp,
  updateOrg, uploadOrgLogo, deleteOrgLogo, adminSetPlan, getPlans,
} from '@/api/console'
import type { BillingPlan, ConnectorMeta, OrgDetail, OrgMember, OrgSecret, OrgEntitlement, OrgRole } from '@/types/api'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'
import { validateImage, IMAGE_ACCEPT_ATTR } from '@/lib/imageUpload'

const route = useRoute()
const router = useRouter()
const { toast } = useToast()
const { confirmAction } = usePrompt()
const { formDialog, formDialogOpen, openForm } = useFormDialog()
const { me } = useMe()

const orgId = computed(() => Number(route.params.id))
const detail = ref<OrgDetail | null>(null)
const catalog = ref<ConnectorMeta[]>([])
const plans = ref<BillingPlan[]>([])
const logoBusy = ref(false)
const error = ref<string | null>(null)
const loading = ref(true)

// Écriture sensible (profil, logo, plan comp) = super_admin seul — l'opérateur `admin`
// supervise en lecture (le backend renvoie 403 sinon : updateOrg/logo escaladent
// super_admin, adminSetPlan est SUPER_ADMIN). cf. useMe.ts.
const canWrite = computed(() => isSuperAdmin(me.value))

const nsOptions = computed(() =>
  [...new Set(catalog.value.filter((c) => c.availability === 'platform_granted').flatMap((c) => c.namespaces))],
)

async function refresh() { detail.value = await getAdminOrg(orgId.value) }

onMounted(async () => {
  try {
    const [d, cat, pl] = await Promise.all([
      getAdminOrg(orgId.value),
      getConnectors().catch(() => ({ connectors: [] })),
      getPlans().catch(() => ({ plans: [] })),
    ])
    detail.value = d
    catalog.value = cat.connectors
    plans.value = pl.plans
  } catch (e) { error.value = humanize(e) }
  finally { loading.value = false }
})

// Entrer dans l'org EN LECTURE (opérateur plateforme) via la consultation par URL
// (`/o/:id/…`, ADR 0023) : le backend autorise un non-membre en GET-only. Navigation
// dure (recharge `me` + sidebar). Sortie = bandeau ConsultOrgBanner.
function consultOrg() {
  window.location.assign(`/o/${orgId.value}/overview`)
}

async function archiveOrg() {
  if (!detail.value) return
  const name = detail.value.org.name
  if (!await confirmAction({
    title: 'archive organization', danger: true, confirmLabel: 'Archive',
    message: `archive "${name}"? it disappears from all listings and its members fall back to their other orgs. reversible in the database.`,
  })) return
  try {
    await archiveAdminOrg(orgId.value)
    toast(`org "${name}" archived`)
    router.push('/platform/orgs')
  } catch (e) { toast(humanize(e)) }
}

// ── profil de l'org (nom, domaine, secteur, localisation, logo) ──────────────
function editOrg() {
  if (!detail.value) return
  const o = detail.value.org
  openForm({
    title: 'éditer l\'organisation', submitLabel: 'enregistrer',
    fields: [
      { key: 'name', label: 'nom', initial: o.name ?? '', required: true },
      { key: 'description', label: 'description', type: 'textarea',
        placeholder: 'à quoi sert cette org (optionnel)', initial: o.description ?? '' },
      { key: 'domain', label: 'domaine', placeholder: 'acme.com',
        hint: 'domaine de marque — récupère aussi le logo (logo.dev) tant qu\'aucun n\'est uploadé',
        initial: o.domain ?? '' },
      { key: 'industry', label: 'secteur', placeholder: 'ex. logiciel, comptabilité (optionnel)',
        initial: o.industry ?? '' },
      { key: 'location', label: 'localisation', placeholder: 'ex. Paris, France (optionnel)',
        initial: o.location ?? '' },
    ],
    onConfirm: async (v) => {
      try {
        await updateOrg(orgId.value, {
          name: (v.name ?? '').trim(), description: v.description ?? '',
          domain: (v.domain ?? '').trim(), industry: (v.industry ?? '').trim(),
          location: (v.location ?? '').trim(),
        })
        await refresh()
        toast('organisation mise à jour')
      } catch (e) { toast(humanize(e)); throw e }
    },
  })
}
async function onLogoDrop(file: File) {
  try {
    validateImage(file) // miroir backend (png/jpeg/webp ≤ 2 Mo)
    logoBusy.value = true
    await uploadOrgLogo(orgId.value, file)
    await refresh()
    toast('logo mis à jour')
  } catch (err) { toast(humanize(err)) }
  finally { logoBusy.value = false }
}
async function removeLogo() {
  if (!await confirmAction({ title: 'retirer le logo', danger: true, confirmLabel: 'Retirer',
    message: 'retirer le logo de cette org ?' })) return
  try {
    logoBusy.value = true
    await deleteOrgLogo(orgId.value)
    await refresh()
    toast('logo retiré')
  } catch (err) { toast(humanize(err)) }
  finally { logoBusy.value = false }
}

// ── plan / abonnement (ADR 0043) ─────────────────────────────────────────────
// Le plan ouvre l'entitlement (options + plafond messagerie). `admin_set_plan` force
// un plan COMP (sans PSP, jamais facturé) ; on ne touche JAMAIS un abonnement payant
// depuis ici (le backend refuse admin_clear_plan dessus).
const billing = computed(() => detail.value?.billing ?? null)
const isCompPlan = computed(() => billing.value?.comp === true)
const isPaidPlan = computed(() => billing.value?.subscribed === true && billing.value?.comp === false)

function fmtAmount(p: BillingPlan): string {
  if (p.amount == null) return 'sur devis'
  return `${(p.amount / 100).toLocaleString('fr-FR')} €/${p.interval === 'year' ? 'an' : 'mois'}`
}
const currentPlanMeta = computed(() =>
  billing.value?.plan ? plans.value.find((p) => p.plan === billing.value?.plan) ?? null : null)

function forcePlan() {
  if (!plans.value.length) { toast('catalogue de plans indisponible'); return }
  openForm({
    title: 'forcer un plan (comp)',
    description: 'ouvre l\'entitlement du plan (options + plafond messagerie) immédiatement, sans paiement ni PSP. écrase l\'abonnement existant.',
    submitLabel: 'forcer le plan',
    fields: [
      { key: 'plan', label: 'plan', type: 'select', required: true,
        initial: billing.value?.plan,
        options: plans.value.map((p) => ({ value: p.plan, label: `${p.label} · ${fmtAmount(p)}` })) },
    ],
    onConfirm: async (v) => {
      try { await adminSetPlan(orgId.value, v.plan ?? ''); toast('plan forcé (comp)'); await refresh() }
      catch (e) { toast(humanize(e)); throw e }
    },
  })
}
async function clearPlan() {
  if (!await confirmAction({ title: 'retirer le plan comp', danger: true, confirmLabel: 'Retirer',
    message: 'retirer l\'abonnement comp de l\'org ? l\'entitlement du plan (options + plafond messagerie) tombe aussitôt.' })) return
  try { await adminSetPlan(orgId.value, null); toast('plan retiré'); await refresh() }
  catch (e) { toast(humanize(e)) }
}

// ── membres ──────────────────────────────────────────────────────────────────
function addMember() {
  openForm({
    title: 'add member', description: `to ${detail.value?.org.name}`, submitLabel: 'add',
    fields: [
      { key: 'target', label: 'email or sub', required: true, placeholder: 'user@example.com' },
      { key: 'role', label: 'role', type: 'select', initial: 'org_member',
        options: [{ value: 'org_member', label: 'member' }, { value: 'org_admin', label: 'admin' }] },
    ],
    onConfirm: async (v) => {
      try { await addAdminOrgMember(orgId.value, v.target ?? '', (v.role || 'org_member') as OrgRole); toast('member added'); await refresh() }
      catch (e) { toast(humanize(e)); throw e }
    },
  })
}
async function toggleMemberRole(m: OrgMember) {
  const next = m.role === 'org_admin' ? 'org_member' : 'org_admin'
  try { await setAdminOrgMemberRole(orgId.value, m.sub, next); toast('role updated'); await refresh() }
  catch (e) { toast(humanize(e)) }
}
async function removeMember(m: OrgMember) {
  if (!await confirmAction({ title: 'remove member', danger: true, confirmLabel: 'Remove', message: `remove ${m.email || m.sub}?` })) return
  try { await removeAdminOrgMember(orgId.value, m.sub); toast('member removed'); await refresh() }
  catch (e) { toast(humanize(e)) }
}

// ── clés BYO de l'org ─────────────────────────────────────────────────────────
function putSecret() {
  openForm({
    title: 'shared org key', description: 'inherited by every member of this org.', submitLabel: 'set key',
    fields: [
      { key: 'provider', label: 'provider', required: true, placeholder: 'e.g. attio, lemlist' },
      { key: 'api_key', label: 'api key', type: 'password', required: true, placeholder: 'paste the key' },
      { key: 'base_url', label: 'base url', placeholder: 'optional' },
    ],
    onConfirm: async (v) => {
      try { await putAdminOrgSecret(orgId.value, v.provider ?? '', v.api_key ?? '', v.base_url || undefined); toast(`${v.provider} key set`); await refresh() }
      catch (e) { toast(humanize(e)); throw e }
    },
  })
}
async function removeSecret(s: OrgSecret) {
  if (!await confirmAction({ title: 'remove shared key', danger: true, confirmLabel: 'Remove', message: `remove shared ${s.provider} key?` })) return
  try { await deleteAdminOrgSecret(orgId.value, s.provider); toast('shared key removed'); await refresh() }
  catch (e) { toast(humanize(e)) }
}

// ── entitlements (namespaces contrôlés) ──────────────────────────────────────
function grantEnt() {
  openForm({
    title: 'grant entitlement', description: 'unlock a controlled namespace for the whole org.', submitLabel: 'grant',
    fields: nsOptions.value.length
      ? [{ key: 'ns', label: 'namespace', type: 'select', required: true, placeholder: 'choose a namespace',
          options: nsOptions.value.map((n) => ({ value: n, label: n })) }]
      : [{ key: 'ns', label: 'namespace', required: true, hint: 'no controlled namespace in catalog — type one' }],
    onConfirm: async (v) => {
      try { await grantOrgEntitlement(orgId.value, v.ns ?? ''); toast(`granted ${v.ns}`); await refresh() }
      catch (e) { toast(humanize(e)); throw e }
    },
  })
}
async function revokeEnt(e0: OrgEntitlement) {
  if (!await confirmAction({ title: 'revoke entitlement', danger: true, confirmLabel: 'Revoke', message: `revoke ${e0.namespace}?` })) return
  try { await revokeOrgEntitlement(orgId.value, e0.namespace); toast('entitlement revoked'); await refresh() }
  catch (e) { toast(humanize(e)) }
}

// ── options de connecteur (couche 3, comp admin org-level) ───────────────────
const PAID_OPTIONS = [{ key: 'unipile', label: 'messagerie hébergée (unipile)' }]
const orgOptionComped = (opt: string) => detail.value?.option_comps?.includes(opt) ?? false
async function toggleOrgOption(opt: string) {
  const on = !orgOptionComped(opt)
  try {
    await setOptionComp('org', String(orgId.value), opt, on)
    toast(on ? `${opt} offert à l'org (comp)` : `${opt} retiré de l'org`)
    await refresh()
  } catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="content-inner fadein">
    <RouterLink class="linklike" to="/platform/orgs">← organizations</RouterLink>

    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>
    <p v-else-if="loading" class="helptext">chargement…</p>

    <template v-else-if="detail">
      <!-- En-tête de l'org : identité + actions transverses -->
      <div class="org-head">
        <div class="org-id">
          <Avatar :src="detail.org.logo_url" :name="detail.org.name" :size="40" shape="square" />
          <div>
            <h1>{{ detail.org.name }}</h1>
            <div class="org-sub">{{ detail.members.length }} membre{{ detail.members.length === 1 ? '' : 's' }}</div>
          </div>
        </div>
        <div class="org-actions">
          <Btn kind="mini" icon="eye" @click="consultOrg">Consulter (lecture)</Btn>
          <Btn v-if="canWrite" kind="danger" @click="archiveOrg">Archive org</Btn>
        </div>
      </div>

      <!-- Profil & abonnement -->
      <div class="grid2">
        <ConsoleCard title="général" sub="nom, logo, description et profil d'entreprise.">
          <template v-if="canWrite" #actions>
            <Btn kind="mini" icon="pen" @click="editOrg">éditer</Btn>
          </template>
          <div class="rowlist">
            <div>
              <div v-if="detail.org.domain || detail.org.industry || detail.org.location"
                style="font-size: 11.5px; color: var(--color-faint); display: flex; flex-wrap: wrap; gap: 4px 10px">
                <a v-if="detail.org.domain" :href="`https://${detail.org.domain}`" target="_blank" rel="noopener"
                  style="color: var(--color-mute); text-decoration: underline; text-underline-offset: 2px">{{ detail.org.domain }}</a>
                <span v-if="detail.org.industry">{{ detail.org.industry }}</span>
                <span v-if="detail.org.location">{{ detail.org.location }}</span>
              </div>
              <div v-if="detail.org.description" style="font-size: 12.5px; color: var(--color-mute); margin-top: 8px; white-space: pre-wrap">{{ detail.org.description }}</div>
              <div v-else class="helptext" style="margin-top: 8px">no description.</div>
            </div>

            <div v-if="canWrite" style="border-top: 1px solid var(--color-hair); padding-top: 12px">
              <div v-if="!detail.org.logo_custom && detail.org.domain && detail.org.logo_url" class="helptext" style="margin-bottom: 8px">
                logo dérivé de <strong>{{ detail.org.domain }}</strong> (logo.dev) — dépose-en un pour le remplacer.
              </div>
              <div v-else-if="!detail.org.logo_url" class="helptext" style="margin-bottom: 8px">
                aucun logo — renseigne un domaine dans « éditer » pour le récupérer, ou dépose-en un.
              </div>
              <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap">
                <Dropzone :accept="IMAGE_ACCEPT_ATTR" :max-size-mb="2" :busy="logoBusy"
                  :label="detail.org.logo_custom ? 'changer le logo' : 'déposer un logo'"
                  hint="png, jpeg ou webp · max 2 Mo"
                  @select="onLogoDrop" @error="toast" />
                <Btn v-if="detail.org.logo_custom" kind="danger" :disabled="logoBusy" @click="removeLogo">retirer le logo</Btn>
              </div>
            </div>
          </div>
        </ConsoleCard>

        <ConsoleCard title="plan / abonnement" sub="le plan ouvre l'entitlement (options + plafond messagerie). « comp » = forcé par un admin, jamais facturé.">
          <template v-if="canWrite" #actions>
            <Btn kind="mini" icon="pen" @click="forcePlan">{{ billing?.subscribed ? 'changer' : 'forcer un plan' }}</Btn>
          </template>
          <div class="rowlist">
            <div v-if="billing?.subscribed" style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap">
              <div style="min-width: 0; flex: 1">
                <div style="font-weight: 600; font-size: 15px; color: var(--color-ink)">
                  {{ billing.label || currentPlanMeta?.label || billing.plan }}
                </div>
                <div class="helptext" style="margin: 2px 0 0">
                  <span v-if="currentPlanMeta">{{ fmtAmount(currentPlanMeta) }}</span>
                  <span v-if="billing.current_period_end"> · échéance {{ fmtDate(billing.current_period_end) }}</span>
                </div>
              </div>
              <Tag :tone="isCompPlan ? 'saffron' : 'olive'">{{ isCompPlan ? 'comp' : (billing.method === 'sepa' ? 'sepa' : 'payé') }}</Tag>
              <Tag v-if="billing.status && billing.status !== 'active'" tone="terra">{{ billing.status }}</Tag>
            </div>
            <div v-else class="helptext" style="margin: 0">aucun plan — l'org est sur la gratuité (pas d'options débloquées par un plan).</div>

            <div v-if="canWrite && isCompPlan" style="border-top: 1px solid var(--color-hair); padding-top: 12px; display: flex; justify-content: flex-end">
              <Btn kind="danger" @click="clearPlan">Retirer le plan comp</Btn>
            </div>
            <div v-else-if="isPaidPlan" class="helptext" style="border-top: 1px solid var(--color-hair); padding-top: 12px; margin: 0">
              abonnement payant — la résiliation passe par l'org (facturation), pas par l'admin.
            </div>
          </div>
        </ConsoleCard>
      </div>

      <!-- Membres -->
      <ConsoleCard flush title="membres" sub="rôles dans l'org (org_admin gère l'org ; org_member consomme).">
        <template #actions><Btn kind="mini" icon="plus" @click="addMember">Add member</Btn></template>
        <table class="tbl">
          <thead><tr><th>member</th><th>role</th><th>active</th><th style="width: 140px"></th></tr></thead>
          <tbody>
            <tr v-for="m in detail.members" :key="m.sub">
              <td>
                <div style="font-weight: 600; color: var(--color-ink)">{{ m.name || m.email }}</div>
                <div style="font-size: 11px; color: var(--color-faint)">{{ m.email }}</div>
              </td>
              <td><Tag v-if="m.role === 'org_admin'" tone="ink">admin</Tag><Tag v-else>member</Tag></td>
              <td><Dot :tone="m.active ? 'olive' : 'faint'" :size="7" /></td>
              <td style="text-align: right; white-space: nowrap">
                <Btn kind="mini" @click="toggleMemberRole(m)">{{ m.role === 'org_admin' ? 'Demote' : 'Promote' }}</Btn>
                <Btn kind="danger" @click="removeMember(m)">Remove</Btn>
              </td>
            </tr>
            <tr v-if="!detail.members.length"><td colspan="4" class="dim" style="text-align: center; padding: 16px">no members</td></tr>
          </tbody>
        </table>
      </ConsoleCard>

      <!-- Accès partagés : ce dont héritent tous les membres -->
      <div class="eyebrow" style="margin-top: 4px">accès partagés</div>
      <ConsoleCard title="clés BYO de l'org" sub="credentials posés par l'org, hérités par chaque membre.">
        <template #actions><Btn kind="mini" icon="plus" @click="putSecret">Add key</Btn></template>
        <div class="rowlist">
          <div v-for="s in detail.secrets" :key="s.provider" class="rowitem" style="gap: 12px">
            <Dot tone="olive" :size="8" />
            <div style="min-width: 0; flex: 1">
              <div style="font-weight: 600; font-size: 13px">{{ s.provider }}</div>
              <div style="font-size: 11.5px; color: var(--color-mute)">{{ s.base_url || 'set' }}{{ s.set_at ? ` · ${fmtDate(s.set_at)}` : '' }}</div>
            </div>
            <Btn kind="danger" @click="removeSecret(s)">Remove</Btn>
          </div>
          <div v-if="!detail.secrets.length" class="helptext">no shared keys yet.</div>
        </div>
      </ConsoleCard>

      <!-- Débloqués : ce que l'org a le droit d'utiliser -->
      <div class="eyebrow" style="margin-top: 4px">débloqués</div>
      <div class="grid2">
        <ConsoleCard title="entitlements" sub="namespaces contrôlés débloqués pour toute l'org.">
          <template #actions><Btn kind="mini" icon="plus" @click="grantEnt">Grant</Btn></template>
          <div class="rowlist">
            <div v-for="e in (detail.entitlements ?? [])" :key="e.namespace" class="rowitem" style="gap: 12px">
              <div style="min-width: 0; flex: 1"><Tag tone="cobalt">{{ e.namespace }}</Tag></div>
              <span v-if="e.granted_at" class="dim" style="font-size: 11px">{{ fmtDate(e.granted_at) }}</span>
              <Btn kind="danger" @click="revokeEnt(e)">Revoke</Btn>
            </div>
            <div v-if="!(detail.entitlements ?? []).length" class="helptext">no entitlements granted.</div>
          </div>
        </ConsoleCard>

        <ConsoleCard title="options de connecteur" sub="accorder une option de connecteur à toute l'org (comp admin). couvre tous ses membres.">
          <div class="rowlist">
            <div v-for="o in PAID_OPTIONS" :key="o.key" class="rowitem" style="gap: 12px">
              <div style="min-width: 0; flex: 1; font-weight: 600; color: var(--color-ink)">{{ o.label }}</div>
              <Tag :tone="orgOptionComped(o.key) ? 'olive' : undefined">{{ orgOptionComped(o.key) ? 'offerte (comp)' : 'non offerte' }}</Tag>
              <Btn :kind="orgOptionComped(o.key) ? 'danger' : 'mini'" @click="toggleOrgOption(o.key)">
                {{ orgOptionComped(o.key) ? 'Retirer' : 'Accorder l\'option' }}
              </Btn>
            </div>
          </div>
        </ConsoleCard>
      </div>
    </template>

    <FormDialog v-if="formDialog" v-model:open="formDialogOpen"
      :title="formDialog.title" :description="formDialog.description"
      :fields="formDialog.fields" :submit-label="formDialog.submitLabel" :on-confirm="formDialog.onConfirm" />
  </div>
</template>

<style scoped>
.org-head {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  margin: 6px 0 4px;
}
.org-id { display: flex; align-items: center; gap: 12px; min-width: 0; }
.org-id h1 { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; color: var(--color-ink); }
.org-sub { font-size: 12.5px; color: var(--color-mute); }
.org-actions { display: flex; gap: 10px; flex: none; }
</style>
