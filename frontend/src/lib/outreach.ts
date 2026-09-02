// La relance des comptes inactifs, côté lecture : quelles langues cette audience va
// réellement recevoir, et ce qui manque encore pour que l'envoi soit accepté.
//
// ⚠️ **Ce module ne garde rien.** Les cinq verrous vivent au serveur
// (`capabilities/outreach.py`), et c'est là qu'ils refusent. Ce qui est calculé ici
// sert à NE PAS ARMER un bouton qui serait refusé au clic — la règle « jamais de
// levier inerte » — et à dire à l'opérateur ce qui manque AVANT qu'il essaie. Si ce
// fichier se trompe, l'envoi est refusé par le serveur : le pire cas est un bouton
// absent ou un message d'attente inexact, jamais un mail parti sans son garde.
//
// La conséquence, à tenir : **on n'assouplit jamais une condition ici pour
// « débloquer » un envoi.** Un écran qui armerait `send` sans essai reçu ne
// contournerait rien — il ferait juste échouer le clic — mais il aurait menti sur
// l'état du garde, et c'est le mensonge qui coûte.
import type { OutreachRow } from '@/types/api'

export type Locale = 'fr' | 'en'

/** Le contenu rédigé, tel que l'écran le tient. Une version par langue ; seules les
 *  langues réellement SERVIES sont exigées — écrire un texte que personne ne lira le
 *  ferait bâcler, et il partirait le jour où quelqu'un le recevrait vraiment. */
export interface OutreachContent {
  subject_fr: string
  body_fr: string
  subject_en: string
  body_en: string
  cta_label_fr: string
  cta_label_en: string
  cta_url: string
}

export function emptyContent(): OutreachContent {
  return { subject_fr: '', body_fr: '', subject_en: '', body_en: '',
    cta_label_fr: '', cta_label_en: '', cta_url: '' }
}

/** Les langues que cette audience recevra réellement, dans l'ordre.
 *
 *  ⚠️ Dérivé des DESTINATAIRES, jamais du choix d'interface : c'est `served_locale`,
 *  que le serveur a déjà résolu (préférence déclarée du compte, sinon le défaut
 *  choisi par l'opérateur). Une audience vide sert quand même la langue par défaut —
 *  c'est ce que le serveur fait, et c'est ce qu'il faudra avoir essayé. */
export function servedLocales(rows: OutreachRow[], fallback: Locale): string[] {
  const vues = new Set(rows.map((r) => r.served_locale).filter(Boolean))
  return vues.size ? [...vues].sort() : [fallback]
}

/** Combien de personnes recevront chaque langue. Sert à écrire « 23 en anglais, 2 en
 *  français » plutôt qu'un total muet : c'est ce chiffre qui dit à l'opérateur si son
 *  choix de langue par défaut est le bon. */
export function countByLocale(rows: OutreachRow[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) out[r.served_locale] = (out[r.served_locale] ?? 0) + 1
  return out
}

/** Ce qui manque encore, du plus amont au plus aval. Liste VIDE = rien de connu ne
 *  s'oppose à l'envoi — ce qui n'est pas la même chose que « le serveur acceptera ».
 *
 *  L'ordre compte : on nomme le premier obstacle, pas les cinq à la fois. */
export type SendBlocker =
  | 'campaign'      // pas de slug : c'est la clé du « une seule fois par personne »
  | 'audience'      // personne à qui écrire
  | 'content'       // une langue servie n'a pas son sujet + son corps
  | 'cap'           // l'audience entière dépasse le plafond dur du serveur
  | 'test'          // aucun essai reçu pour CE contenu, dans CETTE langue
  | 'stale'         // le contenu a bougé depuis le dernier aperçu : empreinte inconnue

export interface SendState {
  campaign: string
  content: OutreachContent
  /** Les langues que l'audience va recevoir. */
  locales: string[]
  /** Ce que la réponse courante porte — c'est CE nombre qu'il faudra confirmer. */
  selected: number
  /** L'audience entière, sur laquelle se juge le plafond. */
  total: number
  max: number
  /** L'empreinte rendue par le dernier aperçu, ou `null` si le contenu a changé
   *  depuis (ou si aucun aperçu n'a encore été demandé). */
  fingerprint: string | null
  /** Les langues essayées SUR CETTE EMPREINTE, telles que le serveur les rend. */
  testedLocales: string[]
}

export function contentMissing(c: OutreachContent, locales: string[]): string[] {
  return locales.filter((lg) => {
    const sujet = (c[`subject_${lg}` as keyof OutreachContent] ?? '').trim()
    const corps = (c[`body_${lg}` as keyof OutreachContent] ?? '').trim()
    return !sujet || !corps
  })
}

/** Les langues servies pour lesquelles aucun essai n'a été reçu sur cette empreinte. */
export function untestedLocales(s: SendState): string[] {
  const faits = new Set(s.testedLocales)
  return s.locales.filter((lg) => !faits.has(lg))
}

export function sendBlockers(s: SendState): SendBlocker[] {
  const out: SendBlocker[] = []
  if (!s.campaign.trim()) out.push('campaign')
  if (s.selected <= 0) out.push('audience')
  if (contentMissing(s.content, s.locales).length) out.push('content')
  if (s.total > s.max) out.push('cap')
  // L'empreinte absente ⟹ le contenu a bougé depuis le dernier aperçu (ou il n'y en a
  // jamais eu) : on ne peut RIEN affirmer sur l'essai, et surtout pas qu'il tient.
  if (!s.fingerprint) out.push('stale')
  else if (untestedLocales(s).length) out.push('test')
  return out
}

/** La phrase à afficher pour le premier obstacle. Écrite pour dire QUOI FAIRE, pas
 *  quoi corriger : un opérateur bloqué doit lire son prochain geste. */
export const BLOCKER_MESSAGE: Record<SendBlocker, string> = {
  campaign: 'Donne un nom de campagne : c\'est la clé qui garantit qu\'une personne '
    + 'n\'est relancée qu\'une seule fois.',
  audience: 'Personne à relancer dans ce segment — rien à envoyer.',
  content: 'Il manque un sujet ou un corps pour une langue que cette audience va '
    + 'recevoir.',
  cap: 'L\'audience dépasse le plafond d\'un envoi en masse. Restreins-la avant '
    + 'd\'envoyer — un envoi qu\'on ne peut pas relire ne se rattrape pas.',
  test: 'Envoie-toi l\'essai et lis-le : rien ne part avant que tu aies reçu ce '
    + 'message exact, dans chaque langue servie.',
  stale: 'Le texte a changé depuis le dernier aperçu. Redemande l\'aperçu — toute '
    + 'retouche invalide l\'essai.',
}
