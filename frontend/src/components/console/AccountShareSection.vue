<script setup lang="ts">
// Autorisations de compte partagé (#55) — face PROPRIÉTAIRE, par canal connecté :
// « qui peut opérer ce compte ». Deny-by-default, révocation immédiate (le grant est
// revalidé à chaque appel côté backend). Monté sous chaque canal connecté du widget
// hosted (ConnectorHostedWidget) ; le membre autorisé, lui, passe par le picker
// d'identités (le compte partagé y apparaît « compte de X »).
import { ref } from 'vue'
import Btn from './Btn.vue'
import Tag from './Tag.vue'
import FormDialog from './FormDialog.vue'
import { getOrg, grantAccountAccess, revokeAccountAccess } from '@/api/console'
import { useFormDialog, type FormDialogField } from '@/composables/useFormDialog'
import { usePrompt } from '@/composables/usePrompt'
import { useToast } from '@/composables/useToast'
import { useMe } from '@/composables/useMe'
import { humanize } from '@/lib/errors'
import { fmtDate } from '@/types/api'
import type { AccountGrant } from '@/types/api'

const props = defineProps<{
  channel: string             // clé front du canal (linkedin/whatsapp/…)
  grants: AccountGrant[]      // grants accordés PAR moi, déjà filtrés à ce canal
}>()
const emit = defineEmits<{ (e: 'changed'): void }>()

const { toast } = useToast()
const { confirmAction } = usePrompt()
const { formDialog, formDialogOpen, openForm } = useFormDialog()
const { me } = useMe()
const busy = ref(false)

const who = (g: AccountGrant) => g.grantee_name || g.grantee_email || g.grantee_sub || '?'

async function addGrant() {
  if (me.value?.active_org == null) { toast('rejoins une org pour partager un compte'); return }
  busy.value = true
  try {
    const org = await getOrg(me.value.active_org)
    const already = new Set(props.grants.map((g) => g.grantee_sub))
    const opts = (org.members ?? [])
      .filter((m) => m.sub !== me.value?.sub && !already.has(m.sub))
      .map((m) => ({ value: m.sub, label: m.name || m.email || m.sub }))
    // Cross-org assumé : membre de l'org active en raccourci OU n'importe qui par
    // email (freelance/agence hors org). L'un OU l'autre suffit.
    const fields: FormDialogField[] = []
    if (opts.length) fields.push({ key: 'member', label: 'membre de ton org active', type: 'select', options: opts })
    fields.push({ key: 'email', label: opts.length ? 'ou email (hors org)' : 'email de la personne',
                 type: 'text', placeholder: 'personne@exemple.com' })
    openForm({
      title: `${props.channel} — autoriser quelqu'un à opérer ton compte`,
      description: "la personne autorisée pourra agir SOUS ton identité sur ce canal (messages, actions), même hors de tes orgs. révocable à tout moment, effet immédiat.",
      fields,
      submitLabel: 'autoriser',
      onConfirm: async (v) => {
        const who = String(v.email ?? '').trim() || (v.member ? String(v.member) : '')
        if (!who) { toast('indique un membre ou un email'); throw new Error('no grantee') }
        try { await grantAccountAccess(props.channel, who); toast('accès autorisé'); emit('changed') }
        catch (e) { toast(humanize(e)); throw e }
      },
    })
  } catch (e) { toast(humanize(e)) }
  finally { busy.value = false }
}

async function revoke(g: AccountGrant) {
  if (!g.grantee_sub) return
  if (!await confirmAction({
    title: `révoquer ${who(g)}`, danger: true, confirmLabel: 'Révoquer',
    message: `révoquer l'autorisation de ${who(g)} d'opérer ton compte ${props.channel} ? effet immédiat sur son prochain appel.`,
  })) return
  try { await revokeAccountAccess(props.channel, g.grantee_sub); toast('autorisation révoquée'); emit('changed') }
  catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="asx">
    <div class="asx-head">
      <span class="dim asx-title">opéré aussi par</span>
      <Btn kind="mini" :disabled="busy" @click="addGrant">Autoriser quelqu'un</Btn>
    </div>
    <div v-for="g in grants" :key="g.grantee_sub ?? ''" class="asx-row">
      <span class="asx-who">{{ who(g) }}
        <Tag tone="saffron">peut opérer ce compte</Tag>
        <span v-if="g.granted_at" class="dim asx-date">depuis {{ fmtDate(g.granted_at) }}</span>
      </span>
      <Btn kind="danger" @click="revoke(g)">Révoquer</Btn>
    </div>
    <FormDialog v-if="formDialog" v-model:open="formDialogOpen"
      :title="formDialog.title" :description="formDialog.description"
      :fields="formDialog.fields" :submit-label="formDialog.submitLabel" :on-confirm="formDialog.onConfirm" />
  </div>
</template>

<style scoped>
.asx { display: flex; flex-direction: column; gap: 4px; padding: 2px 0 8px 18px; }
.asx-head { display: flex; align-items: center; gap: 10px; justify-content: space-between; }
.asx-title { font-size: 11.5px; }
.asx-row { display: flex; align-items: center; gap: 8px; }
.asx-who { flex: 1; min-width: 0; font-size: 12px; display: flex; gap: 6px; align-items: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.asx-date { font-size: 11px; }
</style>
