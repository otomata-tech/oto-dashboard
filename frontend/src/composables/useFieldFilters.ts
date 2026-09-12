// Helpers d'affichage de la rédaction de champs (FieldFilter, ADR 0015), consommés par
// l'onglet de la fiche connecteur (ConnectorTransforms.vue). Lecture seule depuis oto#192 :
// l'écriture d'une règle, son éditeur et le banc de test ont quitté le dashboard.
import type { FieldActionSchema, FieldRule } from '@/types/api'

export function useFieldFilters() {
  function actionLabel(actionSchema: FieldActionSchema[], action: string): string {
    return actionSchema.find((s) => s.action === action)?.label ?? action
  }

  // Résumé compact d'une règle (options de l'action).
  function ruleSummary(r: FieldRule): string {
    const parts: string[] = []
    if (r.action === 'mask') {
      if (r.preserve) parts.push(`format ${r.preserve}`)
      if (r.keep_last) parts.push(`garde ${r.keep_last} derniers`)
      if (r.keep_first) parts.push(`garde ${r.keep_first} premiers`)
    } else if (r.action === 'pseudonym' && r.kind) parts.push(r.kind)
    else if (r.action === 'generalize') { if (r.to) parts.push(r.to); if (r.step) parts.push(`pas ${r.step}`) }
    return parts.join(' · ')
  }

  return { actionLabel, ruleSummary }
}
