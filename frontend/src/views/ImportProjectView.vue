<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Btn from '@/components/console/Btn.vue'
import Squiggle from '@/components/console/Squiggle.vue'
import { useAuth } from '@/composables/useAuth'
import { useMe } from '@/composables/useMe'
import { importSharedProject } from '@/api/console'
import { humanize } from '@/lib/errors'

// « Ajouter à mon Oto » (deep-link depuis la page publique `<slug>.share.oto.cx`) :
// forke le projet partagé dans l'org active de l'utilisateur, ou récupère la copie
// déjà présente (idempotent), puis l'ouvre. Gère sa propre auth (hors shell console),
// même patron qu'InviteAcceptView.
//
// 'loading'  : import en cours
// 'signin'   : pas connecté → accueil + CTA connexion / création de compte
// 'error'    : slug manquant / projet introuvable / import refusé
const router = useRouter()
const { isAuthenticated, login } = useAuth()
const { reload } = useMe()

const state = ref<'loading' | 'signin' | 'error'>('loading')
const slug = ref('')
const errMsg = ref('')

// Retour post-login = l'URL courante (préserve `?slug=`).
const returnTo = () => `${window.location.pathname}${window.location.search}`
function createAccount() { login(returnTo(), 'register') }
function signIn() { login(returnTo(), 'sign_in') }

async function runImport() {
  state.value = 'loading'
  try {
    const r = await importSharedProject(slug.value)
    await reload()   // l'org active peut avoir gagné un projet → rafraîchir le contexte
    router.replace(`/projects/${r.project_id}`)
  } catch (e) {
    errMsg.value = humanize(e)
    state.value = 'error'
  }
}

onMounted(async () => {
  slug.value = (new URLSearchParams(window.location.search).get('slug') ?? '').trim()
  if (!slug.value) {
    state.value = 'error'; errMsg.value = 'ce lien de partage est incomplet (slug manquant).'; return
  }
  if (isAuthenticated.value) await runImport()
  else state.value = 'signin'
})
</script>

<template>
  <div class="import-page">
    <div class="state-empty">
      <span class="o-medallion o-medallion-lg">o</span>

      <template v-if="state === 'loading'">
        <div class="se-title">on récupère le projet…</div>
        <div class="se-body">on l'ajoute à ton espace de travail.</div>
      </template>

      <template v-else-if="state === 'signin'">
        <div class="se-eyebrow">un projet <Squiggle>partagé</Squiggle></div>
        <div class="se-title">ajoute-le à ton Oto.</div>
        <div class="se-body">
          connecte-toi (ou crée ton compte) pour copier ce projet dans ton espace —
          son brief, ses procédures et ses tableaux, prêts à l'emploi.
        </div>
        <div class="se-cta se-cta-col">
          <Btn @click="createAccount">Créer mon compte</Btn>
          <button class="linklike" @click="signIn">Déjà un compte ? Se connecter</button>
        </div>
      </template>

      <template v-else>
        <div class="se-title">import <Squiggle>impossible</Squiggle>.</div>
        <div class="se-body">{{ errMsg }}</div>
        <div class="se-cta">
          <Btn kind="ghost" @click="router.push('/overview')">Aller à la console</Btn>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.import-page {
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
