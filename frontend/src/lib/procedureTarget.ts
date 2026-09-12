// Quelle procédure `/procedures/:id` demande, et comment la lire (oto#201).
//
// L'écran liste les procédures du palier ACTIF (perso, org, équipe active). Un lien —
// l'îlot « Dernières modifications », un lien de projet — peut viser une procédure hors
// de cette liste : celle d'une autre équipe, ou partagée par une autre org. Avant oto#201,
// un tel id retombait EN SILENCE sur la première procédure listée. Ici, chaque paramètre
// a une issue qui ne substitue jamais une autre procédure :
//  - dans la liste (par id ou slug) → la liste sert de cache, lecture par le palier actif ;
//  - hors liste, id numérique → `GET /api/me/guides/{guide_id}`, qui traverse équipes et
//    orgs (garde `ownership.can_access` côté serveur) ;
//  - hors liste, pas un id → rien à demander au serveur : l'écran le dit.
// Seule l'absence de paramètre (l'entrée du menu) ouvre la première procédure, par choix.
//
// ⚠️ Pourquoi pas `guides/{guide_id}` pour TOUT id, listé compris : un opérateur plateforme
// qui consulte une org sans en être membre (`X-Oto-Org`, lecture seule) en voit la liste,
// mais `can_access` ne lui accorde aucune escalade plateforme — la lecture par id lui
// rendrait 403 sur ce qu'il voit listé.
import { ApiError } from '@/api'
import { humanize } from '@/lib/errors'

export interface ListedProcedure { id: number; slug: string }

export type ProcedureTarget =
  | { kind: 'first' }
  | { kind: 'listed'; id: number; slug: string }
  | { kind: 'by-id'; id: number }
  | { kind: 'unknown'; raw: string }

export function procedureTarget(raw: string | null, docs: ListedProcedure[]): ProcedureTarget {
  if (!raw) return { kind: 'first' }
  const d = docs.find((x) => String(x.id) === raw || x.slug === raw)
  if (d) return { kind: 'listed', id: d.id, slug: d.slug }
  return /^[1-9]\d*$/.test(raw) ? { kind: 'by-id', id: Number(raw) } : { kind: 'unknown', raw }
}

/** Deux cibles désignent-elles la même procédure ? (une URL normalisée ne recharge rien) */
export function targetKey(t: ProcedureTarget): string {
  if (t.kind === 'listed' || t.kind === 'by-id') return `id:${t.id}`
  return t.kind === 'unknown' ? `raw:${t.raw}` : 'first'
}

export interface ProcedureRefusal {
  what: string            // la procédure DEMANDÉE : `#344`, `« proc-x »`
  code: string | null     // `403 forbidden` tel que le serveur l'a rendu ; null hors réponse serveur
  detail: string | null   // la phrase du serveur, à défaut la traduction du code
}

/** Le refus tel que le serveur l'a rendu : son code et sa phrase, jamais une autre procédure. */
export function procedureRefusal(what: string, e: unknown): ProcedureRefusal {
  if (e instanceof ApiError) {
    const code = `${e.status} ${e.code}`
    const human = humanize(e)
    return { what, code, detail: e.detail?.trim() || (human !== code ? human : null) }
  }
  return { what, code: null, detail: humanize(e) }
}
