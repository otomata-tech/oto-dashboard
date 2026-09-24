// Abonnement de modèle PERSONNEL (Claude Pro/Max…) : l'état et le parcours de connexion
// de l'écran « Mon abonnement Claude » (`/account/claude`).
//
// Le parcours est celui du fournisseur, pas le nôtre : POST login rend une URL que la
// personne ouvre chez Anthropic ; Anthropic lui affiche un code ; elle le colle ici et
// PUT code le transmet à SON sandbox, où la session naît et reste. La plateforme ne voit
// ni ne stocke la session — elle ne relaie qu'une URL et un code à usage unique.
//
// Le chemin est ouvert à des personnes NOMMÉES, et aucune lecture ne dit à l'avance qui
// l'a : c'est le 403 `subscription_not_enabled` au premier geste qui le révèle. On le
// retient (`notEnabled`) pour que l'écran le DISE et retire le bouton, au lieu de laisser
// un levier qui échouera à chaque clic.
import { computed, ref } from 'vue'
import { ApiError } from '@/api'
import {
  getModelSubscriptions, removeModelSubscription, sendModelSubscriptionCode,
  startModelSubscriptionLogin,
} from '@/api/console'
import type { ModelSubscription } from '@/types/api'

/** La seule famille servie par abonnement aujourd'hui (`sub:sonnet|opus|haiku`). */
export const CLAUDE_FAMILY = 'claude_subscription'

export const STATUTS = ['connected', 'needs_login', 'paused_limit', 'disconnected'] as const
export type SubscriptionStatut = (typeof STATUTS)[number]
/** `none` = aucune ligne : jamais connecté, ou sandbox effacé. */
export type SubscriptionEtat = SubscriptionStatut | 'none'

/** Le statut servi, resserré sur l'ensemble fermé. Une valeur inconnue LÈVE : l'afficher
 *  comme un état connu ferait mentir l'écran sur ce que les agents peuvent faire. */
export function statutOf(s: ModelSubscription): SubscriptionStatut {
  if ((STATUTS as readonly string[]).includes(s.statut)) return s.statut as SubscriptionStatut
  throw new Error(`statut d'abonnement inconnu : ${s.statut}`)
}

/** Les refus que l'écran sait nommer ; les autres passent par `humanize`. */
export const KNOWN_ERRORS = [
  'subscription_not_enabled', 'login_failed', 'farm_unavailable', 'not_connected',
] as const

/** La clé i18n du message d'un refus connu, ou null. */
export function errorKey(e: unknown): string | null {
  if (!(e instanceof ApiError)) return null
  return (KNOWN_ERRORS as readonly string[]).includes(e.code) ? `modelSub.errors.${e.code}` : null
}

/** `idle` = rien en cours ; `code` = l'URL est ouverte, on attend le code du fournisseur. */
export type LoginStep = 'idle' | 'code'

export function useModelSubscription(family: string = CLAUDE_FAMILY) {
  const sub = ref<ModelSubscription | null>(null)
  const loaded = ref(false)
  const step = ref<LoginStep>('idle')
  const loginUrl = ref<string | null>(null)
  const notEnabled = ref(false)
  const error = ref<unknown>(null)
  const busy = ref(false)

  const etat = computed<SubscriptionEtat>(() => (sub.value ? statutOf(sub.value) : 'none'))

  // Un geste : `busy` pendant, l'erreur retenue après. Le refus d'option n'est pas une
  // erreur à afficher en rouge : c'est un état de la personne, qui remplace le parcours.
  async function geste<T>(fn: () => Promise<T>): Promise<T | undefined> {
    busy.value = true
    error.value = null
    try {
      return await fn()
    } catch (e) {
      if (e instanceof ApiError && e.code === 'subscription_not_enabled') {
        notEnabled.value = true
        step.value = 'idle'
        loginUrl.value = null
      } else {
        error.value = e
      }
      return undefined
    } finally {
      busy.value = false
    }
  }

  async function load() {
    await geste(async () => {
      const r = await getModelSubscriptions()
      sub.value = r.subscriptions.find((s) => s.family === family) ?? null
      loaded.value = true
    })
  }

  /** Ouvre la connexion chez le fournisseur ; rend l'URL à ouvrir, ou null si refusé. */
  async function start(): Promise<string | null> {
    const r = await geste(() => startModelSubscriptionLogin(family))
    if (!r) return null
    loginUrl.value = r.url
    step.value = 'code'
    return r.url
  }

  /** Transmet le code à son sandbox ; true = connecté. Un échec laisse l'étape en place :
   *  la personne relit le code, ou « Recommencer ». */
  async function submitCode(code: string): Promise<boolean> {
    const c = code.trim()
    if (!c) return false
    const r = await geste(() => sendModelSubscriptionCode(family, c))
    if (!r) return false
    sub.value = r
    step.value = 'idle'
    loginUrl.value = null
    return true
  }

  function restart() {
    step.value = 'idle'
    loginUrl.value = null
    error.value = null
  }

  // Après un retrait, on RELIT l'état plutôt que de le déduire : « se déconnecter » garde
  // la ligne (`disconnected`), « effacer le sandbox » la retire — c'est le serveur qui le dit.
  async function remove(destroy: boolean): Promise<boolean> {
    const r = await geste(() => removeModelSubscription(family, destroy))
    if (!r) return false
    await load()
    return true
  }

  return {
    sub, etat, loaded, step, loginUrl, notEnabled, error, busy,
    load, start, submitCode, restart,
    disconnect: () => remove(false),
    destroy: () => remove(true),
  }
}
