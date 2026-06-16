<script setup lang="ts">
// Widget « inviter un ami » (invitation virale alpha, ADR 0013) — visible pour
// les comptes actifs. Dépense une invitation du quota referral ; l'invité crée
// sa propre org. Mirroir du flux d'invitation d'équipe (OrgView).
import { computed } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Btn from '@/components/console/Btn.vue'
import { sendAlphaInvite } from '@/api/console'
import { useMe } from '@/composables/useMe'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { humanize } from '@/lib/errors'

const { me, reload } = useMe()
const { toast } = useToast()
const { promptForm } = usePrompt()

const left = computed(() => me.value?.access.invites_left ?? 0)

async function invite() {
  if (left.value <= 0) return
  const r = await promptForm({
    title: 'invite a friend to Oto',
    description: `they get their own account. you have ${left.value} invitation${left.value === 1 ? '' : 's'} left.`,
    fields: [{ key: 'email', label: 'email', placeholder: 'name@company.com' }],
    submitLabel: 'send invitation',
  })
  if (!r || !r.email) return
  try {
    const res = await sendAlphaInvite(r.email)
    toast(res.emailed ? `invitation sent to ${res.email}` : 'invitation created — share the link')
    if (!res.emailed) {
      await promptForm({
        title: 'share this invitation link',
        description: 'email delivery is off on this server — copy and send it yourself.',
        fields: [{ key: 'url', label: 'invitation link', value: res.invite_url }],
        submitLabel: 'done',
      })
    }
    await reload()
  } catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <ConsoleCard title="invite a friend"
    :sub="left > 0
      ? `you have ${left} alpha invitation${left === 1 ? '' : 's'} to give out.`
      : 'you have no invitations left for now.'">
    <div style="display: flex; align-items: center; gap: 10px">
      <Btn :disabled="left <= 0" @click="invite">invite someone</Btn>
      <span class="dim" style="font-size: 12px">{{ left }} left</span>
    </div>
  </ConsoleCard>
</template>
