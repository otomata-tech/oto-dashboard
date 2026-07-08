import { computed, ref, watch } from 'vue'
import { useMe } from '@/composables/useMe'
import { getOrg } from '@/api/console'
import type { OrgDetail } from '@/types/api'
import { humanize } from '@/lib/errors'

// Scope ORG (org active) — facteur commun des pages /org/* qui ont besoin du détail de
// l'org (membres, paramètres). `getOrg` re-vérifie l'autz côté serveur ; `isOrgAdmin`
// (rôle sur CETTE org) masque seulement les contrôles. Chaque page qui l'utilise fetch
// son propre détail (pas d'état partagé mutable) — cohérent avec useTeamScope.
export function useOrgScope() {
  const { me } = useMe()
  const activeOrgId = computed<number | null>(() => me.value?.active_org ?? null)
  const meSub = computed(() => me.value?.sub ?? null)

  const detail = ref<OrgDetail | null>(null)
  const error = ref<string | null>(null)
  const loaded = ref(false)
  const isOrgAdmin = computed(() => detail.value?.org.my_role === 'org_admin')

  async function reload() {
    const id = activeOrgId.value
    loaded.value = false
    if (id == null) { detail.value = null; loaded.value = true; return }
    try { detail.value = await getOrg(id); error.value = null }
    catch (e) { error.value = humanize(e); detail.value = null }
    finally { loaded.value = true }
  }
  watch(activeOrgId, reload, { immediate: true })

  return { activeOrgId, meSub, detail, error, loaded, isOrgAdmin, reload }
}
