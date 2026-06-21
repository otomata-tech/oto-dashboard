import LogtoClient from '@logto/browser'
import { ref } from 'vue'
import { resetAnalytics } from '@/lib/analytics'

// Auth Logto self-hosted (auth.oto.zone) — PKCE, audience = API oto-mcp.
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

export function useAuth() {
  async function initAuth(): Promise<void> {
    if (window.location.pathname === '/callback') {
      await logto.handleSignInCallback(window.location.href)
      // Reprend la destination pré-login (ex. /invite?token=…), sinon racine.
      const dest = sessionStorage.getItem('oto-postlogin') || '/'
      sessionStorage.removeItem('oto-postlogin')
      window.history.replaceState({}, '', dest)
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
