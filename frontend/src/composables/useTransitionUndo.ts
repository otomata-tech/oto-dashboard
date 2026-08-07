// Annuler une transition de cycle de vie qu'on vient de déclencher (ADR 0046).
//
// Le geste vit dans le TOAST qui confirme la transition : c'est le seul moment où
// l'utilisateur voit ce qui s'est passé et peut encore le défaire sans rien savoir
// du cycle de vie. Le retour emprunte le CHEMIN LÉGAL du graphe (ex. ecarte →
// a_enrichir → enrichi) : aucun bypass, chaque saut est une transition déclarée
// que le serveur accepte. Sans chemin, on le dit — jamais de bouton qui promet un
// retour voué au refus.
import { updateNamespaceRow } from '@/api/console'
import { transitionAnnounce, type LifecycleIntent } from '@/lib/datastoreLifecycle'
import { humanize } from '@/lib/errors'
import { useToast } from '@/composables/useToast'
import type { DatastoreLifecycle, DatastoreRow } from '@/types/api'

export interface TransitionUndoCtx {
  /** Le cycle de vie courant (field role="status" du schéma). */
  lifecycle: () => DatastoreLifecycle | null | undefined
  /** Clé du champ role="title" — pour nommer la ligne autrement que par son id. */
  titleKey: () => string | null
  /** Rechargement du tableau après un retour appliqué. */
  refresh: () => Promise<void>
}

export function useTransitionUndo(ctx: TransitionUndoCtx) {
  const { toast } = useToast()

  /** Comment on nomme la ligne : son titre, sinon son id abrégé. */
  function rowLabel(row: DatastoreRow): string {
    const k = ctx.titleKey()
    const v = k ? row[k] : null
    return v == null || v === '' ? row._id.slice(0, 8) : String(v)
  }

  async function undo(ns: string, row: DatastoreRow, t: LifecycleIntent, steps: string[]) {
    // Un retour en plusieurs sauts peut s'arrêter en route (saut refusé : required_when
    // non satisfait sur l'état visé, concurrence…). On COMPTE ce qui a été appliqué :
    // sans ça, l'utilisateur lit une erreur serveur et croit que rien n'a bougé, alors
    // que la fiche est dans un TROISIÈME état qu'il n'a jamais demandé.
    let done = 0
    try {
      for (const step of steps) {
        await updateNamespaceRow(ns, row._id, { [t.key]: step })
        done++
      }
      toast(`« ${rowLabel(row)} » : revenu à ${t.from}`)
    } catch (e) {
      toast(done
        ? `« ${rowLabel(row)} » : retour interrompu — la fiche est restée à ${steps[done - 1]} (${humanize(e)})`
        : humanize(e))
    }
    await ctx.refresh()
  }

  /** Confirme la transition appliquée et propose le retour quand il est légal. */
  function announce(ns: string, row: DatastoreRow, t: LifecycleIntent) {
    const { message, undo: steps } =
      transitionAnnounce(rowLabel(row), t, ctx.lifecycle()?.transitions)
    if (!steps) { toast(message, { duration: 7000 }); return }
    // Le retour n'est pas gratuit quand le graphe impose un détour : il écrit autant
    // de transitions que de sauts — on l'annonce plutôt que de promettre « annuler ».
    const label = steps.length > 1 ? `annuler (${steps.length} étapes)` : 'annuler'
    toast(message, { action: { label, run: () => undo(ns, row, t, steps) } })
  }

  return { announceTransition: announce }
}
