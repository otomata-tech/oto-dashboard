<script setup lang="ts">
import { onMounted, ref } from 'vue'
import ConsoleCard from './ConsoleCard.vue'
import Btn from './Btn.vue'
import Tag from './Tag.vue'
import FormDialog from './FormDialog.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useFormDialog } from '@/composables/useFormDialog'
import QRCode from 'qrcode'
import {
  listMfaFactors, generateTotpSecret, getMyAccount, bindTotp, generateBackupCodes,
  renameFactor, deleteFactor, AccountApiError, type MfaFactor,
} from '@/lib/account'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const { toast } = useToast()
const { confirmAction } = usePrompt()
const { formDialog, formDialogOpen, openForm } = useFormDialog()

const factors = ref<MfaFactor[]>([])
const loading = ref(true)
// 403 sur l'Account API = scope `identities` absent du token → l'user s'est connecté
// avant l'ajout du scope ; une reconnexion l'accorde. On le dit au lieu d'une erreur sèche.
const needsReconnect = ref(false)

// Setup TOTP en cours (inline) : secret + QR + saisie du code.
const totp = ref<{ secret: string; secretQrCode?: string } | null>(null)
const totpCode = ref('')
const busy = ref(false)

const FACTEURS = ['Totp', 'WebAuthn', 'BackupCode', 'EmailVerificationCode', 'PhoneVerificationCode']
/** Le nom d'un type de facteur ; un type inconnu se montre tel quel. */
const libelle = (type: string) => (FACTEURS.includes(type) ? t(`accountUi.security.factor.${type}`) : type)

async function reload() {
  loading.value = true
  try {
    factors.value = await listMfaFactors()
    needsReconnect.value = false
  } catch (e) {
    if (e instanceof AccountApiError && (e.status === 403 || e.status === 401)) {
      needsReconnect.value = true
    } else {
      toast(humanize(e))
    }
  } finally {
    loading.value = false
  }
}

async function startTotp() {
  busy.value = true
  try {
    const { secret } = await generateTotpSecret()
    const { primaryEmail } = await getMyAccount()
    const label = encodeURIComponent(`oto:${primaryEmail || 'compte'}`)
    const uri = `otpauth://totp/${label}?secret=${secret}&issuer=oto`
    const secretQrCode = await QRCode.toDataURL(uri)
    totp.value = { secret, secretQrCode }
    totpCode.value = ''
  } catch (e) { toast(humanize(e)) } finally { busy.value = false }
}

async function confirmTotp() {
  if (!totp.value || !totpCode.value) return
  busy.value = true
  try {
    await bindTotp(totp.value.secret, totpCode.value.trim())
    totp.value = null
    toast(t('accountUi.security.totpAdded'))
    await reload()
  } catch (e) { toast(humanize(e)) } finally { busy.value = false }
}

async function backupCodes() {
  busy.value = true
  try {
    const { codes } = await generateBackupCodes()
    openForm({
      title: t('accountUi.security.factor.BackupCode'),
      description: t('accountUi.security.backupDesc'),
      fields: [{ key: 'codes', label: t('accountUi.security.codes'), initial: (codes || []).join('\n'), type: 'textarea' }],
      submitLabel: t('accountUi.security.noted'),
      onConfirm: async () => { await reload() },
    })
  } catch (e) { toast(humanize(e)) } finally { busy.value = false }
}

function rename(f: MfaFactor) {
  openForm({
    title: t('accountUi.security.renameTitle'),
    fields: [{ key: 'name', label: t('accountUi.security.col.name'), initial: f.name || '' }],
    submitLabel: t('accountUi.security.rename'),
    onConfirm: async (v) => {
      try { await renameFactor(f.id, v.name || ''); await reload() } catch (e) { toast(humanize(e)); throw e }
    },
  })
}

async function remove(f: MfaFactor) {
  if (!await confirmAction({ title: t('accountUi.security.removeTitle'), danger: true, confirmLabel: t('accountUi.security.remove'), message: t('accountUi.security.removeMessage', { name: f.name || libelle(f.type) }) })) return
  try { await deleteFactor(f.id); toast(t('accountUi.security.removed')); await reload() } catch (e) { toast(humanize(e)) }
}

onMounted(reload)
</script>

<template>
  <ConsoleCard id="security" :title="t('accountUi.security.title')" flush :sub="t('accountUi.security.sub')">
    <template #actions>
      <Btn kind="mini" icon="plus" :disabled="busy || needsReconnect" @click="startTotp">{{ t('accountUi.security.addTotpBtn') }}</Btn>
      <Btn kind="mini" :disabled="busy || needsReconnect" @click="backupCodes">{{ t('accountUi.security.backupBtn') }}</Btn>
    </template>

    <p v-if="needsReconnect" class="helptext" style="padding: 8px 2px">
      {{ t('accountUi.security.reconnect') }}
    </p>

    <!-- Setup TOTP inline -->
    <div v-if="totp" class="totp-setup">
      <div class="totp-head">{{ t('accountUi.security.totpHead') }}</div>
      <p class="helptext">{{ t('accountUi.security.totpHelp') }}</p>
      <img v-if="totp.secretQrCode" :src="totp.secretQrCode" :alt="t('accountUi.security.qrAlt')" class="totp-qr" />
      <code class="totp-secret">{{ totp.secret }}</code>
      <div class="totp-verify">
        <input v-model="totpCode" inputmode="numeric" autocomplete="one-time-code" placeholder="000000" maxlength="6" />
        <Btn :disabled="busy || totpCode.length < 6" @click="confirmTotp">{{ t('accountUi.security.verify') }}</Btn>
        <Btn kind="ghost" :disabled="busy" @click="totp = null">{{ t('common.cancel') }}</Btn>
      </div>
    </div>

    <table v-if="!needsReconnect" class="tbl">
      <thead><tr><th>{{ t('accountUi.security.col.factor') }}</th><th>{{ t('accountUi.security.col.name') }}</th><th>{{ t('accountUi.security.col.added') }}</th><th>{{ t('accountUi.security.col.lastUsed') }}</th><th style="width: 90px"></th></tr></thead>
      <tbody>
        <tr v-for="f in factors" :key="f.id">
          <td><Tag :tone="f.type === 'WebAuthn' ? 'olive' : f.type === 'BackupCode' ? 'ink' : 'saffron'">{{ libelle(f.type) }}</Tag></td>
          <td style="color: var(--color-ink)">
            {{ f.name || (f.type === 'BackupCode' && f.remainCodes != null ? t('accountUi.security.remaining', f.remainCodes) : '—') }}
          </td>
          <td class="dim">{{ fmtDate(f.createdAt) }}</td>
          <td class="dim">{{ fmtDate(f.lastUsedAt) ?? t('accountUi.tokens.never') }}</td>
          <td style="text-align: right; white-space: nowrap">
            <Btn v-if="f.type !== 'BackupCode'" kind="mini" @click="rename(f)">{{ t('accountUi.security.renameBtn') }}</Btn>
            <Btn kind="danger" @click="remove(f)">{{ t('accountUi.security.remove') }}</Btn>
          </td>
        </tr>
        <tr v-if="!loading && !factors.length">
          <td colspan="5" class="dim" style="text-align: center; padding: 16px">{{ t('accountUi.security.empty') }}</td>
        </tr>
      </tbody>
    </table>

    <p v-if="!needsReconnect" class="helptext" style="padding: 10px 2px 0">
      <i18n-t keypath="accountUi.security.passkeyHint" tag="span">
        <template #passkey><strong>{{ t('accountUi.security.factor.WebAuthn') }}</strong></template>
        <template #login><strong>{{ t('accountUi.security.login') }}</strong></template>
      </i18n-t>
    </p>

    <FormDialog v-if="formDialog" v-model:open="formDialogOpen"
      :title="formDialog.title" :description="formDialog.description"
      :fields="formDialog.fields" :submit-label="formDialog.submitLabel" :on-confirm="formDialog.onConfirm" />
  </ConsoleCard>
</template>

<style scoped>
.totp-setup {
  border: 1px solid var(--color-hair); border-radius: 12px; padding: 16px;
  margin-bottom: 16px; background: var(--color-bg);
}
.totp-head { font-weight: 600; font-size: 14px; color: var(--color-ink); margin-bottom: 6px; }
.totp-qr { display: block; width: 160px; height: 160px; margin: 12px 0; border-radius: 8px; }
.totp-secret {
  display: inline-block; font-family: var(--font-mono); font-size: 12px; letter-spacing: 0.05em;
  background: var(--color-hair-soft); color: var(--color-ink); padding: 6px 10px; border-radius: 8px; margin-bottom: 12px;
  word-break: break-all;
}
.totp-verify { display: flex; gap: 8px; align-items: center; }
.totp-verify input {
  width: 120px; padding: 8px 12px; border: 1px solid var(--color-hair); border-radius: 10px;
  background: var(--color-surface); font-family: var(--font-mono); font-size: 15px; letter-spacing: 0.15em; text-align: center;
}
.totp-verify input:focus { outline: none; border-color: var(--color-saffron); }
</style>
