import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { deleteRunnerTrigger, updateRunnerTrigger, type RunnerTrigger } from '@/api/console'
import { useGesteObserve } from '@/composables/useGesteObserve'
import { apresReglage, refusServi, type Refus } from '@/lib/runnerGestes'

// Les gestes d'UNE programmation hors formulaire (oto#205, lot 2) : l'interrupteur et la
// suppression confirmée sur place. Extraits de `TriggerRow` par oto#214 pour servir la ligne
// ET la page des réglages, sans rien y ajouter.
//
// L'interrupteur n'envoie QUE `enabled`. Couper périme les occurrences en attente ; rallumer
// peut être refusé (`no_runner_armed`, `model_key_required`, `model_not_served`), et le refus
// se lit tel que le serveur l'a écrit. Après un geste, la réponse fait foi (`next_due`
// recalculé), puis on relit : la ligne rendue n'a ni `expired_*` ni `runner` (`apresReglage`).
// La suppression ne retire la programmation que sur `ok: true`.

export function useGestesDeclencheur(opts: {
  trigger: () => RunnerTrigger
  surRegle: (trigger: RunnerTrigger) => void
  surSupprime: (id: number) => void
  relire: () => unknown
}) {
  const { t } = useI18n()
  const bascule = ref(false)
  const refusInterrupteur = ref<Refus | null>(null)

  function appliquer(rendu: Partial<RunnerTrigger>) {
    opts.surRegle(apresReglage(opts.trigger(), rendu))
    void opts.relire()
  }

  async function basculer() {
    if (bascule.value) return
    bascule.value = true
    refusInterrupteur.value = null
    const courant = opts.trigger()
    try {
      const { trigger } = await updateRunnerTrigger(courant.id, { enabled: !courant.enabled })
      appliquer(trigger)
    } catch (e) {
      refusInterrupteur.value = refusServi(e)
    } finally {
      bascule.value = false
    }
  }

  // Supprimer : confirmé sur place, sans fenêtre d'observation.
  const suppression = useGesteObserve<'supprimer'>({
    envoyer: async () => {
      const id = opts.trigger().id
      const { ok } = await deleteRunnerTrigger(id)
      if (ok !== true) throw new Error(t('automations.triggers.form.deleteNotConfirmed'))
      opts.surSupprime(id)
    },
    relire: () => opts.relire(),
    fenetreMs: () => 0,
  })
  const enSuppression = computed(() =>
    suppression.phase.value === 'confirmation' || suppression.phase.value === 'envoi')

  return {
    bascule, refusInterrupteur, appliquer, basculer, enSuppression,
    phaseSuppression: suppression.phase,
    refusSuppression: suppression.refus,
    demanderSuppression: () => suppression.demander('supprimer'),
    annulerSuppression: suppression.annuler,
    confirmerSuppression: suppression.confirmer,
  }
}
