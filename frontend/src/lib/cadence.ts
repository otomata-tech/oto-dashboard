// Dire un cadencement dans les mots de qui le lit (oto-backend#860, périmètre
// dashboard ②).
//
// L'écran des automatisations affichait l'expression brute — `0 18 * * *` — à côté du
// fuseau. C'est le vocabulaire de celui qui a écrit le déclencheur, jamais celui de la
// personne qui vient vérifier que son agent tourne bien tous les soirs. Le lot #860 le
// dit en une phrase : « le cadencement se choisit dans le vocabulaire de l'utilisateur
// (« tous les jours à 18 h »), pas en expression de cadencement ».
//
// ⚠️ **On TRADUIT ce qu'on sait lire, on ne devine jamais.** Les cinq champs d'un cron
// couvrent des formes qu'aucune phrase courte ne rend fidèlement (`*/7`, listes
// mêlées, `L`, `#`). Pour celles-là on rend `null`, et l'appelant montre l'expression
// brute — lisible par qui la connaît, plutôt qu'une phrase approximative qui se lirait
// comme un fait. Une traduction fausse d'un horaire est pire que pas de traduction :
// elle fait conclure « il tourne le lundi » à quelqu'un qui ne rouvrira pas la page.
//
// La fidélité prime la couverture : ce module rend une phrase pour les formes
// courantes, et se tait pour le reste.

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

/** `18` → « 18 h », `18` + `30` → « 18 h 30 ». Minuit se dit, il ne se compte pas. */
function heure(h: number, m: number): string {
  if (h === 0 && m === 0) return 'minuit'
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`
}

// Un champ vaut-il « toutes les valeurs » ? `*` seul — jamais un pas, qui restreint.
// (Écrit en commentaire de ligne : un pas contient la séquence qui FERME un JSDoc.)
const tout = (c: string) => c === '*'

/** Le champ est-il un entier simple, dans les bornes ? Sinon on ne sait pas lire. */
function entier(c: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(c)) return null
  const n = Number(c)
  return n >= min && n <= max ? n : null
}

/**
 * Le cadencement en une phrase, ou `null` quand on ne sait pas le dire fidèlement.
 *
 * Formes rendues : toutes les heures (`m * * * *`), tous les jours (`m h * * *`),
 * chaque semaine (`m h * * j`), chaque mois (`m h d * *`).
 * Tout le reste — pas, listes, intervalles, syntaxes étendues — rend `null`.
 */
export function cadenceEnMots(cron: string | null | undefined): string | null {
  if (!cron) return null
  const c = cron.trim().split(/\s+/)
  if (c.length !== 5) return null           // 6 champs (secondes) : on ne présume pas
  const [min, hr, jourMois, mois, jourSem] = c as [string, string, string, string, string]

  const m = entier(min, 0, 59)
  if (m === null) return null               // `*`, `*/5`, listes : pas de phrase courte
  if (!tout(mois)) return null              // « en mars » demande une forme à part

  // Toutes les heures, à la minute dite.
  if (tout(hr) && tout(jourMois) && tout(jourSem))
    return m === 0 ? 'toutes les heures' : `toutes les heures, à ${m} min`

  const h = entier(hr, 0, 23)
  if (h === null) return null

  if (tout(jourMois) && tout(jourSem)) return `tous les jours à ${heure(h, m)}`

  // Chaque semaine — un seul jour, sinon on ne résume pas.
  if (tout(jourMois) && !tout(jourSem)) {
    const j = entier(jourSem, 0, 7)
    if (j === null) return null
    return `chaque ${JOURS[j === 7 ? 0 : j]} à ${heure(h, m)}`
  }

  // Chaque mois — un seul quantième.
  if (!tout(jourMois) && tout(jourSem)) {
    const d = entier(jourMois, 1, 31)
    if (d === null) return null
    return `le ${d === 1 ? '1er' : d} de chaque mois à ${heure(h, m)}`
  }

  // `jourMois` ET `jourSem` contraints : le cron les combine en OU, ce qui ne se dit
  // pas d'une phrase sans induire en erreur. On se tait.
  return null
}
