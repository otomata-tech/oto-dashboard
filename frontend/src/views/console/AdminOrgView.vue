<script setup lang="ts">
// Fiche org (admin plateforme) — vraie SOUS-PAGE /platform/orgs/:id (résolue par
// ConsoleLayout via meta.detail='admin-org', même patron que la fiche user), fin du
// master-détail empilé sous la liste (refonte /platform 2026-07-23).
import { computed, onMounted, ref, watch } from 'vue'
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
import { useMe, isSuperAdmin, isPlatformOperator } from '@/composables/useMe'
import {
  getAdminOrg, archiveAdminOrg, addAdminOrgMember, setAdminOrgMemberRole,
  removeAdminOrgMember, updateOrg, uploadOrgLogo, deleteOrgLogo,
  adminSetPlan, getPlans,
} from '@/api/console'
import type { BillingPlan, OrgDetail, OrgMember, OrgRole } from '@/types/api'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'
import { validateImage, IMAGE_ACCEPT_ATTR } from '@/lib/imageUpload'

const { toast } = useToast()
const { confirmAction } = usePrompt()
const { formDialog, formDialogOpen, openForm } = useFormDialog()
const { me } = useMe()
const route = useRoute()
const router = useRouter()

const orgId = computed(() => Number(route.params.id))
const detail = ref<OrgDetail | null>(null)
const plans = ref<BillingPlan[]>([])
const logoBusy = ref(false)
const error = ref<string | null>(null)

// Écriture sensible (profil org, logo, plan comp) = super_admin seul — l'opérateur
// `admin` supervise en lecture (le backend renvoie 403 sinon, cf. useMe.ts).
const canWrite = computed(() => isSuperAdmin(me.value))
// Un opérateur plateforme peut REJOINDRE une org tierce en org_admin (chemin admin
// `POST /api/admin/orgs/{id}/members`, escalade `ORG_ADMIN_OF`) → devient membre RÉEL,
// ce qui lève la garde read-only de l'inspection (ViewAsMiddleware) et ouvre l'écriture
// (clés d'org, settings). Trace visible : il apparaît dans les membres de l'org.
const isOperator = computed(() => isPlatformOperator(me.value))
const myMembership = computed(() =>
  detail.value?.members.find((m) => m.sub === me.value?.sub) ?? null)

const isPersonalOrg = computed(() => detail.value?.org.personal === true)

async function refresh() { detail.value = await getAdminOrg(orgId.value) }

async function loadAll() {
  error.value = null
  try {
    const [, pk] = await Promise.all([
      refresh(),
      getPlans().catch(() => ({ plans: [] })),
    ])
    plans.value = pk.plans
  } catch (e) { error.value = humanize(e) }
}
onMounted(loadAll)
watch(orgId, loadAll)

// Entrer dans l'org (LECTURE SEULE, opérateur plateforme) : navigue vers la console
// scopée `/o/:orgId/…`. Le backend autorise la consultation read-only d'une org tierce
// (ViewAsMiddleware) ; toute la console org rend alors la vue de cette org, en lecture.
function enterOrg() {
  router.push(`/o/${orgId.value}/overview`)
}

async function archiveOrg() {
  if (!detail.value) return
  const name = detail.value.org.name
  if (!await confirmAction({
    title: "archiver l'organisation", danger: true, confirmLabel: 'Archiver',
    message: `archiver « ${name} » ? elle disparaît de tous les listings et ses membres retombent sur leurs autres orgs. réversible en base.`,
  })) return
  try {
    await archiveAdminOrg(orgId.value)
    toast(`org « ${name} » archivée`)
    router.push('/platform/orgs')
  } catch (e) { toast(humanize(e)) }
}

// ── profil de l'org (nom, domaine, secteur, localisation, logo) ──────────────
function editOrg() {
  if (!detail.value) return
  const o = detail.value.org
  openForm({
    title: 'éditer l\'organisation',
    submitLabel: 'enregistrer',
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

// ── membres ──────────────────────────────────────────────────────────────────
function addMember() {
  openForm({
    title: 'ajouter un membre', description: `à ${detail.value?.org.name}`,
    submitLabel: 'ajouter',
    fields: [
      { key: 'target', label: 'email ou sub', required: true, placeholder: 'user@example.com' },
      { key: 'role', label: 'rôle', type: 'select', initial: 'org_member',
        options: [{ value: 'org_member', label: 'membre' }, { value: 'org_admin', label: 'admin' }] },
    ],
    onConfirm: async (v) => {
      try { await addAdminOrgMember(orgId.value, v.target ?? '', (v.role || 'org_member') as OrgRole); toast('membre ajouté'); await refresh() }
      catch (e) { toast(humanize(e)); throw e }
    },
  })
}
async function toggleMemberRole(m: OrgMember) {
  const next = m.role === 'org_admin' ? 'org_member' : 'org_admin'
  try { await setAdminOrgMemberRole(orgId.value, m.sub, next); toast('rôle mis à jour'); await refresh() }
  catch (e) { toast(humanize(e)) }
}
async function removeMember(m: OrgMember) {
  if (!await confirmAction({ title: 'retirer le membre', danger: true, confirmLabel: 'Retirer', message: `retirer ${m.email || m.sub} ?` })) return
  try { await removeAdminOrgMember(orgId.value, m.sub); toast('membre retiré'); await refresh() }
  catch (e) { toast(humanize(e)) }
}
async function joinAsAdmin() {
  if (!me.value) return
  const name = detail.value?.org.name ?? 'cette org'
  if (!await confirmAction({
    title: 'Rejoindre en org_admin',
    confirmLabel: 'Rejoindre',
    message: `Devenir org_admin de « ${name} » : tu apparaîtras dans ses membres (trace visible par l'org) et pourras écrire (clés d'org, settings). Retire-toi après si besoin.`,
  })) return
  try { await addAdminOrgMember(orgId.value, me.value.sub, 'org_admin'); toast(`tu es org_admin de ${name}`); await refresh() }
  catch (e) { toast(humanize(e)) }
}
async function leaveOrg() {
  if (!me.value) return
  const name = detail.value?.org.name ?? 'cette org'
  if (!await confirmAction({
    title: 'Quitter l\'org', danger: true, confirmLabel: 'Quitter',
    message: `Te retirer des membres de « ${name} » ? Tu repasses en inspection lecture seule.`,
  })) return
  try { await removeAdminOrgMember(orgId.value, me.value.sub); toast(`tu as quitté ${name}`); await refresh() }
  catch (e) { toast(humanize(e)) }
}

// ── plan / abonnement (ADR 0043) ─────────────────────────────────────────────
// Le plan pilote l'entitlement (options + plafond messagerie). `admin_set_plan`
// force un plan COMP (sans PSP, jamais facturé) ; on ne touche JAMAIS un
// abonnement payant depuis ici (le backend refuse admin_clear_plan dessus).
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

// ── accès plateforme aux connecteurs (ADR 0044 §H) — LECTURE SEULE ───────────
// L'octroi (clé plateforme + option) est connecteur-centrique : il se gère sur la
// carte du connecteur (/platform/connectors → « Gérer l'accès »), plus ici. On se
// contente d'AFFICHER ce que la plateforme a ouvert à cette org (option_comps).
const orgOptions = computed(() => detail.value?.option_comps ?? [])
</script>

<template>
  <div class="content-inner fadein">
    <RouterLink class="linklike" to="/platform/orgs">← orgs</RouterLink>
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <template v-if="detail">
      <div class="grid2">
        <!-- Profil de l'org : identité + logo (dérivé du domaine ou uploadé) + zone danger. -->
        <ConsoleCard title="général" sub="nom, logo, description et profil d'entreprise.">
          <template v-if="canWrite" #actions>
            <Btn kind="mini" icon="pen" @click="editOrg">éditer</Btn>
          </template>
          <div class="rowlist">
            <div>
              <div style="display: flex; align-items: center; gap: 10px">
                <Avatar :src="detail.org.logo_url" :name="detail.org.name" :size="34" shape="square" />
                <div>
                  <div style="font-weight: 600; font-size: 15px; color: var(--color-ink)">{{ detail.org.name }}</div>
                  <div v-if="detail.org.domain || detail.org.industry || detail.org.location"
                    style="font-size: 11.5px; color: var(--color-faint); display: flex; flex-wrap: wrap; gap: 4px 10px; margin-top: 2px">
                    <a v-if="detail.org.domain" :href="`https://${detail.org.domain}`" target="_blank" rel="noopener"
                      style="color: var(--color-mute); text-decoration: underline; text-underline-offset: 2px">{{ detail.org.domain }}</a>
                    <span v-if="detail.org.industry">{{ detail.org.industry }}</span>
                    <span v-if="detail.org.location">{{ detail.org.location }}</span>
                  </div>
                </div>
              </div>
              <div v-if="detail.org.description" style="font-size: 12.5px; color: var(--color-mute); margin-top: 8px; white-space: pre-wrap">{{ detail.org.description }}</div>
              <div v-else class="helptext" style="margin-top: 8px">aucune description.</div>
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

            <div v-if="canWrite && !isPersonalOrg" style="border-top: 1px solid var(--color-hair); padding-top: 12px">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap">
                <div class="helptext" style="margin: 0">archive (soft-delete) cet espace — réversible en base, données conservées.</div>
                <Btn kind="danger" @click="archiveOrg">Archiver l'org</Btn>
              </div>
            </div>
          </div>
        </ConsoleCard>

        <!-- Plan / abonnement : forcer un plan comp (entitlement immédiat, sans PSP). -->
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

      <ConsoleCard flush :title="`${detail.org.name} · membres`">
        <template #actions>
          <Btn kind="mini" icon="eye" @click="enterOrg">{{ myMembership ? 'Entrer' : 'Entrer (lecture seule)' }}</Btn>
          <Btn v-if="isOperator && !myMembership" kind="mini" icon="shield" @click="joinAsAdmin">Rejoindre en admin</Btn>
          <Btn v-else-if="isOperator && myMembership" kind="mini" icon="log-out" @click="leaveOrg">Quitter</Btn>
          <Btn kind="mini" icon="plus" @click="addMember">Ajouter un membre</Btn>
        </template>
        <table class="tbl">
          <thead><tr><th>membre</th><th>rôle</th><th>actif</th><th style="width: 140px"></th></tr></thead>
          <tbody>
            <tr v-for="m in detail.members" :key="m.sub">
              <td>
                <div style="font-weight: 600; color: var(--color-ink)">{{ m.name || m.email }}</div>
                <div style="font-size: 11px; color: var(--color-faint)">{{ m.email }}</div>
              </td>
              <td><Tag v-if="m.role === 'org_admin'" tone="ink">admin</Tag><Tag v-else>membre</Tag></td>
              <td><Dot :tone="m.active ? 'olive' : 'faint'" :size="7" /></td>
              <td style="text-align: right; white-space: nowrap">
                <Btn kind="mini" @click="toggleMemberRole(m)">{{ m.role === 'org_admin' ? 'Rétrograder' : 'Promouvoir' }}</Btn>
                <Btn kind="danger" @click="removeMember(m)">Retirer</Btn>
              </td>
            </tr>
            <tr v-if="!detail.members.length"><td colspan="4" class="dim" style="text-align: center; padding: 16px">aucun membre</td></tr>
          </tbody>
        </table>
      </ConsoleCard>

      <ConsoleCard title="accès plateforme aux connecteurs"
        sub="connecteurs que la plateforme a ouverts à cette org (clé + option). L'octroi se gère sur la carte du connecteur, dans « connecteurs » (plateforme).">
        <div class="rowlist">
          <div v-for="opt in orgOptions" :key="opt" class="rowitem" style="gap: 12px">
            <div style="min-width: 0; flex: 1; font-weight: 600; color: var(--color-ink)">{{ opt }}</div>
            <Tag tone="olive">ouvert (comp)</Tag>
          </div>
          <div v-if="!orgOptions.length" class="helptext" style="margin: 0">
            aucun accès plateforme spécifique — l'org utilise les connecteurs en libre-service et ses propres clés.
          </div>
        </div>
      </ConsoleCard>
    </template>

    <FormDialog v-if="formDialog" v-model:open="formDialogOpen"
      :title="formDialog.title" :description="formDialog.description"
      :fields="formDialog.fields" :submit-label="formDialog.submitLabel" :on-confirm="formDialog.onConfirm" />
  </div>
</template>
