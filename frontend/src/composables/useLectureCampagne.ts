import { ref, watch } from 'vue'
import { getRunnerFleetState, type RunnerFleet, type RunnerFleetState } from '@/api/console'
import { inscrireRafraichissement } from '@/composables/useRafraichissement'
import { humanize } from '@/lib/errors'

// Les COMPTEURS d'une campagne (`fleets op=state`), lus pour une carte de la liste (oto#205)
// comme pour la page d'une campagne (oto#214).
//   • rien ne part tant que la campagne n'est pas OUVERTE ; l'ouverture lit, puis chaque
//     rafraîchissement de la page tant qu'elle le reste ;
//   • seule la dernière lecture demandée écrit : l'ouverture et un rafraîchissement peuvent
//     se croiser, et un état plus ancien écraserait un plus récent ;
//   • la réponse d'un geste invalide toute lecture partie avant elle ;
//   • la flotte que la lecture rend remonte avec le RANG de sa demande : qui la tient (la
//     liste, ou la page qui la lit aussi par `op=get`) décide si elle est plus récente.
// Une erreur reste ici, et s'efface à la lecture suivante réussie.

export function useLectureCampagne(opts: {
  id: () => number
  ouverte: () => boolean
  surFlotte: (fleet: RunnerFleet, rang: number) => void
  /** Le compteur de rangs de qui tient la flotte ; un compteur local à défaut. */
  rang?: () => number
}) {
  const etat = ref<RunnerFleetState | null>(null)
  const erreur = ref<string | null>(null)
  let local = 0
  const rang = opts.rang ?? (() => ++local)
  let demande = 0

  async function lireEtat() {
    if (!opts.ouverte()) return
    const n = rang()
    demande = n
    try {
      const { fleet, state } = await getRunnerFleetState(opts.id())
      if (n !== demande) return
      etat.value = state
      erreur.value = null
      if (fleet) opts.surFlotte(fleet, n)
    } catch (e) {
      if (n === demande) erreur.value = humanize(e)
    }
  }

  /** La réponse d'un geste est plus récente que toute relecture partie avant lui : elle
   * l'invalide, sinon un `stopped` d'avant la relance écraserait le `armed` qu'elle sert. */
  function surGeste(fleet: RunnerFleet) {
    const n = rang()
    demande = n
    opts.surFlotte(fleet, n)
  }

  watch(opts.ouverte, (oui) => { if (oui) void lireEtat() }, { immediate: true })
  inscrireRafraichissement(lireEtat)

  return { etat, erreur, lireEtat, surGeste }
}
