import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  registreOf, scopeOf, firstSection,
  type Registre, type GovScope,
} from '@/lib/consoleNav'

// Scope de gouvernance mémorisé (module-level → persiste entre navigations,
// partagé par la sidebar et le topbar). Défaut : org.
const govScope = ref<GovScope>('org')

// Le registre/scope actif est DÉRIVÉ de la route (chaque section connaît son
// registre via consoleNav). Pas d'état dupliqué : la route est la vérité.
export function useScope() {
  const route = useRoute()
  const router = useRouter()

  const section = computed(() => String(route.params.section || 'overview'))

  const registre = computed<Registre>(() =>
    route.name === 'admin-user' ? 'gov' : registreOf(section.value))

  const activeScope = computed<GovScope>(() => {
    if (route.name === 'admin-user') return 'platform'
    return scopeOf(section.value) ?? govScope.value
  })

  // Tient le scope mémorisé synchro quand on atterrit sur une section de gouvernance
  // (clic direct dans la sidebar) → le sélecteur reflète toujours la réalité.
  watch(() => section.value, (s) => {
    const sc = route.name === 'admin-user' ? 'platform' : scopeOf(s)
    if (sc) govScope.value = sc
  }, { immediate: true })

  function goRegistre(r: Registre) {
    if (r === registre.value) return
    router.push(`/console/${firstSection(r, r === 'gov' ? govScope.value : undefined)}`)
  }

  function goScope(s: GovScope) {
    if (s === activeScope.value && registre.value === 'gov') return
    govScope.value = s
    router.push(`/console/${firstSection('gov', s)}`)
  }

  return { registre, activeScope, govScope, goRegistre, goScope }
}
