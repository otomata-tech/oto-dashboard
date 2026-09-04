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

/** Où mène le bouton : la console, où « prochaine étape » attend déjà la personne.
 *  Une seule adresse pour les deux langues (le champ est commun) — la console suit
 *  la préférence de langue du compte, une page du site ne l'aurait pas suivie. */
const CONSOLE_URL = 'https://manage.oto.cx'

/** Le brouillon servi à l'ouverture de l'écran, pour ne pas partir d'une page blanche.
 *
 *  ⚠️ **C'est un BROUILLON, pas un texte validé.** Il est là pour être relu et
 *  réécrit dans le champ ; les cinq verrous du serveur restent devant l'envoi
 *  (aperçu, essai reçu, confirmation du nombre), donc un texte pré-rempli ne
 *  rapproche personne d'un envoi accidentel.
 *
 *  **D'où vient chaque phrase** — la copy user-facing ne s'invente pas, elle se
 *  reprend à sa source (et ce qui est ajouté se dit) :
 *
 *  | phrase | source |
 *  |---|---|
 *  | sujet | `h_acc_h2a` + `h_acc_h2em` de `oto-websites/web/src/i18n.ts`, verbatim |
 *  | « aucun outil n'a encore tourné » | `overview.empty.body` des locales du dashboard, verbatim |
 *  | « oto est un serveur mcp distant… rien à héberger. » | `h_acc_sub`, verbatim |
 *  | « ajouter mcp.oto.cx à claude desktop… oauth. » | `overview.steps.connectClient.d`, **tutoiement → vouvoiement** |
 *  | « une clé de connecteur (serper, hunter, …)… » | `overview.steps.firstKey.d`, **tutoiement → vouvoiement** |
 *  | « résolues côté serveur, à l'exécution » | `h_vault_pt1_t`, verbatim |
 *  | « le modèle voit le résultat, jamais le secret. » | `h_vault_foot_a/_em/_b`, verbatim |
 *  | 1re et dernière phrases | **écrites pour cette relance**, sans source |
 *
 *  ⚠️ **Voix du funnel : vouvoiement + minuscules**, dans les deux langues — c'est
 *  celle des emails et de l'invitation. Le tutoiement de la console (« ta console »,
 *  « connecte un client ») ne s'exporte pas dans un mail.
 *
 *  ⚠️ Le pied de page est ajouté par le serveur et n'est PAS à recopier ici : il
 *  porte déjà « vous recevez ce message car vous avez un compte oto » et le lien de
 *  désinscription. Le redire dans le corps ferait deux fois la même phrase. */
export function defaultContent(): OutreachContent {
  return {
    subject_fr: 'un seul geste : ajouter le connecteur',
    body_fr: [
      "vous avez créé un compte oto, et aucun outil n'a encore tourné.",
      "oto est un serveur mcp distant. vous le branchez une fois dans votre ia — "
      + "claude, chatgpt, mistral — et tout le catalogue est là. rien à installer, "
      + "rien à héberger.",
      "la prochaine étape tient en un geste : ajouter mcp.oto.cx à claude desktop, "
      + "cursor ou n'importe quel client mcp — l'auth passe par oauth. puis une clé "
      + "de connecteur (serper, hunter, …) pour que vos outils puissent appeler.",
      "vos clés sont résolues côté serveur, à l'exécution : le modèle voit le "
      + "résultat, jamais le secret.",
      "si quelque chose vous a arrêté en chemin, répondez à ce message — savoir quoi "
      + "nous est utile.",
    ].join('\n\n'),
    subject_en: 'one move: add the connector',
    body_en: [
      'you created an oto account, and no tools have run yet.',
      'oto is a remote mcp server. plug it once into your ai — claude, chatgpt, '
      + 'mistral — and the whole catalog is there. nothing to install, nothing to '
      + 'host.',
      'the next step is one move: add mcp.oto.cx to claude desktop, cursor or any '
      + 'mcp client — auth runs over oauth. then a provider key (serper, hunter, …) '
      + 'so your tools can call out.',
      'your keys are resolved server-side, at execution: the model sees the result, '
      + 'never the secret.',
      'if something stopped you along the way, reply to this message — knowing what '
      + 'it was helps us.',
    ].join('\n\n'),
    cta_label_fr: 'aller à la console',
    cta_label_en: 'open the console',
    cta_url: CONSOLE_URL,
  }
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
