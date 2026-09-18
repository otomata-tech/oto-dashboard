import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useMe, isOrgAdmin as isOrgAdminOf } from '@/composables/useMe'
import { getGroup } from '@/api/console'
import type { GroupDetail } from '@/types/api'
import { humanize } from '@/lib/errors'

// Scope ÉQUIPE piloté par l'URL (ADR 0023) — facteur commun des pages /team/*. L'équipe
// vient du préfixe `/o/:org/g/:groupId/` ; repli sur l'équipe active (`me.active_group`)
// quand une page team est ouverte sans préfixe d'équipe (sémantique legacy de `/group`).
// Entrer dans une équipe = NAVIGATION (le dashboard affiche cette équipe), PAS une mutation
// de « maison » MCP. L'autz est portée backend (`getGroup` re-vérifie) ; `canManage` masque
// les contrôles réservés au CHEF (membres, secrets, readme, suppression) ; `isMember`
// masque les contrôles ouverts à tout MEMBRE (oto-backend#681 : écrire une procédure
// d'équipe, et la restaurer, est un geste de travail, pas un geste d'administration —
// `GROUP_MEMBER_OF` gate déjà `group.get`, donc atteindre cet écran EST la preuve
// d'appartenance ; on la relit ici sur `my_role` pour rester correct même si un jour
// `GroupDoctrineCard` est monté hors de `TeamScopeHeader`).
export function useTeamScope() {
  const route = useRoute()
  const { me } = useMe()

  const groupId = computed<number | null>(() => {
    const p = route.params.groupId
    if (typeof p === 'string' && p) return Number(p)
    return me.value?.active_group ?? null
  })
  const isOrgAdmin = computed(() => isOrgAdminOf(me.value))
  const meSub = computed(() => me.value?.sub ?? null)

  const detail = ref<GroupDetail | null>(null)
  const error = ref<string | null>(null)
  const loaded = ref(false)
  const canManage = computed(() =>
    !!detail.value && (detail.value.group.my_role === 'group_admin' || isOrgAdmin.value))
  // Tout membre explicite de l'équipe (pas seulement son chef), plus l'escalade
  // org/plateforme qui gère l'équipe sans y être formellement membre.
  const isMember = computed(() =>
    !!detail.value && (detail.value.group.my_role != null || isOrgAdmin.value))

  async function reload() {
    const id = groupId.value
    loaded.value = false
    if (id == null) { detail.value = null; loaded.value = true; return }
    try { detail.value = await getGroup(id); error.value = null }
    catch (e) { error.value = humanize(e); detail.value = null }
    finally { loaded.value = true }
  }
  watch(groupId, reload, { immediate: true })

  return { groupId, detail, error, loaded, canManage, isMember, meSub, reload }
}
