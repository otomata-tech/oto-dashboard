import { ref } from 'vue'
import { getMe } from '@/api/console'
import { identifyUser } from '@/lib/analytics'
import type { Me, Role } from '@/types/api'

// Profil utilisateur partagé (GET /api/me) — chargé une fois, relisible.
// Pilote l'identité (sidebar/topbar), le gating admin et le statut des providers.
const me = ref<Me | null>(null)
const error = ref<string | null>(null)
let inflight: Promise<Me | null> | null = null

async function load(force = false): Promise<Me | null> {
  if (me.value && !force) return me.value
  if (inflight && !force) return inflight
  inflight = (async () => {
    try {
      me.value = await getMe()
      error.value = null
      // Relie la session PostHog à l'alpha user (segmentation rôle/org/accès).
      if (me.value) identifyUser(me.value)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      inflight = null
    }
    return me.value
  })()
  return inflight
}

export function useMe() {
  return { me, error, load, reload: () => load(true) }
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
