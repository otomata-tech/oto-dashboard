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
import { computed, ref, watch } from 'vue'
import { ApiError } from '@/api'
import {
  getModelSubscriptions, getMyOrgs, getOrgModelSubscription, removeModelSubscription, sendModelSubscriptionCode,
  setModelSubscriptionLending, setModelSubscriptionLimit, setOrgModelSubscriptionLimit,
  setOrgModelSubscriptionMode, startModelSubscriptionLogin,
} from '@/api/console'
import type { ModelSubscription, Org, OrgModelSubscriptionCap, OrgModelSubscriptionMode } from '@/types/api'

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
  'subscription_not_enabled', 'login_failed', 'farm_unavailable', 'not_connected', 'invalid_limit',
  'not_org_member', 'nothing_to_change',
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

  // Le plafond perso a son propre état d'envoi : un refus s'affiche SOUS le réglage, pas
  // dans l'état de connexion.
  const limitBusy = ref(false)
  const limitError = ref<unknown>(null)

  /** Pose (1..100) ou retire (null) le plafond perso ; true = enregistré. La réponse est
   *  l'abonnement relu : c'est elle qui dit le plafond en vigueur. */
  async function setLimit(limit: number | null): Promise<boolean> {
    limitBusy.value = true
    limitError.value = null
    try {
      sub.value = await setModelSubscriptionLimit(family, limit)
      return true
    } catch (e) {
      limitError.value = e
      return false
    } finally {
      limitBusy.value = false
    }
  }

  // Le prêt au pool, idem : son propre état d'envoi, refus affiché sous les cases.
  const lendBusy = ref(false)
  const lendError = ref<unknown>(null)

  /** Envoie l'ensemble COMPLET des orgs prêtées (il remplace le précédent) ; true =
   *  enregistré. La réponse est l'abonnement relu : c'est elle qui dit `lent_to`. */
  async function setLending(lentTo: number[]): Promise<boolean> {
    lendBusy.value = true
    lendError.value = null
    try {
      sub.value = await setModelSubscriptionLending(family, lentTo)
      return true
    } catch (e) {
      lendError.value = e
      return false
    } finally {
      lendBusy.value = false
    }
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
    load, start, submitCode, restart, limitBusy, limitError, setLimit, lendBusy, lendError, setLending,
    disconnect: () => remove(false),
    destroy: () => remove(true),
  }
}

// ── Plafond de consommation ──────────────────────────────────────────────────────
// Part maximale de l'usage TOTAL du compte Claude (fenêtres 5 h et 7 j, usage perso
// compris) que les agents peuvent atteindre. Seuil appliqué = min(plafond de l'org du run,
// plafond perso s'il existe). Au seuil, le run en cours finit ; les suivants attendent la
// réinitialisation des fenêtres.

export const LIMIT_MIN = 1
export const LIMIT_MAX = 100
/** ⚠️ Miroir de `_abonnement.DEFAUT_LIMITE_PCT` (oto-backend) : le plafond d'une org qui
 *  n'a rien réglé. Il ne sert qu'à NOMMER le défaut sur le bouton qui y revient ; la valeur
 *  en vigueur, elle, est toujours lue (`GET …/model-subscriptions/{family}`). */
export const PLATFORM_DEFAULT_LIMIT = 80

/** Miroir de `exiger_limite_valide` : un entier de 1 à 100, ou null. */
export function isValidLimit(v: number | null): boolean {
  return v === null || (Number.isInteger(v) && v >= LIMIT_MIN && v <= LIMIT_MAX)
}

/** La saisie d'un champ % → la valeur à envoyer, ou `undefined` si elle ne passerait pas
 *  (vide, décimale, hors bornes) : le bouton se désactive au lieu d'essuyer un 400. */
export function parseLimitInput(raw: string | number | null | undefined): number | undefined {
  const s = String(raw ?? '').trim()
  if (!/^\d+$/.test(s)) return undefined
  const n = Number(s)
  return isValidLimit(n) ? n : undefined
}

/** Le brouillon d'un réglage de plafond : `own` = un plafond chiffré (sinon null : aucun
 *  plafond perso) et `text` = la saisie. Réinitialisé chaque fois que la valeur ENREGISTRÉE
 *  change (chargement, enregistrement). `value` vaut `undefined` tant que la saisie est
 *  invalide ; `dirty` = une valeur valide, différente de l'enregistrée. */
export function useLimitDraft(saved: () => number | null | undefined) {
  const own = ref(false)
  const text = ref<string | number>('')
  function reset() {
    const s = saved() ?? null
    own.value = s !== null
    text.value = s === null ? '' : s
  }
  watch(saved, reset, { immediate: true })
  const value = computed<number | null | undefined>(() => (own.value ? parseLimitInput(text.value) : null))
  const invalid = computed(() => value.value === undefined)
  const dirty = computed(() => value.value !== undefined && value.value !== (saved() ?? null))
  return { own, text, value, invalid, dirty, reset }
}

/** Le plafond d'une org sur les abonnements de ses membres : lecture pour tout membre,
 *  écriture (`set`) pour l'admin d'org — c'est au geste de le vérifier avant d'appeler. */
export function useOrgModelSubscription(orgId: () => number, family: string = CLAUDE_FAMILY) {
  const cap = ref<OrgModelSubscriptionCap | null>(null)
  const loaded = ref(false)
  const error = ref<unknown>(null)
  const busy = ref(false)

  async function load() {
    busy.value = true
    error.value = null
    try {
      cap.value = await getOrgModelSubscription(orgId(), family)
      loaded.value = true
    } catch (e) {
      error.value = e
    } finally {
      busy.value = false
    }
  }

  /** 1..100 = plafond de l'org ; null = revenir au défaut. true = enregistré (relu). */
  async function set(limit: number | null): Promise<boolean> {
    busy.value = true
    error.value = null
    try {
      cap.value = await setOrgModelSubscriptionLimit(orgId(), family, limit)
      return true
    } catch (e) {
      error.value = e
      return false
    } finally {
      busy.value = false
    }
  }

  // Le mode a son propre état d'envoi : son refus s'affiche sous le choix du mode, pas
  // sous le plafond.
  const modeBusy = ref(false)
  const modeError = ref<unknown>(null)

  /** Passe l'org en `personnel` ou en `pool` ; true = enregistré (relu, `pool_size` compris). */
  async function setMode(mode: OrgModelSubscriptionMode): Promise<boolean> {
    modeBusy.value = true
    modeError.value = null
    try {
      cap.value = await setOrgModelSubscriptionMode(orgId(), family, mode)
      return true
    } catch (e) {
      modeError.value = e
      return false
    } finally {
      modeBusy.value = false
    }
  }

  return { cap, loaded, error, busy, load, set, modeBusy, modeError, setMode }
}

// ── Mode de l'org et pool ────────────────────────────────────────────────────────
// `personnel` (défaut) : un travail tourne sur l'abonnement de SON demandeur. `pool` : sur
// celui d'un membre qui l'a PRÊTÉ à l'org (opt-in, par org), le moins récemment servi
// d'abord ; sans prêteur libre, les travaux attendent. Le forfait consommé est celui du
// prêteur, sous son plafond (le plus strict entre celui de l'org et le sien).

export const MODES = ['personnel', 'pool'] as const satisfies readonly OrgModelSubscriptionMode[]

/** Le mode servi (`str`), resserré sur l'ensemble fermé. Une valeur inconnue LÈVE : la
 *  montrer comme l'un des deux ferait mentir l'écran sur qui paie les travaux. */
export function modeOf(cap: Pick<OrgModelSubscriptionCap, 'mode'>): OrgModelSubscriptionMode {
  if ((MODES as readonly string[]).includes(cap.mode)) return cap.mode as OrgModelSubscriptionMode
  throw new Error(`mode d'abonnement inconnu : ${cap.mode}`)
}

/** Une org où l'on peut prêter : son mode (null = illisible, la lecture a échoué). */
export interface LendableOrg {
  org: Org
  mode: OrgModelSubscriptionMode | null
  poolSize: number | null
}

/** Les orgs dont la personne est membre, avec le mode de chacune. L'espace personnel est
 *  écarté : on n'y prête qu'à soi-même. `memberIds` = TOUTES ses orgs, espace perso compris,
 *  pour borner l'ensemble envoyé (le serveur refuse une org dont on n'est pas membre). */
export function useLendableOrgs(family: string = CLAUDE_FAMILY) {
  const orgs = ref<LendableOrg[]>([])
  const memberIds = ref<number[]>([])
  const loaded = ref(false)
  const error = ref<unknown>(null)
  const busy = ref(false)

  async function load() {
    busy.value = true
    error.value = null
    try {
      const mine = (await getMyOrgs()).orgs
      memberIds.value = mine.map((o) => o.id)
      orgs.value = await Promise.all(mine.filter((o) => !o.personal).map(async (org) => {
        try {
          const cap = await getOrgModelSubscription(org.id, family)
          return { org, mode: modeOf(cap), poolSize: cap.pool_size }
        } catch {
          // Une org illisible n'empêche pas les autres : elle s'affiche « mode inconnu »,
          // et seul le retrait d'un prêt existant y reste possible.
          return { org, mode: null, poolSize: null }
        }
      }))
      loaded.value = true
    } catch (e) {
      error.value = e
    } finally {
      busy.value = false
    }
  }

  return { orgs, memberIds, loaded, error, busy, load }
}

/** Le brouillon des cases « prêter à cette org ». Réinitialisé chaque fois que l'ensemble
 *  ENREGISTRÉ change. Cocher n'est possible que pour une org en `pool` ; décocher un prêt
 *  existant l'est toujours (retirer n'est jamais refusé). `payload` = l'ensemble COMPLET à
 *  envoyer, borné aux orgs dont on est membre, trié. */
export function useLendingDraft(saved: () => number[] | undefined, memberIds: () => number[]) {
  const selected = ref<Set<number>>(new Set())
  function reset() { selected.value = new Set(saved() ?? []) }
  watch(() => (saved() ?? []).join(','), reset, { immediate: true })

  function isSavedLent(id: number) { return (saved() ?? []).includes(id) }
  function canToggle(o: LendableOrg) { return o.mode === 'pool' || isSavedLent(o.org.id) }
  function toggle(id: number, on: boolean) {
    const next = new Set(selected.value)
    if (on) next.add(id)
    else next.delete(id)
    selected.value = next
  }

  const bounded = (ids: Iterable<number>) => {
    const members = new Set(memberIds())
    return [...new Set(ids)].filter((id) => members.has(id)).sort((a, b) => a - b)
  }
  const payload = computed(() => bounded(selected.value))
  const dirty = computed(() => payload.value.join(',') !== bounded(saved() ?? []).join(','))
  return { selected, canToggle, isSavedLent, toggle, payload, dirty, reset }
}
