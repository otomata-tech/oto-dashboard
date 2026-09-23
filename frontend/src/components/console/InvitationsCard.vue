<script setup lang="ts">
// Carte « invitations » RÉUTILISÉE aux 3 niveaux de la cascade (org / équipe / plateforme).
// Même geste partout — inviter par email (ou obtenir un lien à partager soi-même), lister
// les invitations en attente, révoquer. Le vocabulaire (rôle, copy) s'adapte au niveau ;
// le câblage API vit dans `useInvitations`. Le backend porte l'autz ; `canManage` masque
// seulement les contrôles.
import { computed, toRef } from 'vue'
import ConsoleCard from './ConsoleCard.vue'
import Tag from './Tag.vue'
import Dot from './Dot.vue'
import Btn from './Btn.vue'
import Avatar from './Avatar.vue'
import FormDialog from './FormDialog.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useFormDialog } from '@/composables/useFormDialog'
import { useInvitations, type InviteScope } from '@/composables/useInvitations'
import type { OrgInvitation } from '@/types/api'
import { fmtDate } from '@/types/api'
import { humanize, explain } from '@/lib/errors'
import { ApiError } from '@/api'

// `canRead` charge la liste, `canManage` arme les gestes : un admin qui CONSULTE une org en lit
// les invitations sans pouvoir en émettre ni en révoquer — le serveur refuse (oto#211).
const props = defineProps<{ scope: InviteScope; canRead: boolean; canManage: boolean }>()

const { toast } = useToast()
const { confirmAction } = usePrompt()
const { formDialog, formDialogOpen, openForm } = useFormDialog()
// Dialog séparé pour la révélation lien/code (évite la course de fermeture du 1er).
const { formDialog: revealDialog, formDialogOpen: revealOpen, openForm: openReveal } = useFormDialog()

const scopeRef = toRef(props, 'scope')
const canReadRef = toRef(props, 'canRead')
const { invitations, loading, error, reload, invite, revoke } = useInvitations(scopeRef, canReadRef)

const level = computed(() => props.scope.level)
const noun = computed(() => (level.value === 'org' ? 'the org' : level.value === 'team' ? 'the team' : 'oto'))
// Le rôle se dit dans le vocabulaire du niveau : `group_*` pour une équipe (l'invité entre
// alors dans l'org parente comme membre simple, et dans l'équipe avec ce rôle).
const atTeam = computed(() => level.value === 'team')
const roleOptions = computed(() => (atTeam.value
  ? [{ value: 'group_member', label: 'member' }, { value: 'group_admin', label: 'team lead' }]
  : [{ value: 'org_member', label: 'member' }, { value: 'org_admin', label: 'admin' }]))
const defaultRole = computed(() => (atTeam.value ? 'group_member' : 'org_member'))

function isLead(iv: OrgInvitation): boolean {
  return atTeam.value ? iv.group_role === 'group_admin' : iv.org_role === 'org_admin'
}

// Émet l'invitation et enchaîne l'effet de bord (mail envoyé → toast, lien à
// partager → dialog de révélation) ; factorisé pour être rejoué tel quel depuis
// l'action « resend » du toast `already_invited`.
async function doInvite(email: string | null, role: string, sendMail: boolean) {
  const res = await invite(email, role, sendMail)
  if (res.emailed) toast(`invite sent to ${res.email}`)
  else openReveal({
    title: 'share this invite yourself',
    description: `send this link to the person — it joins them to ${noun.value}.`,
    submitLabel: 'done',
    // Plus de code court : retiré du backend le 15/09 (oto-backend#560), seul le lien porte
    // l'invitation. Le champ « code » s'affichait vide depuis.
    fields: [
      { key: 'url', label: 'invite link', initial: res.invite_url },
    ],
    onConfirm: async () => {},
  })
  await reload()
}

function openInvite() {
  // Le rôle n'a de sens que pour l'org ; au niveau plateforme = onboarding pur.
  const fields = [
    { key: 'email', label: 'email (optional)', placeholder: 'name@company.com',
      hint: 'leave blank to get a link to share yourself' },
    ...(level.value === 'platform' ? [] : [{
      key: 'role', label: 'role', type: 'select' as const, initial: defaultRole.value,
      options: roleOptions.value }]),
    { key: 'delivery', label: 'how', type: 'select' as const, initial: 'mail',
      options: [{ value: 'mail', label: 'send by email' }, { value: 'code', label: 'give me a link to share' }] },
  ]
  openForm({
    title: `invite to ${noun.value}`,
    description: level.value === 'platform'
      ? 'send them a sign-up link to join oto.'
      : `send them an email link, or get a link to share yourself.`,
    submitLabel: 'create invite',
    fields,
    onConfirm: async (v) => {
      const sendMail = v.delivery !== 'code'
      const email = (v.email || '').trim()
      if (sendMail && !email) { toast('an email is required to send by email'); throw new Error('email required') }
      const role = (v.role as string) || defaultRole.value
      try {
        await doInvite(email || null, role, sendMail)
      } catch (e) {
        // 409 already_member / already_invited (oto-backend#624) : le backend écrit
        // `detail` pour être lu tel quel — jamais le code brut. `already_invited`
        // porte en plus `details.invitation.id`, de quoi RENVOYER (révoquer puis
        // ré-émettre) sans faire retaper le formulaire.
        const invite409 = e instanceof ApiError && e.code === 'already_invited'
          ? (e.details?.invitation as { id: number } | undefined) : undefined
        if (invite409) {
          toast(explain(e), { action: {
            label: 'resend',
            run: async () => {
              try {
                await revoke(invite409.id)
                await doInvite(email || null, role, sendMail)
                formDialogOpen.value = false
              } catch (e2) { toast(explain(e2)) }
            },
          } })
        } else {
          toast(explain(e))
        }
        throw e
      }
    },
  })
}

async function revokeInv(id: number) {
  if (!await confirmAction({ title: 'revoke invitation', danger: true, confirmLabel: 'revoke',
    message: 'revoke this pending invitation?' })) return
  try { await revoke(id); toast('invitation revoked'); await reload() }
  catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <ConsoleCard flush title="invitations"
    sub="people invited but not yet joined. they join on clicking the link.">
    <template v-if="canManage" #actions>
      <Btn kind="mini" icon="plus" @click="openInvite">Invite</Btn>
    </template>

    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>
    <div v-else-if="loading && !invitations.length" class="dim" style="padding: 14px; text-align: center">loading…</div>
    <div v-else-if="!invitations.length" class="dim" style="padding: 14px; text-align: center">
      no pending invitations
    </div>
    <table v-else class="tbl">
      <thead><tr><th>invitee</th><th>role</th><th>status</th><th v-if="canManage" style="width: 110px"></th></tr></thead>
      <tbody>
        <tr v-for="iv in invitations" :key="iv.id">
          <td>
            <div style="display: flex; align-items: center; gap: 9px">
              <Avatar :name="iv.email || 'link'" :size="28" />
              <div>
                <div style="font-weight: 600; color: var(--color-ink); display: flex; gap: 6px; align-items: center">
                  {{ iv.email || 'link to share' }} <Tag tone="saffron">invited</Tag>
                </div>
                <div style="font-size: 11px; color: var(--color-faint)">
                  invited {{ fmtDate(iv.created_at) }} · expires {{ fmtDate(iv.expires_at) }}
                </div>
              </div>
            </div>
          </td>
          <td><Tag v-if="isLead(iv)" tone="ink">{{ atTeam ? 'team lead' : 'admin' }}</Tag><Tag v-else>member</Tag></td>
          <td><Dot tone="saffron" :size="7" /></td>
          <td v-if="canManage" style="text-align: right">
            <Btn kind="danger" @click="revokeInv(iv.id)">revoke</Btn>
          </td>
        </tr>
      </tbody>
    </table>
  </ConsoleCard>

  <FormDialog v-if="formDialog" v-model:open="formDialogOpen"
    :title="formDialog.title" :description="formDialog.description"
    :fields="formDialog.fields" :submit-label="formDialog.submitLabel" :on-confirm="formDialog.onConfirm" />
  <FormDialog v-if="revealDialog" v-model:open="revealOpen"
    :title="revealDialog.title" :description="revealDialog.description"
    :fields="revealDialog.fields" :submit-label="revealDialog.submitLabel" :on-confirm="revealDialog.onConfirm" />
</template>
