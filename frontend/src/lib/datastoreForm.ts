// Formulaire typé du drawer datastore (schéma v2, ADR 0046) : descriptors de
// champs DÉRIVÉS du schéma (ordre déclaré, label, requis, type) + coercion
// draft ⇄ payload par type déclaré. Fonctions PURES (testables sans DOM).
// Le front n'impose pas la validation (le backend refuse à l'écriture) — il
// PRÉPARE des valeurs du bon type et SIGNALE les requis.
import type { DatastoreField, DatastoreRow, DatastoreSchema } from '@/types/api'

export interface FieldDesc {
  key: string
  label: string
  type: DatastoreField['type'] | null // null = champ non déclaré au schéma
  role?: string
  required: boolean
  requiredWhen?: Record<string, string>
  declared: boolean
  field?: DatastoreField // déclaration brute (sous-champs des composites)
}

export const isComposite = (f?: DatastoreField | null): boolean =>
  !!f && (f.type === 'object' || f.type === 'list')

/** Liste de SOUS-RECORDS ? (list dont `of` déclare des fields — ex. contacts[]) */
export const isSubRecordList = (f?: DatastoreField | null): boolean =>
  !!f && f.type === 'list' && !!(f.of && 'fields' in f.of && f.of.fields?.length)

export const subFieldsOf = (f: DatastoreField): DatastoreField[] =>
  f.type === 'object' ? (f.fields ?? []) : ((f.of && 'fields' in f.of && f.of.fields) || [])

/** Champs du formulaire : déclarés au schéma D'ABORD (ordre déclaré), puis les
 * champs de la row / colonnes connues / ajoutés non déclarés (rien n'est masqué). */
export function formFields(
  schema: DatastoreSchema | null | undefined,
  row: DatastoreRow | null,
  known: string[],
  extra: string[],
): FieldDesc[] {
  const out: FieldDesc[] = []
  const seen = new Set<string>()
  for (const f of schema?.fields ?? []) {
    if (!f.key) continue
    out.push({
      key: f.key, label: f.label || f.key, type: f.type ?? null, role: f.role,
      required: !!f.required, requiredWhen: f.required_when, declared: true, field: f,
    })
    seen.add(f.key)
  }
  for (const k of [...Object.keys(row ?? {}), ...known, ...extra])
    if (!k.startsWith('_') && !seen.has(k)) {
      out.push({ key: k, label: k, type: null, required: false, declared: false })
      seen.add(k)
    }
  return out
}

/** Valeur de draft SCALAIRE (string d'input) depuis la valeur row. */
export function scalarDraft(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v, null, 2)
  return String(v)
}

/** Valeur de draft COMPOSITE (structurée) depuis la valeur row. */
export function compositeDraft(f: DatastoreField, v: unknown): unknown {
  if (f.type === 'list') {
    if (Array.isArray(v)) return structuredClone(v)
    return v == null || v === '' ? [] : [v]
  }
  return v && typeof v === 'object' && !Array.isArray(v) ? structuredClone(v) : {}
}

function pruneRecord(rec: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(rec)) if (v !== '' && v != null) out[k] = v
  return out
}

/** Nettoie un composite édité : champs vides retirés, items vides drop. */
export function pruneComposite(f: DatastoreField, v: unknown): unknown {
  if (f.type === 'list') {
    const arr = Array.isArray(v) ? v : []
    return arr
      .map((item) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? pruneRecord(item as Record<string, unknown>)
          : item)
      .filter((item) =>
        item !== '' && item != null &&
        !(typeof item === 'object' && !Array.isArray(item) && !Object.keys(item as object).length))
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) return pruneRecord(v as Record<string, unknown>)
  return v
}

/** Valeur de payload depuis le draft, coercée par le TYPE DÉCLARÉ. Champ non
 * déclaré = comportement historique (JSON si parsable, sinon string). */
export function payloadValue(d: FieldDesc, raw: unknown): unknown {
  if (d.declared && isComposite(d.field)) return pruneComposite(d.field!, raw)
  const s = typeof raw === 'string' ? raw : String(raw ?? '')
  const t = s.trim()
  if (t === '') return ''
  if (d.declared) {
    if (d.type === 'number') {
      const n = Number(t)
      return Number.isFinite(n) ? n : s // non numérique : laissé tel quel, le backend tranche
    }
    if (d.type === 'bool') return t === 'true' ? true : t === 'false' ? false : s
    if (d.type === 'json') { try { return JSON.parse(t) } catch { return s } }
    return s // text / date : string
  }
  try { return JSON.parse(t) } catch { return s }
}

/** Vide au sens « ne pas écrire à la création » ('' / null / [] / {}). */
export const isEmptyPayloadValue = (x: unknown): boolean =>
  x === '' || x == null ||
  (Array.isArray(x) && !x.length) ||
  (typeof x === 'object' && !Array.isArray(x) && !Object.keys(x as object).length)
