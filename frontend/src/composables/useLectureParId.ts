import { computed, onMounted, ref, shallowRef, type ComputedRef, type Ref } from 'vue'
import { useRoute } from 'vue-router'
import { ApiError } from '@/api'
import { inscrireRafraichissement } from '@/composables/useRafraichissement'
import { idDAdresse } from '@/lib/automationsEspace'
import { humanize } from '@/lib/errors'
import { targetRefusal, type TargetRefusal } from '@/lib/routeTarget'

// Lire l'objet qu'une ADRESSE désigne (oto#214) — une campagne, une programmation, une
// exécution —, avec des issues qui ne substituent jamais un autre objet :
//   • une adresse qui ne porte pas d'identifiant → aucun appel, la page le dit ;
//   • 404 du serveur → le refus avec son code et sa phrase (`targetRefusal`) ;
//   • 403 `beta_required` → la bêta, dite sans rouge ;
//   • tout autre échec → l'erreur de la page ; la dernière lecture réussie reste affichée.
//
// La lecture s'inscrit au rafraîchissement de la page. L'objet peut aussi être ÉCRIT par un
// geste ou par une autre lecture qui le rend (`appliquer`) : chaque demande prend un RANG à
// son départ, et seule une demande plus récente que la dernière appliquée écrit — une
// lecture partie avant un geste n'écrase jamais ce que le geste a rendu.

export interface LectureParId<T> {
  brut: ComputedRef<string>
  id: ComputedRef<number | null>
  objet: Ref<T | null>
  refus: Ref<TargetRefusal | null>
  beta: Ref<boolean>
  erreur: Ref<string | null>
  lu: Ref<boolean>
  lire: () => Promise<void>
  jeton: () => number
  appliquer: (rang: number, objet: T) => boolean
}

export function useLectureParId<T>(lireServeur: (id: number) => Promise<T>): LectureParId<T> {
  const route = useRoute()
  const brut = computed(() => (typeof route.params.id === 'string' ? route.params.id : ''))
  const id = computed(() => idDAdresse(brut.value))
  const objet = shallowRef<T | null>(null)
  const refus = ref<TargetRefusal | null>(null)
  const beta = ref(false)
  const erreur = ref<string | null>(null)
  const lu = ref(false)

  let rang = 0
  let applique = 0
  const jeton = () => ++rang

  function appliquer(n: number, o: T): boolean {
    if (n <= applique) return false
    applique = n
    objet.value = o
    return true
  }

  async function lire(): Promise<void> {
    const cible = id.value
    if (cible === null) { lu.value = true; return }
    const n = jeton()
    try {
      const o = await lireServeur(cible)
      if (!appliquer(n, o)) return
      refus.value = null
      beta.value = false
      erreur.value = null
    } catch (e) {
      if (n <= applique) return
      if (e instanceof ApiError && e.status === 404) {
        applique = n
        objet.value = null
        refus.value = targetRefusal(`#${cible}`, e)
      } else if (e instanceof ApiError && e.status === 403 && e.code === 'beta_required') {
        applique = n
        objet.value = null
        beta.value = true
      } else {
        erreur.value = humanize(e)
      }
    } finally {
      lu.value = true
    }
  }

  onMounted(lire)
  inscrireRafraichissement(lire)

  return { brut, id, objet, refus, beta, erreur, lu, lire, jeton, appliquer }
}
