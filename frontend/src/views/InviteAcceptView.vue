<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Btn from '@/components/console/Btn.vue'
import Squiggle from '@/components/console/Squiggle.vue'
import { useAuth } from '@/composables/useAuth'
import { useMe } from '@/composables/useMe'
import { previewInvite, acceptInvite } from '@/api/console'
import type { InvitePreview } from '@/types/api'
import { humanize } from '@/lib/errors'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { isAuthenticated, login, logout } = useAuth()
const { me, load, reload } = useMe()

// 'loading'  : aperçu en cours
// 'invited'  : invitation valide, pas connecté → accueil + CTA création de compte
// 'joining'  : connecté → acceptation en cours
// 'ok'       : rejoint
// 'error'    : lien invalide/expiré OU échec d'acceptation
// 'confirm'  : connecté mais email ≠ email invité → soft-confirm (modèle bearer)
const state = ref<'loading' | 'invited' | 'confirm' | 'joining' | 'ok' | 'error'>('loading')
const preview = ref<InvitePreview | null>(null)
const orgName = ref<string | null>(null)
const errMsg = ref('')
const errCode = ref('')
const otl = ref('')  // one-time-token Logto (magic link) — connexion sans saisie de code

// Forme du lien : `/invitation/<token>` (ce que le backend envoie depuis le 15/09), ou
// l'ancien `?token=`. ⚠️ Le code court a été RETIRÉ du backend le 15/09 (oto-backend#560,
// f461a30c) : cette page lisait encore le segment d'URL comme un code, appelait une route
// disparue, et chaque invitation envoyée par mail tombait en « lien invalide » (vu 23/09).
const token = ref('')

function codeOf(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  return raw.includes(' ') ? raw.slice(raw.indexOf(' ') + 1) : raw
}

// Ce que l'invité rejoint (feature cascade) : équipe > org > (rien = onboarding plateforme).
const joinTarget = computed<string | null>(() => {
  const p = preview.value
  if (!p) return null
  if (p.scope === 'team' && p.group_name) return `l'équipe ${p.group_name}`
  return p.org_name ?? null
})

// Retour post-login = l'URL courante (préserve code/token), OTT réinjecté par login().
const returnTo = () => `${window.location.pathname}${window.location.search}`
function acceptPayload() {
  return { token: token.value }
}

// Crée un compte (ou se connecte) avec l'email invité pré-rempli, puis revient ici.
// L'OTT (s'il est présent dans le lien) rend la connexion silencieuse (1 clic, pas de code).
function createAccount() { login(returnTo(), 'register', preview.value?.email ?? undefined, otl.value || undefined) }
function signIn() { login(returnTo(), 'sign_in', preview.value?.email ?? undefined, otl.value || undefined) }
// Mauvais compte connecté : se déconnecter et revenir sur ce lien.
async function switchAccount() {
  await logout(`${window.location.origin}${returnTo()}`)
}

async function accept() {
  state.value = 'joining'
  try {
    const r = await acceptInvite(acceptPayload())
    orgName.value = r.name
    await reload()
    state.value = 'ok'
  } catch (e) {
    errCode.value = codeOf(e)
    errMsg.value = humanize(e)
    state.value = 'error'
  }
}

onMounted(async () => {
  const qs = new URLSearchParams(window.location.search)
  token.value = (route.params.token as string) || qs.get('token') || ''
  otl.value = qs.get('otl') ?? ''
  if (!token.value) {
    state.value = 'error'; errMsg.value = t('invite.invalid.incomplete'); return
  }
  // Aperçu public d'abord : on accompagne avant tout bounce vers l'auth.
  try {
    preview.value = await previewInvite(token.value)
  } catch (e) {
    errCode.value = codeOf(e)
    errMsg.value = humanize(e)
    state.value = 'error'
    return
  }
  // Connecté → on accepte ; mais si le compte connecté a un autre email que celui
  // visé, on demande confirmation (modèle bearer : le jeton suffit, on prévient
  // juste qu'on n'est pas sur l'adresse invitée).
  if (isAuthenticated.value) {
    await load()
    const mine = (me.value?.email || '').trim().toLowerCase()
    const invited = (preview.value?.email || '').trim().toLowerCase()
    if (mine && invited && mine !== invited) state.value = 'confirm'
    else await accept()
  } else {
    state.value = 'invited'
  }
})
</script>

<template>
  <div class="invite-page">
    <div class="state-empty">
      <span class="o-medallion o-medallion-lg">o</span>

      <template v-if="state === 'loading' || state === 'joining'">
        <div class="se-title">{{ state === 'joining' ? t('invite.checking.joining') : t('invite.checking.wait') }}</div>
        <div class="se-body">{{ t('invite.checking.body') }}</div>
      </template>

      <template v-else-if="state === 'invited'">
        <i18n-t keypath="invite.invited.eyebrow" tag="div" class="se-eyebrow">
          <template #mark><Squiggle>{{ t('invite.invited.mark') }}</Squiggle></template>
        </i18n-t>
        <div class="se-title">{{ t('invite.invited.title') }}</div>
        <div class="se-body">
          <template v-if="preview?.inviter">{{ t('invite.invited.byInviter', { inviter: preview.inviter }) }}</template>
          <template v-else>{{ t('invite.invited.byNobody') }}</template>
          <i18n-t keypath="invite.invited.toTarget" tag="span">
            <template #target><strong>{{ joinTarget || 'oto' }}</strong></template>
          </i18n-t>.
          <i18n-t keypath="invite.invited.createAccount" tag="span">
            <template #email><i18n-t v-if="preview?.email" keypath="invite.invited.asEmail" tag="span">
              <template #email><strong>{{ preview.email }}</strong></template>
            </i18n-t></template>
          </i18n-t>
        </div>
        <div class="se-cta se-cta-col">
          <Btn @click="createAccount">{{ t('invite.invited.cta') }}</Btn>
          <button class="linklike" @click="signIn">{{ t('invite.invited.signIn') }}</button>
        </div>
      </template>

      <template v-else-if="state === 'confirm'">
        <i18n-t keypath="invite.confirm.eyebrow" tag="div" class="se-eyebrow">
          <template #mark><Squiggle>{{ t('invite.confirm.mark') }}</Squiggle></template>
        </i18n-t>
        <div class="se-title">{{ t('invite.confirm.title') }}</div>
        <i18n-t keypath="invite.confirm.body" tag="div" class="se-body">
          <template #invited><strong>{{ preview?.email }}</strong></template>
          <template #mine><strong>{{ me?.email }}</strong></template>
        </i18n-t>
        <div class="se-cta se-cta-col">
          <Btn @click="accept">{{ t('invite.confirm.continue', { email: me?.email ?? '' }) }}</Btn>
          <button class="linklike" @click="switchAccount">{{ t('invite.confirm.switch') }}</button>
        </div>
      </template>

      <template v-else-if="state === 'ok'">
        <div class="se-eyebrow">{{ t('invite.ok.eyebrow') }}</div>
        <i18n-t keypath="invite.ok.title" tag="div" class="se-title">
          <template #mark><Squiggle>{{ t('invite.ok.mark') }}</Squiggle></template>
        </i18n-t>
        <div class="se-body">
          <i18n-t v-if="orgName" keypath="invite.ok.joined" tag="span">
            <template #org><strong>{{ orgName }}</strong></template>
          </i18n-t>
          <template v-else>{{ t('invite.ok.open') }}</template>
        </div>
        <div class="se-cta">
          <Btn @click="router.push('/overview')">{{ orgName ? t('invite.ok.toConsole') : t('invite.ok.createSpace') }}</Btn>
        </div>
      </template>

      <template v-else-if="errCode === 'email_mismatch'">
        <i18n-t keypath="invite.mismatch.title" tag="div" class="se-title">
          <template #mark><Squiggle>{{ t('invite.mismatch.mark') }}</Squiggle></template>
        </i18n-t>
        <div class="se-body">{{ errMsg }}</div>
        <div class="se-cta">
          <Btn @click="switchAccount">{{ t('invite.mismatch.cta') }}</Btn>
        </div>
      </template>

      <template v-else>
        <i18n-t keypath="invite.invalid.title" tag="div" class="se-title">
          <template #mark><Squiggle>{{ t('invite.invalid.mark') }}</Squiggle></template>
        </i18n-t>
        <div class="se-body">{{ errMsg }}</div>
        <div class="se-cta">
          <Btn kind="ghost" @click="router.push('/overview')">{{ t('invite.ok.toConsole') }}</Btn>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.invite-page {
  min-height: 100vh;
  display: flex; align-items: center; justify-content: center;
  background: var(--color-bg);
  font-family: var(--font-sans); color: var(--color-ink);
}
.se-eyebrow {
  font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--color-gold-ink, var(--color-mute)); font-weight: 600; margin-bottom: 6px;
}
.se-cta-col { display: flex; flex-direction: column; align-items: center; gap: 10px; }
.linklike { background: none; border: none; cursor: pointer; color: var(--color-mute); font-size: 13px; text-decoration: underline; }
.linklike:hover { color: var(--color-ink); }
</style>
