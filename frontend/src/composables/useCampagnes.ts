import { onMounted, reactive } from 'vue'
import { listRunnerFleets, type RunnerFleet } from '@/api/console'
import { inscrireRafraichissement } from '@/composables/useRafraichissement'
import { humanize } from '@/lib/errors'

// Les campagnes de l'org (`fleets op=list`, toutes, sans pagination servie), lues UNE fois
// pour l'entrée de l'espace : « à surveiller » et la liste des automatisations les partagent.
//
// Les campagnes sont ouvertes à toute org (24/09/2026 : plus de porte bêta). Seule la
// dernière lecture demandée écrit.

export interface Campagnes {
  fleets: RunnerFleet[]
  lu: boolean
  erreur: string | null
}

export function useCampagnes() {
  const campagnes = reactive<Campagnes>({ fleets: [], lu: false, erreur: null })

  let demande = 0
  async function charger() {
    const n = ++demande
    try {
      const res = await listRunnerFleets()
      if (n !== demande) return
      campagnes.fleets = res.fleets
      campagnes.erreur = null
    } catch (e) {
      if (n !== demande) return
      campagnes.erreur = humanize(e)
    } finally {
      campagnes.lu = true
    }
  }

  onMounted(charger)
  inscrireRafraichissement(charger)

  return { campagnes, charger }
}
