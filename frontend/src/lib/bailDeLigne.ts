// Le bail d'une LIGNE du datastore — qui la tient, jusqu'à quand, et POUR QUEL RUN.
//
// Le pendant, côté donnée, de `lib/runnerJobs.ts` (côté ordonnanceur). Il vit à
// part parce que ce sont deux objets différents : un travail a un bail sur la
// FILE, une ligne a un bail sur la DONNÉE, et les confondre ferait dire à l'un ce
// que seul l'autre sait.
//
// ⚠️ `_claimed_run` (oto-backend #723) répond « sur quelle ligne ce run est-il
// MAINTENANT », JAMAIS « laquelle a-t-il travaillée » : la colonne est effacée
// quand le run rend ses lignes. Un travail conclu n'a donc pas de ligne à montrer,
// et l'écran doit le DIRE plutôt que de laisser croire qu'il n'y en a jamais eu.
import type { DatastoreRow } from '@/types/api'

/**
 *  `libre`      aucun bail (`_claimed_by` absent)
 *  `actif`      un agent la tient, le bail court
 *  `expire`     le bail est dépassé — le prochain claim recyclera la ligne
 */
export type EtatBailLigne = 'libre' | 'actif' | 'expire'

/**
 *  `run`      un run la tient — son adresse est connue, on peut ouvrir son travail
 *  `sans-run` ⚠️ bail pris SANS run : une personne sur la file du dashboard, ou un
 *             agent qui n'a pas passé son `_run_id`. C'est un FAIT, pas un trou —
 *             le dire « inconnu » laisserait croire à une donnée perdue.
 *  `hors-bail` la ligne n'est pas réservée, la question ne se pose pas
 */
export type PorteurDeBail = 'run' | 'sans-run' | 'hors-bail'

export interface BailLigne {
  etat: EtatBailLigne
  /** Le sub du worker qui tient la ligne. */
  par: string | null
  /** Fin du bail, en millisecondes. */
  fin: number | null
  porteur: PorteurDeBail
  /** L'adresse du run, quand `porteur === 'run'`. */
  run: string | null
}

/** ⚠️ Les horodatages arrivent en UTC SANS fuseau (« 2026-09-01 13:53:53 ») :
 * `Date.parse` les lirait comme heure LOCALE, deux heures d'écart l'été — un bail
 * qui court paraîtrait expiré. Même correctif que `runnerJobs.instant`. */
function instant(v: unknown): number | null {
  if (!v) return null
  const s = String(v)
  const iso = /(Z|[+-]\d{2}:?\d{2})$/.test(s) ? s : s.replace(' ', 'T') + 'Z'
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

function chaine(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null
}

export function bailLigne(row: DatastoreRow, maintenant: number): BailLigne {
  const par = chaine(row._claimed_by)
  if (!par) return { etat: 'libre', par: null, fin: null, porteur: 'hors-bail', run: null }
  const fin = instant(row._claimed_until)
  // ⚠️ Le run ne se lit QUE sous bail. `datastore_release` n'efface pas
  // `claimed_run` côté serveur (oto-backend #664) : la colonne peut rester garnie
  // sur une ligne libre, et la projection ne la sert que sous bail. On tient la
  // même règle ici, pour ne pas rattacher une ligne rendue à un run parti.
  const run = chaine(row._claimed_run)
  return {
    etat: fin !== null && fin < maintenant ? 'expire' : 'actif',
    par,
    fin,
    porteur: run ? 'run' : 'sans-run',
    run,
  }
}
