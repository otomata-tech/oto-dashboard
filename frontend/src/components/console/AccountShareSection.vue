<script setup lang="ts">
// Autorisations de compte partagé (#55) — face PROPRIÉTAIRE, par canal connecté :
// « qui peut opérer ce compte ». Deny-by-default, révocation immédiate (le grant est
// revalidé à chaque appel côté backend). Monté sous chaque canal connecté du widget
// hosted (ConnectorHostedWidget) ; le membre autorisé, lui, passe par le picker
// d'identités (le compte partagé y apparaît « compte de X »).
import { computed, ref } from 'vue'
import Btn from './Btn.vue'
import Tag from './Tag.vue'
import FormDialog from './FormDialog.vue'
import { getOrg, grantAccountAccess, revokeAccountAccess } from '@/api/console'
import { useFormDialog, type FormDialogField } from '@/composables/useFormDialog'
import { usePrompt } from '@/composables/usePrompt'
import { useToast } from '@/composables/useToast'
import { useMe, canWriteInOrg } from '@/composables/useMe'
import { humanize } from '@/lib/errors'
import { fmtDate } from '@/types/api'
import type { AccountGrant } from '@/types/api'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

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
// Autoriser et révoquer sont des écritures, refusées en consultation (oto#212) : la section
// garde la liste des autorisations, et disparaît quand il n'y a ni geste ni autorisation.
const canWrite = computed(() => canWriteInOrg(me.value))

const who = (g: AccountGrant) => g.grantee_name || g.grantee_email || g.grantee_sub || '?'

async function addGrant() {
  if (me.value?.active_org == null) { toast(t('accountUi.share.joinOrg')); return }
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
    if (opts.length) fields.push({ key: 'member', label: t('accountUi.share.member'), type: 'select', options: opts })
    fields.push({ key: 'email', label: opts.length ? t('accountUi.share.orEmail') : t('accountUi.share.email'),
                 type: 'text', placeholder: t('accountUi.share.emailPlaceholder') })
    openForm({
      title: t('accountUi.share.grantTitle', { channel: props.channel }),
      description: t('accountUi.share.grantDesc'),
      fields,
      submitLabel: t('accountUi.share.grant'),
      onConfirm: async (v) => {
        const who = String(v.email ?? '').trim() || (v.member ? String(v.member) : '')
        if (!who) { toast(t('accountUi.share.needWho')); throw new Error('no grantee') }
        try { await grantAccountAccess(props.channel, who); toast(t('accountUi.share.granted')); emit('changed') }
        catch (e) { toast(humanize(e)); throw e }
      },
    })
  } catch (e) { toast(humanize(e)) }
  finally { busy.value = false }
}

async function revoke(g: AccountGrant) {
  if (!g.grantee_sub) return
  if (!await confirmAction({
    title: t('accountUi.share.revokeTitle', { who: who(g) }), danger: true, confirmLabel: t('accountUi.tokens.revoke'),
    message: t('accountUi.share.revokeMessage', { who: who(g), channel: props.channel }),
  })) return
  try { await revokeAccountAccess(props.channel, g.grantee_sub); toast(t('accountUi.share.revoked')); emit('changed') }
  catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div v-if="canWrite || grants.length" class="asx">
    <div class="asx-head">
      <span class="dim asx-title">{{ t('accountUi.share.alsoBy') }}</span>
      <Btn v-if="canWrite" kind="mini" :disabled="busy" @click="addGrant">{{ t('accountUi.share.grantBtn') }}</Btn>
    </div>
    <div v-for="g in grants" :key="g.grantee_sub ?? ''" class="asx-row">
      <span class="asx-who">{{ who(g) }}
        <Tag tone="saffron">{{ t('accountUi.share.canOperate') }}</Tag>
        <span v-if="g.granted_at" class="dim asx-date">{{ t('accountUi.share.since', { date: fmtDate(g.granted_at) }) }}</span>
      </span>
      <Btn v-if="canWrite" kind="danger" @click="revoke(g)">{{ t('accountUi.tokens.revoke') }}</Btn>
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
