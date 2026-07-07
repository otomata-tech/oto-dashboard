<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Dot from '@/components/console/Dot.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import Avatar from '@/components/console/Avatar.vue'
import Dropzone from '@/components/console/Dropzone.vue'
import FormDialog from '@/components/console/FormDialog.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useFormDialog } from '@/composables/useFormDialog'
import { useMe } from '@/composables/useMe'
import AgentReadmeCard from '@/components/console/AgentReadmeCard.vue'
import OrgMfaCard from '@/components/console/OrgMfaCard.vue'
import { getOrg, setOrgMemberRole, removeOrgMember,
  listInvitations, inviteMember, revokeInvitation, uploadOrgLogo, deleteOrgLogo, updateOrg, archiveOrg,
  getInstruction, putInstruction } from '@/api/console'
import type { OrgDetail, OrgInvitation, OrgRole } from '@/types/api'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'
import { validateImage, IMAGE_ACCEPT_ATTR } from '@/lib/imageUpload'

const { toast } = useToast()
const { confirmAction } = usePrompt()
const { formDialog, formDialogOpen, openForm } = useFormDialog()
// Dialog séparé pour la révélation lien/code (évite la course de fermeture du 1er).
const { formDialog: revealDialog, formDialogOpen: revealOpen, openForm: openReveal } = useFormDialog()
const { me, reload: reloadMe } = useMe()

const detail = ref<OrgDetail | null>(null)
const invites = ref<OrgInvitation[]>([])
const error = ref<string | null>(null)
const loaded = ref(false)
const logoBusy = ref(false)

const isOrgAdmin = computed(() => detail.value?.org.my_role === 'org_admin')

// Agent readme de L'ORG (ex-« doctrine de base », slug réservé claude_md) : prose
// injectée au début de chaque session des membres. Stockage versionné org_instructions.
const README_SLUG = 'claude_md'
const loadOrgReadme = () => getInstruction(README_SLUG)
const saveOrgReadme = (body: string) => putInstruction(README_SLUG, body, 'agent readme')
const activeOrgId = computed(() => me.value?.active_org ?? null)
const meSub = computed(() => me.value?.sub ?? null)

async function loadInvites() {
  if (!isOrgAdmin.value || activeOrgId.value == null) { invites.value = []; return }
  try { invites.value = (await listInvitations(activeOrgId.value)).invitations }
  catch { invites.value = [] }
}

async function load() {
  try {
    if (activeOrgId.value != null) {
      detail.value = await getOrg(activeOrgId.value)
      await loadInvites()
    }
  } catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
}
onMounted(load)

function invite() {
  openForm({
    title: 'invite a teammate',
    description: 'send them an email link, or get a code to share yourself.',
    submitLabel: 'create invite',
    fields: [
      { key: 'email', label: 'email (optional)', placeholder: 'name@company.com',
        hint: 'leave blank to get a code to share yourself' },
      { key: 'role', label: 'role', type: 'select', initial: 'org_member',
        options: [{ value: 'org_member', label: 'member' }, { value: 'org_admin', label: 'admin' }] },
      { key: 'delivery', label: 'how', type: 'select', initial: 'mail',
        options: [{ value: 'mail', label: 'send by email' }, { value: 'code', label: 'give me a code to share' }] },
    ],
    onConfirm: async (v) => {
      const sendMail = v.delivery !== 'code'
      const email = (v.email || '').trim()
      if (sendMail && !email) { toast('an email is required to send by email'); throw new Error('email required') }
      const role: OrgRole = v.role === 'org_admin' ? 'org_admin' : 'org_member'
      try {
        const res = await inviteMember(activeOrgId.value!, email || null, role, sendMail)
        if (res.emailed) {
          toast(`invite sent to ${res.email}`)
        } else {
          openReveal({
            title: 'share this invite yourself',
            description: 'send this link (or code) to the person — it joins them to this org.',
            submitLabel: 'done',
            fields: [
              { key: 'url', label: 'invite link', initial: res.invite_url },
              { key: 'code', label: 'code', initial: res.code },
            ],
            onConfirm: async () => {},
          })
        }
        await loadInvites()
      } catch (e) { toast(humanize(e)); throw e }
    },
  })
}
async function revokeInv(id: number) {
  if (!await confirmAction({ title: 'revoke invitation', danger: true, confirmLabel: 'revoke', message: 'revoke this pending invitation?' })) return
  try { await revokeInvitation(activeOrgId.value!, id); toast('invitation revoked'); await loadInvites() }
  catch (e) { toast(humanize(e)) }
}

async function toggleRole(sub: string, role: string) {
  const next = role === 'org_admin' ? 'org_member' : 'org_admin'
  try { await setOrgMemberRole(activeOrgId.value!, sub, next); toast('role updated'); detail.value = await getOrg(activeOrgId.value!) }
  catch (e) { toast(humanize(e)) }
}
async function removeMember(sub: string, label: string) {
  if (!await confirmAction({ title: 'remove member', danger: true, confirmLabel: 'remove',
    message: `remove ${label} from this org? they lose access to its shared keys and tools.` })) return
  try { await removeOrgMember(activeOrgId.value!, sub); toast('member removed'); detail.value = await getOrg(activeOrgId.value!) }
  catch (e) { toast(humanize(e)) }
}
function editOrg() {
  if (activeOrgId.value == null) return
  openForm({
    title: 'edit organization',
    submitLabel: 'save',
    fields: [
      { key: 'name', label: 'name', initial: detail.value?.org.name ?? '', required: true },
      { key: 'description', label: 'description', type: 'textarea',
        placeholder: 'what this org is for (optional)', initial: detail.value?.org.description ?? '' },
      { key: 'domain', label: 'domain', placeholder: 'acme.com',
        hint: 'your company domain — also fetches your logo automatically (logo.dev) when none is uploaded',
        initial: detail.value?.org.domain ?? '' },
      { key: 'industry', label: 'industry', placeholder: 'e.g. software, accounting, retail (optional)',
        initial: detail.value?.org.industry ?? '' },
      { key: 'location', label: 'location', placeholder: 'e.g. Paris, France (optional)',
        initial: detail.value?.org.location ?? '' },
    ],
    onConfirm: async (v) => {
      try {
        await updateOrg(activeOrgId.value!, {
          name: (v.name ?? '').trim(), description: v.description ?? '',
          domain: (v.domain ?? '').trim(), industry: (v.industry ?? '').trim(),
          location: (v.location ?? '').trim(),
        })
        detail.value = await getOrg(activeOrgId.value!)
        await reloadMe()          // rafraîchit nom + logo dans le badge identité (sidebar)
        toast('organization updated')
      } catch (e) { toast(humanize(e)); throw e }
    },
  })
}

async function onLogoDrop(file: File) {
  if (activeOrgId.value == null) return
  try {
    validateImage(file) // miroir backend (png/jpeg/webp ≤ 2 Mo) — le Dropzone pré-valide déjà
    logoBusy.value = true
    await uploadOrgLogo(activeOrgId.value, file)
    detail.value = await getOrg(activeOrgId.value)
    await reloadMe()          // rafraîchit le logo dans le badge identité (topbar)
    toast('org logo updated')
  } catch (err) { toast(humanize(err)) }
  finally { logoBusy.value = false }
}
async function removeLogo() {
  if (activeOrgId.value == null) return
  if (!await confirmAction({ title: 'remove org logo', danger: true, confirmLabel: 'remove', message: 'remove this organization logo?' })) return
  try {
    logoBusy.value = true
    await deleteOrgLogo(activeOrgId.value)
    detail.value = await getOrg(activeOrgId.value)
    await reloadMe()
    toast('org logo removed')
  } catch (err) { toast(humanize(err)) }
  finally { logoBusy.value = false }
}

// Suppression (archivage réversible) de l'org — org_admin, jamais l'espace perso.
const isPersonalOrg = computed(() => detail.value?.org.personal === true)
async function deleteOrg() {
  if (activeOrgId.value == null) return
  const label = detail.value?.org.name || 'this org'
  if (!await confirmAction({ title: 'supprimer l\'organisation', danger: true, confirmLabel: 'supprimer',
    message: `supprimer « ${label} » ? elle disparaît pour tous ses membres, qui retombent sur leurs autres espaces. les données sont conservées et un admin oto peut la restaurer.` })) return
  try {
    await archiveOrg(activeOrgId.value)
    await reloadMe()            // l'org active a rebasculé → rafraîchit le badge identité
    toast('organisation supprimée')
    // Repart d'un contexte propre (la vue est scopée sur l'org active, désormais changée).
    window.location.assign('/console')
  } catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <ConsoleCard v-if="loaded && activeOrgId == null" title="no active org">
      <div class="helptext">you're not in an organization yet. an org admin can invite you, or the studio can create one.</div>
    </ConsoleCard>

    <template v-else>
      <div class="grid23">
        <ConsoleCard title="members" flush sub="people in your active org — plus pending invites. shared keys & connector governance live in « connectors ».">
          <template v-if="isOrgAdmin" #actions>
            <Btn kind="mini" icon="plus" @click="invite">Ajouter</Btn>
          </template>
          <table class="tbl">
            <thead><tr><th>member</th><th>role</th><th>active</th><th v-if="isOrgAdmin" style="width: 150px"></th></tr></thead>
            <tbody>
              <tr v-for="m in detail?.members ?? []" :key="m.sub">
                <td>
                  <div style="display: flex; align-items: center; gap: 9px">
                    <Avatar :src="m.avatar_url" :name="m.name || m.email" :size="28" />
                    <div>
                      <div style="font-weight: 600; color: var(--color-ink)">{{ m.name || m.email }}</div>
                      <div style="font-size: 11px; color: var(--color-faint)">{{ m.email }}</div>
                    </div>
                  </div>
                </td>
                <td><Tag v-if="m.role === 'org_admin'" tone="ink">admin</Tag><Tag v-else>member</Tag></td>
                <td><Dot :tone="m.active ? 'olive' : 'faint'" :size="7" /></td>
                <td v-if="isOrgAdmin" style="text-align: right">
                  <div v-if="m.sub !== meSub" style="display: flex; gap: 6px; justify-content: flex-end">
                    <Btn kind="mini" @click="toggleRole(m.sub, m.role)">{{ m.role === 'org_admin' ? 'demote' : 'promote' }}</Btn>
                    <Btn kind="danger" @click="removeMember(m.sub, m.name || m.email || 'this member')">remove</Btn>
                  </div>
                  <span v-else class="dim" style="font-size: 11px">you</span>
                </td>
              </tr>
              <!-- Invitations en attente = lignes de la même liste (pas de carte séparée) :
                   « rejoindront l'org au clic sur le lien ». Admin only (loadInvites gaté). -->
              <tr v-for="iv in invites" :key="iv.id">
                <td>
                  <div style="display: flex; align-items: center; gap: 9px">
                    <Avatar :name="iv.email" :size="28" />
                    <div>
                      <div style="font-weight: 600; color: var(--color-ink); display: flex; gap: 6px; align-items: center">
                        {{ iv.email }} <Tag tone="saffron">invité</Tag>
                      </div>
                      <div style="font-size: 11px; color: var(--color-faint)">invité {{ fmtDate(iv.created_at) }} · expire {{ fmtDate(iv.expires_at) }}</div>
                    </div>
                  </div>
                </td>
                <td><Tag v-if="iv.org_role === 'org_admin'" tone="ink">admin</Tag><Tag v-else>member</Tag></td>
                <td><Dot tone="saffron" :size="7" /></td>
                <td v-if="isOrgAdmin" style="text-align: right">
                  <Btn kind="danger" @click="revokeInv(iv.id)">revoke</Btn>
                </td>
              </tr>
            </tbody>
          </table>
        </ConsoleCard>

        <div style="display: flex; flex-direction: column; gap: 16px">
          <ConsoleCard title="general" sub="name, logo, description and company profile of your active org.">
            <template v-if="isOrgAdmin" #actions>
              <Btn kind="mini" icon="pen" @click="editOrg">edit</Btn>
            </template>
            <div class="rowlist">
              <div>
                <div style="display: flex; align-items: center; gap: 10px">
                  <Avatar :src="detail?.org.logo_url" :name="detail?.org.name" :size="34" shape="square" />
                  <div>
                    <div style="font-weight: 600; font-size: 15px; color: var(--color-ink)">{{ detail?.org.name }}</div>
                    <div v-if="detail?.org.domain || detail?.org.industry || detail?.org.location"
                      style="font-size: 11.5px; color: var(--color-faint); display: flex; flex-wrap: wrap; gap: 4px 10px; margin-top: 2px">
                      <a v-if="detail?.org.domain" :href="`https://${detail.org.domain}`" target="_blank" rel="noopener"
                        style="color: var(--color-mute); text-decoration: underline; text-underline-offset: 2px">{{ detail.org.domain }}</a>
                      <span v-if="detail?.org.industry">{{ detail.org.industry }}</span>
                      <span v-if="detail?.org.location">{{ detail.org.location }}</span>
                    </div>
                  </div>
                </div>
                <div v-if="detail?.org.description" style="font-size: 12.5px; color: var(--color-mute); margin-top: 8px; white-space: pre-wrap">{{ detail.org.description }}</div>
                <div v-else class="helptext" style="margin-top: 8px">
                  {{ isOrgAdmin ? 'no description yet — add one to tell teammates what this org is for.' : 'no description.' }}
                </div>
              </div>

              <!-- Logo : dérivé du domaine (logo.dev) par défaut, upload = override. Fusionné
                   depuis l'ex-carte « branding » — le domaine de « general » couvre le cas courant,
                   l'upload n'est qu'un repli, on ne lui dédie plus une carte. -->
              <div v-if="isOrgAdmin" style="border-top: 1px solid var(--color-hair); padding-top: 12px">
                <div v-if="!detail?.org.logo_custom && detail?.org.domain && detail?.org.logo_url" class="helptext" style="margin-bottom: 8px">
                  logo dérivé de <strong>{{ detail.org.domain }}</strong> (logo.dev) — dépose-en un pour le remplacer.
                </div>
                <div v-else-if="!detail?.org.logo_url" class="helptext" style="margin-bottom: 8px">
                  aucun logo — renseigne un domaine dans « edit » pour le récupérer automatiquement, ou dépose-en un.
                </div>
                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap">
                  <Dropzone :accept="IMAGE_ACCEPT_ATTR" :max-size-mb="2" :busy="logoBusy"
                    :label="detail?.org.logo_custom ? 'changer le logo' : 'déposer un logo'"
                    hint="png, jpeg ou webp · max 2 Mo"
                    @select="onLogoDrop" @error="toast" />
                  <Btn v-if="detail?.org.logo_custom" kind="danger" :disabled="logoBusy" @click="removeLogo">remove logo</Btn>
                </div>
              </div>

              <!-- Zone danger : archivage réversible de l'org (jamais l'espace perso).
                   Symétrique de « edit » — org_admin seulement. -->
              <div v-if="isOrgAdmin && !isPersonalOrg" style="border-top: 1px solid var(--color-hair); padding-top: 12px">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap">
                  <div class="helptext" style="margin: 0">
                    supprime cet espace pour tous ses membres — réversible par un admin oto, données conservées.
                  </div>
                  <Btn kind="danger" @click="deleteOrg">supprimer l'organisation</Btn>
                </div>
              </div>
            </div>
          </ConsoleCard>
          <ConsoleCard v-if="detail?.entitlements?.length" title="entitlements" sub="controlled namespaces unlocked for this org.">
            <div class="rowlist">
              <div v-for="e in detail.entitlements" :key="e.namespace" class="rowitem">
                <Tag tone="cobalt">{{ e.namespace }}</Tag>
                <span style="margin-left: auto; font-size: 11px; color: var(--color-faint)">{{ fmtDate(e.granted_at) }}</span>
              </div>
            </div>
          </ConsoleCard>
        </div>
      </div>

      <!-- Niveau ORG du concept agent_readme (ex-« doctrine de base ») : injecté à
           chaque session de chaque membre, cumulé avant équipe et user. -->
      <AgentReadmeCard title="agent readme · organisation"
        :sub="'la prose de l\'org (contexte métier, règles, vocabulaire), injectée au début de chaque session de chaque membre. variables : {{org}} {{user}} {{équipe}} {{connecteurs_actifs}}. les procédures (chargées à la demande) vivent dans « procédures ».'"
        :can-edit="isOrgAdmin"
        placeholder="ex. nous vendons des audits RGPD à des ETI ; toujours vérifier le SIREN via fr_get avant d'écrire au CRM."
        :load="loadOrgReadme" :save="saveOrgReadme" />

      <!-- MFA obligatoire de l'org (org_admin bascule ; enforcé par Logto au login). -->
      <OrgMfaCard v-if="activeOrgId != null" :org-id="activeOrgId" :can-manage="isOrgAdmin" />

    </template>

    <FormDialog v-if="formDialog" v-model:open="formDialogOpen"
      :title="formDialog.title" :description="formDialog.description"
      :fields="formDialog.fields" :submit-label="formDialog.submitLabel" :on-confirm="formDialog.onConfirm" />
    <FormDialog v-if="revealDialog" v-model:open="revealOpen"
      :title="revealDialog.title" :description="revealDialog.description"
      :fields="revealDialog.fields" :submit-label="revealDialog.submitLabel" :on-confirm="revealDialog.onConfirm" />
  </div>
</template>
