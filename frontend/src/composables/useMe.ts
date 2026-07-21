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
