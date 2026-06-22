import LogtoClient from '@logto/browser'
import { ref } from 'vue'
import { resetAnalytics } from '@/lib/analytics'

// Auth Logto self-hosted (auth.oto.ninja, tenant dédié) — PKCE, audience = API oto-mcp.
// Interface stable du scaffold dev-init : initAuth / login / logout / getAccessToken.
const endpoint = import.meta.env.VITE_LOGTO_ENDPOINT as string
const appId = import.meta.env.VITE_LOGTO_APP_ID as string
const resource = import.meta.env.VITE_LOGTO_AUDIENCE as string

const logto = new LogtoClient({
  endpoint,
  appId,
  resources: [resource],
})

const isAuthenticated = ref(false)
const userSub = ref<string | null>(null)

// Purge l'état persistant du SDK Logto (clés `logto:*` en local/sessionStorage).
// Sert à récupérer d'un state PKCE périmé (reste d'un ancien tenant/appId après une
// bascule, ou double tentative de login) qui fait échouer handleSignInCallback avec
// « State mismatched ». Nos propres clés (oto-*) ne sont pas préfixées `logto` → préservées.
function purgeLogtoStorage(): void {
  for (const store of [window.localStorage, window.sessionStorage]) {
    Object.keys(store)
      .filter((k) => k.startsWith('logto'))
      .forEach((k) => store.removeItem(k))
  }
}

export function useAuth() {
  async function initAuth(): Promise<void> {
    if (window.location.pathname === '/callback') {
      try {
        await logto.handleSignInCallback(window.location.href)
        sessionStorage.removeItem('oto-auth-retry')
        // Reprend la destination pré-login (ex. /invite?token=…), sinon racine.
        const dest = sessionStorage.getItem('oto-postlogin') || '/'
        sessionStorage.removeItem('oto-postlogin')
        window.history.replaceState({}, '', dest)
      } catch {
        // State PKCE périmé → au lieu de planter sur une LogtoError non catchée, on
        // purge le storage Logto et on relance UN login propre (le nouveau flow pose
        // un state frais qui matchera au retour). Garde anti-boucle : si ça échoue
        // encore après une relance, on abandonne vers le LoginGate (app montée non
        // authentifiée) plutôt que de boucler. `oto-postlogin` survit (non préfixé logto).
        purgeLogtoStorage()
        if (!sessionStorage.getItem('oto-auth-retry')) {
          sessionStorage.setItem('oto-auth-retry', '1')
          await logto.signIn({ redirectUri: `${window.location.origin}/callback` })
          return
        }
        sessionStorage.removeItem('oto-auth-retry')
        window.history.replaceState({}, '', '/')
      }
    }
    isAuthenticated.value = await logto.isAuthenticated()
    if (isAuthenticated.value) {
      const claims = await logto.getIdTokenClaims()
      userSub.value = claims.sub
    }
  }

  async function login(
    returnTo?: string,
    firstScreen?: 'sign_in' | 'register',
    loginHint?: string,
    oneTimeToken?: string,
  ): Promise<void> {
    if (returnTo) sessionStorage.setItem('oto-postlogin', returnTo)
    // Magic link : l'OTT (one-time-token Logto) passe en extraParams → la custom
    // UI le consomme et authentifie sans saisie de code. Absent → flow normal.
    const extraParams = oneTimeToken ? { one_time_token: oneTimeToken } : undefined
    await logto.signIn({ redirectUri: `${window.location.origin}/callback`, firstScreen, loginHint, extraParams })
  }

  async function logout(redirectTo?: string): Promise<void> {
    // Coupe le lien identité↔session analytics avant de quitter.
    resetAnalytics()
    await logto.signOut(redirectTo || window.location.origin)
  }

  async function getAccessToken(): Promise<string> {
    const token = await logto.getAccessToken(resource)
    // @logto/browser peut renvoyer undefined sur session morte au lieu de throw
    // (gotcha connu) → erreur franche plutôt qu'un « Bearer undefined ».
    if (!token) throw new Error('stale_session')
    return token
  }

  return { isAuthenticated, userSub, initAuth, login, logout, getAccessToken }
}
