import { ref } from 'vue'
import { getMe } from '@/api/console'
import { identifyUser } from '@/lib/analytics'
import { applyMeLocale } from '@/lib/i18n'
import { setSentryUser } from '@/lib/sentry'
import type { Me, Role } from '@/types/api'

// Profil utilisateur partagé (GET /api/me) — chargé une fois, relisible.
// Pilote l'identité (sidebar/topbar), le gating admin et le statut des providers.
const me = ref<Me | null>(null)
const error = ref<string | null>(null)
let inflight: Promise<Me | null> | null = null
// Horodatage du dernier chargement RÉUSSI (pour la revalidation SWR au focus).
let lastLoadedAt = 0

async function load(force = false): Promise<Me | null> {
  if (me.value && !force) return me.value
  if (inflight && !force) return inflight
  inflight = (async () => {
    try {
      me.value = await getMe()
      lastLoadedAt = Date.now()
      error.value = null
      // Relie la session PostHog à l'utilisateur (segmentation rôle/org).
      // La préférence de langue du compte fait autorité une fois `me` chargé.
      if (me.value) { identifyUser(me.value); setSentryUser(me.value.sub); applyMeLocale(me.value.locale) }
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      inflight = null
    }
    return me.value
  })()
  return inflight
}

// Revalidation SWR : rafraîchit `me` en arrière-plan quand l'onglet reprend le
// focus, SI le snapshot en mémoire a dépassé `maxAgeMs`. `me` est un singleton en
// mémoire (jamais persisté) → un onglet resté ouvert garde un vieux rôle après une
// promotion serveur (org_admin/super_admin) ; ce rafraîchissement le reflète sans
// hard refresh. No-op tant que `me` n'a jamais été chargé (aucun fetch spéculatif).
async function revalidateStale(maxAgeMs = 30_000): Promise<void> {
  if (!me.value || inflight) return
  if (Date.now() - lastLoadedAt < maxAgeMs) return
  await load(true)
}

export function useMe() {
  return { me, error, load, reload: () => load(true), revalidateStale }
}

// ── helpers de rôle plateforme (3 paliers : super_admin > admin > member) ──
// Source unique pour ne pas disperser la logique de gating dans les vues.
// « Voir la gouvernance plateforme » = opérateur (admin) OU super_admin ;
// les actions sensibles (rôles plateforme, platform keys) = super_admin seul.
type RoleHolder = { role?: Role } | null | undefined

export function isSuperAdmin(m: RoleHolder): boolean {
  return m?.role === 'super_admin'
}
// Opérateur = palier admin OU super_admin (le super_admin voit tout ce que voit
// l'opérateur). Gate l'accès à la section « platform · admin ».
export function isPlatformOperator(m: RoleHolder): boolean {
  return m?.role === 'admin' || m?.role === 'super_admin'
}

// ── rôle ORG (axe distinct du rôle plateforme) ────────────────────────────────
// Même raison d'être que les deux helpers ci-dessus : le gate `org_role === …`
// était recopié dans `useTeamScope` et dans `ConsoleIdentity`, et il allait l'être
// une troisième fois pour filtrer la sidebar d'org (#160).
type OrgRoleHolder = { org_role?: string | null; role?: Role } | null | undefined

// L'admin d'org TEL QUE LE SERVEUR LE TIENT (`roles.is_org_admin`) : l'org_admin de l'org
// active, ou le super_admin. JAMAIS l'`admin` plateforme : chaque op d'admin d'org le refuse
// en 403 (oto#210). ⚠️ Un rôle, pas un droit d'écrire : un geste passe par
// `canAdministerOrg` ci-dessous (oto#211).
export function isOrgAdmin(m: OrgRoleHolder): boolean {
  return m?.org_role === 'org_admin' || isSuperAdmin(m)
}

// ── écrire dans l'org active (oto#211) ────────────────────────────────────────
// En consultation (`active_org_readonly` : un opérateur plateforme ouvre une org où il n'a
// aucun rôle réel), `ViewAsMiddleware` refuse toute requête non-GET dont l'`op` n'est pas une
// lecture, en `403 view_as_read_only` — super_admin compris. Tout geste d'écriture d'un écran
// d'org ou d'automatisation passe donc par l'une de ces deux fonctions, jamais par le rôle
// seul. La lecture seule se dit une fois, dans la coque (`ConsultOrgBanner`) : un écran omet
// ses gestes, il ne la répète pas.
type OrgWriter = { org_role?: string | null; role?: Role; active_org_readonly?: boolean } | null | undefined

/** Un geste ouvert à tout membre (quitter l'org, annuler un envoi programmé, arrêter une
 * campagne) : un profil chargé, hors consultation. */
export function canWriteInOrg(m: OrgWriter): boolean {
  return !!m && m.active_org_readonly !== true
}

/** Un geste d'admin d'org : le rôle que le serveur tient (`isOrgAdmin`), hors consultation. */
export function canAdministerOrg(m: OrgWriter): boolean {
  return canWriteInOrg(m) && isOrgAdmin(m)
}

// Qui VOIT les écrans d'administration d'org (menu, « gérer mon org ») : l'admin d'org, et
// l'opérateur plateforme, à qui le serveur en SERT les lectures (en consultation, il le tient
// pour membre : `roles.effective_org_role`). Ne décide jamais d'un geste — c'est
// `isOrgAdmin` ; un écran dont les lectures mêmes exigent l'admin d'org (la supervision) se
// garde aussi par `isOrgAdmin` (oto#210).
export function seesOrgAdministration(m: OrgRoleHolder): boolean {
  return isOrgAdmin(m) || isPlatformOperator(m)
}
