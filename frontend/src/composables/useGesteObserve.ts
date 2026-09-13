import { onBeforeUnmount, ref, type Ref } from 'vue'
import { ApiError } from '@/api'
import { ongletVisible } from '@/composables/useRafraichissement'
import { refusServi, type Refus } from '@/lib/runnerGestes'

// Un GESTE de /automations (oto#205, lot 2), en quatre temps : confirmer sur place,
// envoyer, observer — ou dire le refus.
//
// ⚠️ Le témoin d'un geste est une RELECTURE. La réponse d'un geste est un fait écrit par
// le serveur (`armed`, `stopping`), et l'appelant l'affiche comme tel ; ce qui s'ensuit
// (`running`, `stopped`) ne se voit que sur une relecture qui le sert. D'où la fenêtre
// d'observation : relire toutes les 5 s pendant la durée propre au geste, puis rendre la
// main au rythme de la page.
//   • onglet caché : aucune relecture ne part (la page relit tout au retour sur l'onglet) ;
//   • démontage : la minuterie s'arrête ;
//   • un 409 relit aussi : l'état a changé sous le geste, l'écran doit le montrer.

export const PAS_OBSERVATION_MS = 5_000

export type Phase = 'repos' | 'confirmation' | 'envoi' | 'observation'

export function useGesteObserve<G extends string>(opts: {
  /** Envoie le geste et applique la réponse servie. Lève l'erreur du serveur. */
  envoyer: (g: G) => Promise<void>
  /** Relit l'état servi : le témoin. */
  relire: () => unknown
  /** Durée d'observation après un geste réussi ; 0 = aucune. */
  fenetreMs: (g: G) => number
  pasMs?: number
}) {
  const phase = ref<Phase>('repos')
  const geste = ref(null) as Ref<G | null>
  const refus = ref<Refus | null>(null)
  let minuterie: ReturnType<typeof setInterval> | null = null
  let demonte = false

  function cesserObservation() {
    if (minuterie) clearInterval(minuterie)
    minuterie = null
    if (phase.value === 'observation') phase.value = 'repos'
  }

  function observer(g: G) {
    cesserObservation()
    const duree = opts.fenetreMs(g)
    if (duree <= 0) { phase.value = 'repos'; return }
    const fin = Date.now() + duree
    phase.value = 'observation'
    minuterie = setInterval(() => {
      if (ongletVisible()) void opts.relire()
      if (Date.now() >= fin) cesserObservation()
    }, opts.pasMs ?? PAS_OBSERVATION_MS)
  }

  /** Après un geste ou un refus : on revient à l'observation si elle court encore. */
  const auRepos = (): Phase => (minuterie ? 'observation' : 'repos')

  function demander(g: G) {
    if (phase.value === 'envoi') return
    refus.value = null
    geste.value = g
    phase.value = 'confirmation'
  }

  function annuler() {
    if (phase.value !== 'confirmation') return
    geste.value = null
    phase.value = auRepos()
  }

  async function confirmer() {
    const g = geste.value
    if (g === null || phase.value !== 'confirmation') return
    phase.value = 'envoi'
    try {
      await opts.envoyer(g)
      if (demonte) return
      geste.value = null
      observer(g)
    } catch (e) {
      if (demonte) return
      geste.value = null
      refus.value = refusServi(e)
      phase.value = auRepos()
      if (e instanceof ApiError && e.status === 409) void opts.relire()
    }
  }

  onBeforeUnmount(() => {
    demonte = true
    if (minuterie) clearInterval(minuterie)
    minuterie = null
  })

  return { phase, geste, refus, demander, annuler, confirmer }
}
