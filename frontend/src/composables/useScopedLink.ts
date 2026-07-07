import { useRoute, useRouter } from 'vue-router'
import { scopedPath } from '@/lib/viewOrg'

// Génère un lien de navigation préfixé par l'org/équipe de CONSULTATION portée par
// l'URL COURANTE (`/o/:orgId[/g/:groupId]/…`, ADR 0023). Déterministe : le préfixe est
// dérivé de la route active (`route.params`), pas d'un état module mutable — sur
// `/o/81/projects/8`, `scoped('/connectors')` → `/o/81/connectors`, donc les liens du
// menu ne « retombent » plus sur la maison.
//
// Ne préfixe QUE les destinations org-scopées : la route cible en décide via
// `meta.orgScoped` (source de vérité), donc `/account`, `/activity`, `/platform/*`
// restent nues même en contexte de consultation.
export function useScopedLink() {
  const route = useRoute()
  const router = useRouter()

  function scoped(path: string): string {
    const orgId = typeof route.params.orgId === 'string' ? route.params.orgId : null
    if (!orgId) return path // maison (ou page non-org) : on laisse le chemin nu
    if (!router.resolve(path).meta.orgScoped) return path
    const groupId = typeof route.params.groupId === 'string' ? route.params.groupId : null
    return scopedPath(path, orgId, groupId)
  }

  return { scoped }
}
