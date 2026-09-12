// Îlot « Dernières modifications » de l'accueil (oto#191) — les dérivations pures : où
// ouvrir un élément, et depuis quand il a bougé. Testées sans montage.
//
// Contrat : `GET /api/me/recent-changes` (oto-backend, capacité `me.recent_changes`).
import type { RecentChange } from '@/types/api'
import { instant } from '@/lib/runnerJobs'

/** L'adresse qui OUVRE l'élément, par les routes existantes du dashboard.
 *  - une page s'ouvre dans son projet : `?doc=` porte le `doc_id`, le deep-link de la page
 *    projet (le même que la recherche) ;
 *  - une procédure s'ouvre par son id stable : `/procedures/:id`, que `DoctrineView`
 *    résout par id.
 *  `null` quand le contrat ne donne pas de quoi construire l'adresse (une page sans
 *  projet) : la ligne s'affiche sans lien plutôt qu'avec une adresse inventée. */
export function changePath(c: RecentChange): string | null {
  if (c.type === 'doc') return c.project ? `/projects/${c.project.id}?doc=${c.id}` : null
  return `/procedures/${c.id}`
}

// Du plus grand au plus petit : la première unité atteinte nomme l'écart.
const UNITES: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000], ['month', 2_592_000], ['week', 604_800],
  ['day', 86_400], ['hour', 3_600], ['minute', 60], ['second', 1],
]

/** « il y a 5 minutes ». ⚠️ `updated_at` arrive au format `YYYY-MM-DD HH:MM:SS`, SANS
 *  fuseau, et vaut de l'UTC : il se lit par `instant()`, jamais par `Date.parse` nu, qui
 *  le prendrait pour une heure locale et décalerait l'écart de deux heures l'été.
 *  Une date illisible rend `null` : l'écran n'affiche alors pas de date. */
export function relativeSince(updatedAt: string, now: number, locale: string): string | null {
  const t = instant(updatedAt)
  if (t == null) return null
  const secondes = Math.round((t - now) / 1000)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  for (const [unite, taille] of UNITES) {
    if (Math.abs(secondes) >= taille || unite === 'second') return rtf.format(Math.trunc(secondes / taille), unite)
  }
  return null
}

/** La date exacte, dans le fuseau de la personne qui lit (infobulle de la date relative). */
export function exactDate(updatedAt: string, locale: string): string | null {
  const t = instant(updatedAt)
  return t == null ? null : new Date(t).toLocaleString(locale)
}
