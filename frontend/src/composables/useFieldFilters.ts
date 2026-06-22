// Logique partagée de rédaction de champs (FieldFilter, ADR 0015) : helpers d'affichage
// + construction d'une règle + écriture. Consommée par l'onglet « transformations » de
// la carte connecteur (ConnectorTransforms.vue) et l'éditeur (FieldRuleDialog.vue). Le
// backend porte l'autz (org_admin) ; l'UI masque seulement les contrôles.
import { setOrgFieldFilter } from '@/api/console'
import type { FieldActionSchema, FieldRule } from '@/types/api'

export function useFieldFilters() {
  function schemaFor(actionSchema: FieldActionSchema[], action: string): FieldActionSchema | undefined {
    return actionSchema.find((s) => s.action === action)
  }
  function actionLabel(actionSchema: FieldActionSchema[], action: string): string {
    return schemaFor(actionSchema, action)?.label ?? action
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

  // Construit une règle depuis les valeurs du formulaire (params selon l'action).
  function buildRule(actionSchema: FieldActionSchema[], fields: string[], action: string,
                     extra: Record<string, string>): FieldRule {
    const rule: FieldRule = { fields, action: action as FieldRule['action'] }
    const bag = rule as unknown as Record<string, unknown>
    for (const p of schemaFor(actionSchema, action)?.params ?? []) {
      const v = (extra[p.key] ?? '').trim()
      if (!v) continue
      if (p.type === 'int') { const n = parseInt(v, 10); if (!Number.isNaN(n)) bag[p.key] = n }
      else bag[p.key] = v
    }
    return rule
  }

  // Écritures (le backend valide l'autz org_admin).
  function saveRules(orgId: number, service: string, rules: FieldRule[]) {
    return setOrgFieldFilter(orgId, service, rules)
  }
  function clearService(orgId: number, service: string) {
    return setOrgFieldFilter(orgId, service, null)
  }

  return { schemaFor, actionLabel, ruleSummary, buildRule, saveRules, clearService }
}
