import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { affichesDeQuery } from '@/lib/automationsEspace'

// Ce qu'une liste d'exécutions a déroulé, porté par l'URL (`?shown=`, oto#214). La liste le
// relit au montage : un rechargement, ou un retour depuis la page d'une exécution, retrouve
// les mêmes lignes. « Afficher la suite » REMPLACE l'entrée d'historique au lieu d'en
// empiler une : le retour navigateur ramène à la page précédente, pas au pli précédent.
export function useAffichesUrl() {
  const route = useRoute()
  const router = useRouter()
  const affiches = computed(() => affichesDeQuery(route.query))
  function surAffiches(n: number) {
    void router.replace({ query: { ...route.query, shown: String(n) } })
  }
  return { affiches, surAffiches }
}
