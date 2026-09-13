// Formulaire typé du drawer datastore (schéma v2, ADR 0046) : descriptors de
// champs DÉRIVÉS du schéma (ordre déclaré, label, requis, type) + coercion
// draft → payload d'un scalaire par type déclaré. Fonctions PURES (testables sans DOM).
// Le front n'impose pas la validation (le backend refuse à l'écriture) — il
// PRÉPARE des valeurs du bon type et SIGNALE les requis. Le brouillon d'une ligne et
// ce qu'il écrit (différence, sentinelles, listes renvoyées entières) : `rowDraft.ts`.
import type { DatastoreField, DatastoreRow, DatastoreSchema } from '@/types/api'
import { estCleDeCouche } from './rowCells'

export interface FieldDesc {
  key: string
  label: string
  type: DatastoreField['type'] | null // null = champ non déclaré au schéma
  role?: string
  width?: DatastoreField['width']     // largeur déclarée dans la fiche (half|full)
  options?: string[]                  // type=enum : valeurs proposées
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
 * champs de la row / colonnes connues / ajoutés non déclarés (rien n'est masqué).
 * `sansCouches` écarte les couches servies À PLAT (`adresse.comment`) : l'édition ne
 * les offre pas comme des champs — `adresse.origine` saisi partirait comme une origine. */
export function formFields(
  schema: DatastoreSchema | null | undefined,
  row: Record<string, unknown> | DatastoreRow | null,
  known: string[],
  extra: string[],
  sansCouches = false,
): FieldDesc[] {
  const out: FieldDesc[] = []
  const seen = new Set<string>()
  for (const f of schema?.fields ?? []) {
    if (!f.key) continue
    out.push({
      key: f.key, label: f.label || f.key, type: f.type ?? null, role: f.role,
      width: f.width, options: f.options,
      required: !!f.required, requiredWhen: f.required_when, declared: true, field: f,
    })
    seen.add(f.key)
  }
  for (const k of [...Object.keys(row ?? {}), ...known, ...extra])
    if (!k.startsWith('_') && !seen.has(k) && !(sansCouches && estCleDeCouche(k))) {
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

/** Valeur de payload d'un SCALAIRE depuis sa saisie, coercée par le TYPE DÉCLARÉ. Champ
 * non déclaré = comportement historique (JSON si parsable, sinon string). */
export function payloadValue(d: FieldDesc, raw: unknown): unknown {
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
