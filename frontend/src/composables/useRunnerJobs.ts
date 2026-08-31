import { onBeforeUnmount, onMounted, ref } from 'vue'
import { listRunnerJobs, type RunnerJob } from '@/api/console'
import { humanize } from '@/lib/errors'

// La file d'exécution du runner, chargée UNE fois pour toute la page.
//
// La surveillance et la file lisent la même population : deux composants qui
// appellent chacun `listRunnerJobs` doubleraient la requête toutes les 30 s et,
// pire, pourraient afficher deux instantanés différents côte à côte — un compteur
// qui contredit la liste juste en dessous fait douter des deux.
//
// L'état est un singleton de module (patron de `useMe`) : les abonnés se comptent,
// le premier arrivé démarre les horloges, le dernier parti les arrête.

const jobs = ref<RunnerJob[]>([])
const loaded = ref(false)
const error = ref<string | null>(null)
// L'horloge de la page : recalculée au tick, pour que les séjours « en cours »
// avancent à l'écran au lieu de se figer au chargement.
const maintenant = ref(Date.now())

// La fenêtre lue. Le backend plafonne à 200 ; tout ce que la page affirme porte
// sur ces N derniers travaux, et chaque écran le dit — un total présenté comme
// « la campagne » serait faux dès que la file dépasse la fenêtre.
export const FENETRE = 120

let inflight: Promise<void> | null = null
let abonnes = 0
let tick: ReturnType<typeof setInterval> | null = null
let horloge: ReturnType<typeof setInterval> | null = null

async function charger(): Promise<void> {
  // Deux cartes montées dans le même tour appellent `charger` simultanément :
  // sans cette déduplication, le premier rendu partirait en double requête.
  if (inflight) return inflight
  inflight = (async () => {
    try {
      // Chargé SANS filtre d'état : le tri se fait côté vue, et les compteurs
      // portent ainsi sur la même population quel que soit le filtre affiché.
      jobs.value = (await listRunnerJobs(undefined, FENETRE)).jobs
      error.value = null
    } catch (e) {
      error.value = humanize(e)
    } finally {
      loaded.value = true
      maintenant.value = Date.now()
      inflight = null
    }
  })()
  return inflight
}

function abonner() {
  abonnes += 1
  void charger()
  if (abonnes > 1) return
  // Rafraîchissement léger tant que la page est ouverte : un job « en cours »
  // figé à l'écran après sa conclusion fait douter de la surveillance elle-même.
  tick = setInterval(() => { void charger() }, 30_000)
  // Les séjours avancent chaque seconde sans rappeler le serveur.
  horloge = setInterval(() => { maintenant.value = Date.now() }, 1_000)
}

function desabonner() {
  abonnes = Math.max(0, abonnes - 1)
  if (abonnes > 0) return
  if (tick) { clearInterval(tick); tick = null }
  if (horloge) { clearInterval(horloge); horloge = null }
}

/** `veille: true` branche le composant sur le rafraîchissement partagé pour la
 * durée de sa vie. Sans l'option, l'état est lu tel quel (tests, lecture ponctuelle). */
export function useRunnerJobs(options: { veille?: boolean } = {}) {
  if (options.veille) {
    onMounted(abonner)
    onBeforeUnmount(desabonner)
  }
  return { jobs, loaded, error, maintenant, charger }
}
