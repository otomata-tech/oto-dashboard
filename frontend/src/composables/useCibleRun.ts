import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { listRunnerJobs, type RunnerJob } from '@/api/console'
import { humanize } from '@/lib/errors'

// Arriver sur /automations depuis une LIGNE de tableau : `?run=<run>`.
//
// Les liens partent de `DatastoreQueueBar` et `RowDrawer`, et seulement pour une ligne
// qu'un run TIENT au moment où la page l'affiche : son travail est donc `claimed`. On le
// cherche parmi les travaux en vol, par le filtre servi — plus sur une fenêtre des N
// derniers travaux, qui confondait « plus ancien » et « inexistant ».
//
// ⚠️ Et on dit ce qu'on ne trouve pas : un écran qui s'ouvre sur rien se lirait « ce run
// n'a jamais existé ».

export type CibleRun =
  | { etat: 'absent'; run: string }
  | { etat: 'hors-page'; run: string; lus: number }
  | { etat: 'erreur'; run: string; raison: string }

/** Le plus que le serveur rend en une page ; au-delà, il écrête et rend un curseur. */
const EN_VOL_LUS = 200

export function useCibleRun(ouvrir: (job: RunnerJob) => void) {
  const route = useRoute()
  const cible = ref<CibleRun | null>(null)

  watch(() => route.query.run, async (v) => {
    cible.value = null
    const run = typeof v === 'string' && v ? v : null
    if (!run) return
    try {
      const page = await listRunnerJobs({ status: 'claimed' }, { limit: EN_VOL_LUS })
      const job = page.jobs.find((j) => j.run_id === run)
      if (job) ouvrir(job)
      else if (page.next_cursor) cible.value = { etat: 'hors-page', run, lus: page.jobs.length }
      else cible.value = { etat: 'absent', run }
    } catch (e) {
      cible.value = { etat: 'erreur', run, raison: humanize(e) }
    }
  }, { immediate: true })

  return { cible }
}
