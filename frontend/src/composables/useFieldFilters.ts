// Logique partagée de redaction de champs (FieldFilter, ADR 0015), relocalisée de
// l'ex-FieldFiltersView : helpers d'affichage + flux de saisie d'une règle (prompt 2
// temps) + écriture. Consommée par l'onglet « transformations » de la carte connecteur
// (ConnectorTransforms.vue). Le backend porte l'autz (org_admin) ; l'UI masque seulement
// les contrôles.
import { usePrompt, type PromptField } from '@/composables/usePrompt'
import { setOrgFieldFilter } from '@/api/console'
import type { FieldActionSchema, FieldRule } from '@/types/api'

export function useFieldFilters() {
  const { promptForm } = usePrompt()

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

  // Saisie en 2 temps : (champ(s) + action), puis les paramètres de l'action.
  // `fixedField` = édition d'un champ connu (saute la saisie de champs, vue schéma) ;
  // sinon on demande les champs en texte libre (ajout d'un champ hors schéma).
  async function promptRule(opts: {
    actionSchema: FieldActionSchema[]
    service: string
    existing?: FieldRule
    fixedField?: string
  }): Promise<FieldRule | null> {
    const { actionSchema, service, existing, fixedField } = opts
    const fieldsForm: PromptField[] = []
    if (!fixedField) {
      fieldsForm.push({
        key: 'fields', label: 'champs (séparés par virgule ou espace)', required: true,
        value: existing?.fields.join(', '), placeholder: 'iban, bic, email',
      })
    }
    fieldsForm.push({
      key: 'action', label: 'action', type: 'select', value: existing?.action ?? 'mask',
      options: actionSchema.map((s) => ({ value: s.action, label: s.label })),
    })
    const base = await promptForm({
      title: existing ? 'modifier la transformation' : 'nouvelle transformation',
      description: fixedField ? `${service} · champ : ${fixedField}` : `connecteur : ${service}`,
      fields: fieldsForm,
      submitLabel: 'suivant',
    })
    if (!base) return null
    const fieldsStr = fixedField ?? base.fields
    if (!fieldsStr) return null
    const action = base.action || 'mask'
    const ex = existing as unknown as Record<string, unknown> | undefined
    const params = schemaFor(actionSchema, action)?.params ?? []
    let extra: Record<string, string> = {}
    if (params.length) {
      const r2 = await promptForm({
        title: actionLabel(actionSchema, action),
        description: 'options — laisser vide = défaut du mode.',
        fields: params.map((p) => p.type === 'select'
          ? { key: p.key, label: p.label, type: 'select' as const,
              value: String(ex?.[p.key] ?? p.options?.[0] ?? ''),
              options: (p.options ?? []).map((o) => ({ value: o, label: o || '—' })) }
          : { key: p.key, label: p.label,
              value: ex?.[p.key] != null ? String(ex[p.key]) : '', placeholder: 'nombre' }),
        submitLabel: 'enregistrer',
      })
      if (!r2) return null
      extra = r2
    }
    const fields = fieldsStr.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)
    return buildRule(actionSchema, fields, action, extra)
  }

  // Écritures (le backend valide l'autz org_admin).
  function saveRules(orgId: number, service: string, rules: FieldRule[]) {
    return setOrgFieldFilter(orgId, service, rules)
  }
  function clearService(orgId: number, service: string) {
    return setOrgFieldFilter(orgId, service, null)
  }

  return { schemaFor, actionLabel, ruleSummary, buildRule, promptRule, saveRules, clearService }
}
