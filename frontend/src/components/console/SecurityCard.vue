<script setup lang="ts">
import { onMounted, ref } from 'vue'
import ConsoleCard from './ConsoleCard.vue'
import Btn from './Btn.vue'
import Tag from './Tag.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import {
  listMfaFactors, generateTotpSecret, bindTotp, generateBackupCodes,
  renameFactor, deleteFactor, AccountApiError, type MfaFactor,
} from '@/lib/account'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'

const { toast } = useToast()
const { confirmAction, promptForm } = usePrompt()

const factors = ref<MfaFactor[]>([])
const loading = ref(true)
// 403 sur l'Account API = scope `identities` absent du token → l'user s'est connecté
// avant l'ajout du scope ; une reconnexion l'accorde. On le dit au lieu d'une erreur sèche.
const needsReconnect = ref(false)

// Setup TOTP en cours (inline) : secret + QR + saisie du code.
const totp = ref<{ secret: string; secretQrCode?: string } | null>(null)
const totpCode = ref('')
const busy = ref(false)

const LABEL: Record<string, string> = {
  Totp: 'application authenticator',
  WebAuthn: 'passkey',
  BackupCode: 'codes de secours',
  EmailVerificationCode: 'code email',
  PhoneVerificationCode: 'code SMS',
}

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
    totp.value = await generateTotpSecret()
    totpCode.value = ''
  } catch (e) { toast(humanize(e)) } finally { busy.value = false }
}

async function confirmTotp() {
  if (!totp.value || !totpCode.value) return
  busy.value = true
  try {
    await bindTotp(totp.value.secret, totpCode.value.trim())
    totp.value = null
    toast('authenticator ajouté')
    await reload()
  } catch (e) { toast(humanize(e)) } finally { busy.value = false }
}

async function backupCodes() {
  busy.value = true
  try {
    const { codes } = await generateBackupCodes()
    await promptForm({
      title: 'codes de secours',
      description: 'note-les maintenant et garde-les en lieu sûr — ils ne seront plus affichés. ils remplacent tout lot précédent.',
      fields: [{ key: 'codes', label: 'codes', value: (codes || []).join('\n'), type: 'textarea' }],
      submitLabel: 'c\'est noté',
    })
    await reload()
  } catch (e) { toast(humanize(e)) } finally { busy.value = false }
}

async function rename(f: MfaFactor) {
  const r = await promptForm({
    title: 'renommer le facteur', fields: [{ key: 'name', label: 'nom', value: f.name || '' }], submitLabel: 'renommer',
  })
  if (!r) return
  try { await renameFactor(f.id, r.name || ''); await reload() } catch (e) { toast(humanize(e)) }
}

async function remove(f: MfaFactor) {
  if (!await confirmAction({ title: 'retirer ce facteur', danger: true, confirmLabel: 'retirer', message: `retirer « ${f.name || LABEL[f.type] || f.type} » ? tu ne pourras plus l'utiliser pour te connecter.` })) return
  try { await deleteFactor(f.id); toast('facteur retiré'); await reload() } catch (e) { toast(humanize(e)) }
}

onMounted(reload)
</script>

<template>
  <ConsoleCard id="security" title="sécurité · 2FA" flush
    sub="facteurs de double authentification de ton compte (passkey, application, codes de secours).">
    <template #actions>
      <Btn kind="mini" icon="plus" :disabled="busy || needsReconnect" @click="startTotp">app authenticator</Btn>
      <Btn kind="mini" :disabled="busy || needsReconnect" @click="backupCodes">codes de secours</Btn>
    </template>

    <p v-if="needsReconnect" class="helptext" style="padding: 8px 2px">
      reconnecte-toi une fois (se déconnecter puis se reconnecter) pour activer la gestion 2FA —
      ton compte doit accorder une nouvelle autorisation.
    </p>

    <!-- Setup TOTP inline -->
    <div v-if="totp" class="totp-setup">
      <div class="totp-head">ajouter une application authenticator</div>
      <p class="helptext">scanne le QR (ou saisis la clé) dans ton app (Google Authenticator, 1Password…), puis entre le code à 6 chiffres.</p>
      <img v-if="totp.secretQrCode" :src="totp.secretQrCode" alt="QR TOTP" class="totp-qr" />
      <code class="totp-secret">{{ totp.secret }}</code>
      <div class="totp-verify">
        <input v-model="totpCode" inputmode="numeric" autocomplete="one-time-code" placeholder="000000" maxlength="6" />
        <Btn :disabled="busy || totpCode.length < 6" @click="confirmTotp">vérifier</Btn>
        <Btn kind="ghost" :disabled="busy" @click="totp = null">annuler</Btn>
      </div>
    </div>

    <table v-if="!needsReconnect" class="tbl">
      <thead><tr><th>facteur</th><th>nom</th><th>ajouté</th><th>dernier usage</th><th style="width: 90px"></th></tr></thead>
      <tbody>
        <tr v-for="f in factors" :key="f.id">
          <td><Tag :tone="f.type === 'WebAuthn' ? 'olive' : f.type === 'BackupCode' ? 'ink' : 'saffron'">{{ LABEL[f.type] || f.type }}</Tag></td>
          <td style="color: var(--color-ink)">
            {{ f.name || (f.type === 'BackupCode' && f.remainCodes != null ? `${f.remainCodes} restants` : '—') }}
          </td>
          <td class="dim">{{ fmtDate(f.createdAt) }}</td>
          <td class="dim">{{ fmtDate(f.lastUsedAt) ?? 'jamais' }}</td>
          <td style="text-align: right; white-space: nowrap">
            <Btn v-if="f.type !== 'BackupCode'" kind="mini" @click="rename(f)">renommer</Btn>
            <Btn kind="danger" @click="remove(f)">retirer</Btn>
          </td>
        </tr>
        <tr v-if="!loading && !factors.length">
          <td colspan="5" class="dim" style="text-align: center; padding: 16px">aucun facteur 2FA — ajoute une app authenticator, ou une passkey à la prochaine connexion.</td>
        </tr>
      </tbody>
    </table>

    <p v-if="!needsReconnect" class="helptext" style="padding: 10px 2px 0">
      la <strong>passkey</strong> se configure à la <strong>connexion</strong> (écran « configurer le MFA ») ; elle apparaît ensuite ici, où tu peux la renommer ou la retirer.
    </p>
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
