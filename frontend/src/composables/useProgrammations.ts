import { onMounted, ref } from 'vue'
import { listRunnerTriggers, type RunnerArme, type RunnerTrigger } from '@/api/console'
import { inscrireRafraichissement } from '@/composables/useRafraichissement'
import { humanize } from '@/lib/errors'

// Les programmations de l'org — ou celles d'UNE procédure, filtrées par le SERVEUR — et la
// présence du runner, en UNE lecture (`triggers op=list`) : la présence est une propriété de
// l'org, servie avec la liste (oto#214). La carte des programmations et l'entrée de l'espace
// la lisent ainsi, chacune une fois.
//
// Seule la dernière lecture demandée écrit : la relecture qui suit un réglage ne doit pas
// être écrasée par une lecture partie avant lui.

export function useProgrammations(procedure?: string) {
  const triggers = ref<RunnerTrigger[]>([])
  const runner = ref<RunnerArme | null>(null)
  const loaded = ref(false)
  const error = ref<string | null>(null)

  let demande = 0
  async function charger() {
    const n = ++demande
    try {
      const res = await listRunnerTriggers(procedure)
      if (n !== demande) return
      triggers.value = res.triggers
      runner.value = res.runner ?? null
      error.value = null
    } catch (e) {
      if (n === demande) error.value = humanize(e)
    } finally {
      loaded.value = true
    }
  }

  onMounted(charger)
  inscrireRafraichissement(charger)

  return { triggers, runner, loaded, error, charger }
}
