<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Btn from '@/components/console/Btn.vue'
import Squiggle from '@/components/console/Squiggle.vue'
import { useAuth } from '@/composables/useAuth'
import { useMe } from '@/composables/useMe'
import { previewInvite, previewInviteByCode, previewReferral, acceptInvite } from '@/api/console'
import type { InvitePreview } from '@/types/api'
import { humanize } from '@/lib/errors'

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

// Forme du lien : token mail legacy (?token=), code court nominatif
// (/invitation/<carrier>/<code>), ou lien referral réutilisable (/invitation/<carrier>).
const token = ref('')
const code = ref('')
const carrier = ref('')

function codeOf(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  return raw.includes(' ') ? raw.slice(raw.indexOf(' ') + 1) : raw
}

// Retour post-login = l'URL courante (préserve carrier/code/token), OTT réinjecté par login().
const returnTo = () => `${window.location.pathname}${window.location.search}`
function acceptPayload() {
  if (token.value) return { token: token.value }
  if (code.value) return { code: code.value }
  return { carrier: carrier.value }
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
  token.value = qs.get('token') ?? ''
  otl.value = qs.get('otl') ?? ''
  carrier.value = (route.params.carrier as string) ?? ''
  code.value = (route.params.code as string) ?? ''
  if (!token.value && !code.value && !carrier.value) {
    state.value = 'error'; errMsg.value = 'ce lien d\'invitation est incomplet.'; return
  }
  // Aperçu public d'abord : on accompagne avant tout bounce vers l'auth.
  try {
    preview.value = token.value
      ? await previewInvite(token.value)
      : code.value
        ? await previewInviteByCode(code.value)
        : await previewReferral(carrier.value)
  } catch (e) {
    errCode.value = codeOf(e)
    errMsg.value = humanize(e)
    state.value = 'error'
    return
  }
  // Connecté → on accepte ; mais si le compte connecté a un autre email que celui
  // visé, on demande confirmation (modèle bearer : le jeton suffit, on prévient
  // juste qu'on n'est pas sur l'adresse invitée). Le lien referral n'a pas d'email
  // visé → on accepte directement.
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
        <div class="se-title">{{ state === 'joining' ? 'on vous fait entrer…' : 'un instant…' }}</div>
        <div class="se-body">on vérifie votre invitation.</div>
      </template>

      <template v-else-if="state === 'invited'">
        <div class="se-eyebrow">vous êtes <Squiggle>invité·e</Squiggle></div>
        <div class="se-title">bienvenue chez oto.</div>
        <div class="se-body">
          <template v-if="preview?.inviter">{{ preview.inviter }} vous invite</template>
          <template v-else>vous êtes invité·e</template>
          <template v-if="preview && !preview.referral && preview.org_name"> à rejoindre <strong>{{ preview.org_name }}</strong></template>.
          créez votre compte<template v-if="preview?.email"> en <strong>{{ preview.email }}</strong></template> pour entrer.
        </div>
        <div class="se-cta se-cta-col">
          <Btn @click="createAccount">Créer mon compte</Btn>
          <button class="linklike" @click="signIn">Déjà un compte ? Se connecter</button>
        </div>
      </template>

      <template v-else-if="state === 'confirm'">
        <div class="se-eyebrow">petite <Squiggle>vérif</Squiggle></div>
        <div class="se-title">autre compte.</div>
        <div class="se-body">
          cette invitation a été envoyée à <strong>{{ preview?.email }}</strong>, mais vous êtes
          connecté·e en <strong>{{ me?.email }}</strong>. continuez avec ce compte, ou changez.
        </div>
        <div class="se-cta se-cta-col">
          <Btn @click="accept">Continuer en {{ me?.email }}</Btn>
          <button class="linklike" @click="switchAccount">Changer de compte</button>
        </div>
      </template>

      <template v-else-if="state === 'ok'">
        <div class="se-eyebrow">bienvenue</div>
        <div class="se-title">vous êtes <Squiggle>dans oto</Squiggle>.</div>
        <div class="se-body">
          <template v-if="orgName">vous avez rejoint <strong>{{ orgName }}</strong> — c'est votre espace actif. prochaine étape : connecter vos comptes et poser vos clés.</template>
          <template v-else>votre accès est ouvert. prochaine étape : créer votre espace de travail.</template>
        </div>
        <div class="se-cta">
          <Btn @click="router.push('/overview')">{{ orgName ? 'Aller à la console' : 'Créer mon espace' }}</Btn>
        </div>
      </template>

      <template v-else-if="errCode === 'email_mismatch'">
        <div class="se-title">mauvais <Squiggle>compte</Squiggle>.</div>
        <div class="se-body">{{ errMsg }}</div>
        <div class="se-cta">
          <Btn @click="switchAccount">Se connecter avec un autre compte</Btn>
        </div>
      </template>

      <template v-else>
        <div class="se-title">invitation <Squiggle>invalide</Squiggle>.</div>
        <div class="se-body">{{ errMsg }}</div>
        <div class="se-cta">
          <Btn kind="ghost" @click="router.push('/overview')">Aller à la console</Btn>
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
