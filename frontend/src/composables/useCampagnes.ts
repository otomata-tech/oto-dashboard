import { onMounted, reactive } from 'vue'
import { ApiError } from '@/api'
import { listRunnerFleets, type RunnerFleet } from '@/api/console'
import { inscrireRafraichissement } from '@/composables/useRafraichissement'
import { humanize } from '@/lib/errors'

// Les campagnes de l'org (`fleets op=list`, toutes, sans pagination servie), lues UNE fois
// pour l'entrée de l'espace : « à surveiller » et la liste des automatisations les partagent.
//
// ⚠️ Sans l'option bêta de l'org, toute opération sur les flottes répond 403
// `beta_required`. Ce n'est pas une panne : `betaAbsente` le dit, sans erreur.
// Seule la dernière lecture demandée écrit.

export interface Campagnes {
  fleets: RunnerFleet[]
  lu: boolean
  erreur: string | null
  betaAbsente: boolean
}

export function useCampagnes() {
  const campagnes = reactive<Campagnes>({ fleets: [], lu: false, erreur: null, betaAbsente: false })

  let demande = 0
  async function charger() {
    const n = ++demande
    try {
      const res = await listRunnerFleets()
      if (n !== demande) return
      campagnes.fleets = res.fleets
      campagnes.erreur = null
      campagnes.betaAbsente = false
    } catch (e) {
      if (n !== demande) return
      if (e instanceof ApiError && e.status === 403 && e.code === 'beta_required') {
        campagnes.betaAbsente = true
        campagnes.fleets = []
        campagnes.erreur = null
      } else {
        campagnes.erreur = humanize(e)
      }
    } finally {
      campagnes.lu = true
    }
  }

  onMounted(charger)
  inscrireRafraichissement(charger)

  return { campagnes, charger }
}
