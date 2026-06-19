<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Btn from '@/components/console/Btn.vue'
import Squiggle from '@/components/console/Squiggle.vue'
import { useAuth } from '@/composables/useAuth'
import { useMe } from '@/composables/useMe'
import { previewInvite, acceptInvite } from '@/api/console'
import type { InvitePreview } from '@/types/api'
import { humanize } from '@/lib/errors'

const router = useRouter()
const { isAuthenticated, login, logout } = useAuth()
const { reload } = useMe()

// 'loading'  : aperçu en cours
// 'invited'  : invitation valide, pas connecté → accueil + CTA création de compte
// 'joining'  : connecté → acceptation en cours
// 'ok'       : rejoint
// 'error'    : token invalide/expiré OU échec d'acceptation
const state = ref<'loading' | 'invited' | 'joining' | 'ok' | 'error'>('loading')
const preview = ref<InvitePreview | null>(null)
const orgName = ref<string | null>(null)
const errMsg = ref('')
const errCode = ref('')
const token = ref('')

function codeOf(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  return raw.includes(' ') ? raw.slice(raw.indexOf(' ') + 1) : raw
}

const invitePath = () => `/invite?token=${encodeURIComponent(token.value)}`

// Crée un compte (ou se connecte) avec l'email invité pré-rempli, puis revient ici.
function createAccount() { login(invitePath(), 'register', preview.value?.email ?? undefined) }
function signIn() { login(invitePath(), 'sign_in', preview.value?.email ?? undefined) }
// Mauvais compte connecté : se déconnecter et revenir sur ce lien.
async function switchAccount() {
  await logout(`${window.location.origin}${invitePath()}`)
}

async function accept() {
  state.value = 'joining'
  try {
    const r = await acceptInvite(token.value)
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
  token.value = new URLSearchParams(window.location.search).get('token') ?? ''
  if (!token.value) { state.value = 'error'; errMsg.value = 'this invitation link is missing its token.'; return }
  // Aperçu public d'abord : on accompagne avant tout bounce vers l'auth.
  try {
    preview.value = await previewInvite(token.value)
  } catch (e) {
    errCode.value = codeOf(e)
    errMsg.value = humanize(e)
    state.value = 'error'
    return
  }
  // Connecté → on accepte directement ; sinon on présente l'accueil.
  if (isAuthenticated.value) await accept()
  else state.value = 'invited'
})
</script>

<template>
  <div class="invite-page">
    <div class="state-empty">
      <span class="o-medallion o-medallion-lg">o</span>

      <template v-if="state === 'loading' || state === 'joining'">
        <div class="se-title">{{ state === 'joining' ? 'joining…' : 'one moment…' }}</div>
        <div class="se-body">checking your invitation.</div>
      </template>

      <template v-else-if="state === 'invited'">
        <div class="se-eyebrow">you're <Squiggle>invited</Squiggle></div>
        <div class="se-title">welcome to oto.</div>
        <div class="se-body">
          <template v-if="preview?.inviter">{{ preview.inviter }} invited you</template>
          <template v-else>you've been invited</template>
          <template v-if="preview && !preview.referral && preview.org_name"> to join <strong>{{ preview.org_name }}</strong></template>.
          create your account<template v-if="preview?.email"> as <strong>{{ preview.email }}</strong></template> to get in.
        </div>
        <div class="se-cta se-cta-col">
          <Btn @click="createAccount">create my account</Btn>
          <button class="linklike" @click="signIn">already have an account? sign in</button>
        </div>
      </template>

      <template v-else-if="state === 'ok'">
        <div class="se-title">welcome <Squiggle>aboard</Squiggle>.</div>
        <div class="se-body">
          <template v-if="orgName">you've joined <strong>{{ orgName }}</strong>. it's now your active workspace.</template>
          <template v-else>your access is open. let's set up your workspace.</template>
        </div>
        <div class="se-cta">
          <Btn @click="router.push('/overview')">go to console</Btn>
        </div>
      </template>

      <template v-else-if="errCode === 'email_mismatch'">
        <div class="se-title">wrong <Squiggle>account</Squiggle>.</div>
        <div class="se-body">{{ errMsg }}</div>
        <div class="se-cta">
          <Btn @click="switchAccount">sign in with another account</Btn>
        </div>
      </template>

      <template v-else>
        <div class="se-title">invitation <Squiggle>problem</Squiggle>.</div>
        <div class="se-body">{{ errMsg }}</div>
        <div class="se-cta">
          <Btn kind="ghost" @click="router.push('/overview')">go to console</Btn>
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
