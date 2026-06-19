import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { levelOf, firstPath, type NavLevel } from '@/lib/consoleNav'

export type { NavLevel }

// Niveau de gouvernance = un seul axe ordonné d'élévation (mon espace → mon org →
// la plateforme), projeté en UN segmented control. La section + le niveau courants
// sont DÉRIVÉS de la route (meta), jamais dupliqués en état : la route est la
// vérité. Le pill « profil actif » (quelle org) est l'axe orthogonal.
export function useScope() {
  const route = useRoute()
  const router = useRouter()

  const section = computed(() => String(route.meta.section || '/overview'))
  const level = computed<NavLevel>(
    () => (route.meta.level as NavLevel | undefined) ?? levelOf(section.value),
  )

  function goLevel(l: NavLevel) {
    if (l === level.value) return
    router.push(firstPath(l))
  }

  return { section, level, goLevel }
}
