<script setup lang="ts">
// Admin de l'accès plateforme alpha (ADR 0013) : la file d'attente (comptes
// pending) + approbation (active + quota referral) + ajustement de quota.
import { onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Stat from '@/components/console/Stat.vue'
import Btn from '@/components/console/Btn.vue'
import FormDialog from '@/components/console/FormDialog.vue'
import { getWaitlist, grantAlphaAccess, rejectAlphaAccess, adminAlphaInvite, listAlphaInvites, revokeAlphaInvite, resendAlphaInvite } from '@/api/console'
import type { WaitlistEntry, AlphaInvite } from '@/types/api'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useFormDialog } from '@/composables/useFormDialog'
import { humanize } from '@/lib/errors'

const { toast } = useToast()
const { confirmAction } = usePrompt()
const { formDialog, formDialogOpen, openForm } = useFormDialog()
// Dialog séparé pour la révélation lien/code (évite la course de fermeture du 1er).
const { formDialog: revealDialog, formDialogOpen: revealOpen, openForm: openReveal } = useFormDialog()
const waitlist = ref<WaitlistEntry[]>([])
const invites = ref<AlphaInvite[]>([])
const error = ref<string | null>(null)
const busy = ref<string | null>(null)
const inviting = ref(false)

async function load() {
  try {
    const [w, i] = await Promise.all([getWaitlist(), listAlphaInvites()])
    waitlist.value = w.waitlist
    invites.value = i.invitations
    error.value = null
  } catch (e) { error.value = humanize(e) }
}

async function resend(inv: AlphaInvite) {
  if (!inv.email) { toast('cette invitation n\'a pas d\'email — partagez son code/lien'); return }
  busy.value = `inv:${inv.id}`
  try {
    const res = await resendAlphaInvite(inv.email)
    if (res.emailed) {
      toast(`invitation re-sent to ${res.email}`)
    } else {
      openReveal({
        title: 'share this invitation link',
        description: 'email delivery is off on this server — copy and send it yourself.',
        fields: [{ key: 'url', label: 'invitation link', initial: res.invite_url }],
        submitLabel: 'done',
        onConfirm: async () => {},
      })
    }
    await load()
  } catch (e) { toast(humanize(e)) } finally { busy.value = null }
}

async function revoke(inv: AlphaInvite) {
  if (!await confirmAction({ title: 'revoke invitation', message: `revoke the pending invitation to ${inv.email}? the link will stop working.`, confirmLabel: 'Revoke', danger: true })) return
  busy.value = `inv:${inv.id}`
  try {
    await revokeAlphaInvite(inv.id)
    toast('invitation revoked')
    await load()
  } catch (e) { toast(humanize(e)) } finally { busy.value = null }
}

function grant(u: WaitlistEntry) {
  openForm({
    title: `grant alpha access`,
    description: `${u.email || u.sub} gets platform access + an invitation quota, and is emailed.`,
    fields: [{ key: 'quota', label: 'invitation quota', initial: '3' }],
    submitLabel: 'grant access',
    onConfirm: async (v) => {
      const quota = Number(v.quota)
      busy.value = u.sub
      try {
        const res = await grantAlphaAccess(u.sub, Number.isFinite(quota) ? quota : undefined)
        toast(res.emailed ? `access granted — ${u.email} emailed` : 'access granted (email off)')
        await load()
      } catch (e) { toast(humanize(e)); throw e } finally { busy.value = null }
    },
  })
}

async function reject(u: WaitlistEntry) {
  if (!await confirmAction({
    title: 'reject access request',
    message: `reject ${u.email || u.sub}? the account is blocked and drops off the waitlist. you can still grant access later.`,
    confirmLabel: 'Reject',
    danger: true,
  })) return
  busy.value = u.sub
  try {
    await rejectAlphaAccess(u.sub)
    toast('access request rejected')
    await load()
  } catch (e) { toast(humanize(e)) } finally { busy.value = null }
}

function invite() {
  openForm({
    title: 'invite someone to the alpha',
    description: "doesn't spend any referral quota — they get their own account and org. send by email, or get a code to share yourself.",
    fields: [
      { key: 'email', label: 'email (optional)', placeholder: 'name@company.com',
        hint: 'leave blank to get a code to share yourself' },
      { key: 'delivery', label: 'how', type: 'select', initial: 'mail',
        options: [{ value: 'mail', label: 'send by email' }, { value: 'code', label: 'give me a code to share' }] },
    ],
    submitLabel: 'create invitation',
    onConfirm: async (v) => {
      const sendMail = v.delivery !== 'code'
      const email = (v.email || '').trim()
      if (sendMail && !email) { toast('an email is required to send by email'); throw new Error('email required') }
      inviting.value = true
      try {
        const res = await adminAlphaInvite(email || null, sendMail)
        if (res.emailed) {
          toast(`invitation sent to ${res.email}`)
        } else {
          openReveal({
            title: 'share this invitation yourself',
            description: 'send this link (or code) to the person — it grants them access.',
            fields: [
              { key: 'url', label: 'invitation link', initial: res.invite_url },
              { key: 'code', label: 'code', initial: res.code },
            ],
            submitLabel: 'done',
            onConfirm: async () => {},
          })
        }
        await load()
      } catch (e) { toast(humanize(e)); throw e } finally { inviting.value = false }
    },
  })
}

onMounted(load)
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <div class="grid3">
      <Stat label="waitlist" :value="waitlist.length" sub="awaiting alpha access" />
      <Stat label="pending invites" :value="invites.length" sub="sent, not yet accepted" />
    </div>

    <ConsoleCard title="invite to the alpha"
      sub="open the service to a new email — no referral quota spent. they get their own account and org.">
      <div style="display: flex; align-items: center; gap: 10px">
        <Btn :disabled="inviting" @click="invite">{{ inviting ? 'Sending…' : 'Invite by email' }}</Btn>
      </div>
    </ConsoleCard>

    <ConsoleCard flush title="pending invitations"
      sub="alpha invitations sent but not yet accepted. revoke to kill the link.">
      <table class="tbl">
        <thead><tr><th>email</th><th>sent</th><th>expires</th><th style="width: 150px"></th></tr></thead>
        <tbody>
          <tr v-for="inv in invites" :key="inv.id">
            <td>
              <div style="font-weight: 600; color: var(--color-ink)">{{ inv.email }}</div>
              <div v-if="inv.source" style="font-size: 11px; color: var(--color-faint)">{{ inv.source }}</div>
            </td>
            <td class="dim">{{ inv.created_at }}</td>
            <td class="dim">{{ inv.expires_at }}</td>
            <td style="text-align: right; white-space: nowrap">
              <Btn kind="mini" :disabled="busy === `inv:${inv.id}`" @click="resend(inv)">Resend</Btn>
              <Btn kind="mini" :disabled="busy === `inv:${inv.id}`" @click="revoke(inv)" style="margin-left: 6px">Revoke</Btn>
            </td>
          </tr>
          <tr v-if="!invites.length">
            <td colspan="4" class="dim" style="text-align: center; padding: 16px">no pending invitations</td>
          </tr>
        </tbody>
      </table>
    </ConsoleCard>

    <ConsoleCard flush title="waitlist"
      sub="accounts that signed up but aren't approved yet — oldest first. grant access to let them in.">
      <table class="tbl">
        <thead><tr><th>account</th><th>joined</th><th style="width: 210px"></th></tr></thead>
        <tbody>
          <tr v-for="u in waitlist" :key="u.sub">
            <td>
              <div style="font-weight: 600; color: var(--color-ink)">{{ u.name || u.email || u.sub }}</div>
              <div style="font-size: 11px; color: var(--color-faint)">{{ u.email }}</div>
            </td>
            <td class="dim">{{ u.created_at }}</td>
            <td style="text-align: right; white-space: nowrap">
              <Btn kind="mini" :disabled="busy === u.sub" @click="grant(u)">
                {{ busy === u.sub ? 'Granting…' : 'Grant access' }}
              </Btn>
              <Btn kind="mini" :disabled="busy === u.sub" @click="reject(u)" style="margin-left: 6px">Reject</Btn>
            </td>
          </tr>
          <tr v-if="!waitlist.length">
            <td colspan="3" class="dim" style="text-align: center; padding: 16px">waitlist empty</td>
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
  </div>
</template>
