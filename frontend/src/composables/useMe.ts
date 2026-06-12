import { ref } from 'vue'
import { getMe } from '@/api/console'
import type { Me } from '@/types/api'

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
