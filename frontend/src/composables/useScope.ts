import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { levelOf, type NavLevel } from '@/lib/consoleNav'

export type { NavLevel }

// Niveau de gouvernance (mon espace / mon org / plateforme) — section et niveau
// courants DÉRIVÉS de la route (meta), jamais dupliqués en état : la route est la
// vérité. Le choix du niveau se fait par navigation (menu profil, pied de sidebar).
export function useScope() {
  const route = useRoute()

  const section = computed(() => String(route.meta.section || '/overview'))
  const level = computed<NavLevel>(
    () => (route.meta.level as NavLevel | undefined) ?? levelOf(section.value),
  )

  return { section, level }
}
