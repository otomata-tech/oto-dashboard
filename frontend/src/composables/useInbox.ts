// Inbox d'accueil partagée (lot 3 Ship 3) — singleton : l'accueil la rend, la
// sidebar en lit le compteur (badge). Rechargeable après une résolution.
import { ref } from 'vue'
import { getInbox } from '@/api/console'
import type { Inbox } from '@/types/api'

const inbox = ref<Inbox | null>(null)
const loading = ref(false)

async function load() {
  loading.value = true
  try { inbox.value = await getInbox() } catch { /* home ne casse jamais */ }
  finally { loading.value = false }
}

export function useInbox() {
  return { inbox, loading, load, reload: load }
}
