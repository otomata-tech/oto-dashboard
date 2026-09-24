// Tripwire : le LEXIQUE de l'espace Automatisations (oto#214), tranché par le plan à la demande
// d'Alexis le 13/09/2026. La table de correspondance (mot produit → entité → identifiant) vit
// dans `docs/automations.md`.
//   • « campagne », jamais « flotte » ;
//   • « programmation », jamais « déclencheur » ;
//   • « exécution », jamais « travail » ni « job » au sens d'exécution ;
//   • « agent » ne désigne jamais une procédure ni une campagne.
//
// Ce que le contrôle PARCOURT : (1) toutes les valeurs de `automations.*` (et des blocs
// `automationsWebhook`, `automationsList`, `automationsFilters`) et
// `pageMeta.automations*`, en français — et leur pendant anglais, sous les mots anglais ;
// (2) le texte des gabarits des pages et des composants de l'espace, leurs attributs lus
// (`aria-label`, `title`, `placeholder`), et les chaînes littérales de leurs expressions et de
// leurs scripts, lues par les compilateurs (jamais un commentaire).
// Ce qu'il ne parcourt PAS : les phrases du SERVEUR affichées mot pour mot (un refus), qui ne
// sont pas les nôtres ; les identifiants de code, d'API et les noms d'événements, qui ne
// changent pas (l'argument de `emit`/`t` n'est pas un texte).
//
// Contre-épreuve : chaque motif est éprouvé sur une phrase fautive et chaque tolérance sur une
// phrase saine, puis une copie du dictionnaire et une source mutées en mémoire doivent rougir.
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { parse } from 'vue/compiler-sfc'
import fr from '@/locales/fr.json'
import en from '@/locales/en.json'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')

// ── Les motifs ──────────────────────────────────────────────────────────────
// « travail » garde ses AUTRES sens : l'espace de travail, la file de travail d'un tableau,
// le lot de travail qu'est une campagne.
const TOLERES_FR = [/espaces? de travail/gi, /files? de travail/gi, /lots? de travail/gi]
const INTERDITS_FR: { motif: RegExp; quoi: string }[] = [
  { motif: /d[ée]clencheurs?/i, quoi: '« déclencheur » (→ programmation)' },
  { motif: /\bflottes?\b/i, quoi: '« flotte » (→ campagne)' },
  { motif: /\btravail\b|\btravaux\b/i, quoi: '« travail » (→ exécution)' },
  { motif: /\bjobs?\b/i, quoi: '« job » (→ exécution)' },
  // Sans `\b` final : sans le drapeau `u`, « é » n'est pas une lettre pour `\b`, et
  // « programmé » en fin de phrase n'aurait jamais été vu.
  { motif: /\bagents?\s+programm/i, quoi: '« agent programmé » (→ programmation)' },
  { motif: /fiche d['’]un agent/i, quoi: '« fiche d’un agent » (→ exécution)' },
  { motif: /\bagents?\s+(?:de|d['’]une?)\s+(?:la\s+)?(?:procédure|campagne)/i, quoi: '« agent » pour une procédure ou une campagne' },
  { motif: /\b(?:procédures?|campagnes?)\s+(?:est|sont)\s+(?:un|des)\s+agents?/i, quoi: '« agent » pour une procédure ou une campagne' },
]
const INTERDITS_EN: { motif: RegExp; quoi: string }[] = [
  { motif: /\btriggers?\b/i, quoi: '“trigger” (→ schedule)' },
  { motif: /\bfleets?\b/i, quoi: '“fleet” (→ campaign)' },
  { motif: /\bjobs?\b/i, quoi: '“job” (→ execution)' },
  { motif: /\bscheduled agents?\b/i, quoi: '“scheduled agent” (→ schedule)' },
]

function fautes(texte: string, langue: 'fr' | 'en' = 'fr'): string[] {
  const lu = langue === 'fr' ? TOLERES_FR.reduce((s, r) => s.replace(r, ' '), texte) : texte
  return (langue === 'fr' ? INTERDITS_FR : INTERDITS_EN).filter(({ motif }) => motif.test(lu)).map(({ quoi }) => quoi)
}

// ── Les dictionnaires ───────────────────────────────────────────────────────
function valeurs(dict: unknown, chemin = ''): Array<[string, string]> {
  if (typeof dict === 'string') return [[chemin, dict]]
  if (!dict || typeof dict !== 'object') return []
  return Object.entries(dict as Record<string, unknown>).flatMap(([k, v]) => valeurs(v, chemin ? `${chemin}.${k}` : k))
}
const copieDe = (dict: Record<string, unknown>): Array<[string, string]> =>
  valeurs(dict).filter(([cle]) => cle.startsWith('automations') || cle.startsWith('pageMeta.automations'))

// Exception nommée par son SENS : la CITATION d'un libellé d'interface tierce. Le lexique porte
// sur nos objets, pas sur l'écran d'un tiers : celui des routines Anthropic dit « trigger », en
// anglais seulement, et le texte qui y envoie doit citer ce qu'on y lit. L'exception retire la
// seule citation, sur la seule clé qui la porte : le reste de la phrase, et toute autre clé,
// restent gardés.
const CITATIONS_INTERFACE_TIERCE: Record<string, Record<'fr' | 'en', string>> = {
  'automations.routines.empty': {
    fr: 'ajoute un trigger « API » (Add another trigger → API)',
    en: 'add an “API” trigger (Add another trigger → API)',
  },
}

function fautesDuDictionnaire(dict: Record<string, unknown>, langue: 'fr' | 'en'): string[] {
  return copieDe(dict).flatMap(([cle, v]) => {
    const citation = CITATIONS_INTERFACE_TIERCE[cle]?.[langue]
    const lu = citation ? v.split(citation).join(' ') : v
    return fautes(lu, langue).map((q) => `${cle} = « ${v} » : ${q}`)
  })
}

/** Une copie du dictionnaire où `cle` vaut `valeur`. */
function muter(dict: Record<string, unknown>, cle: string, valeur: string): Record<string, unknown> {
  const copie = JSON.parse(JSON.stringify(dict)) as Record<string, unknown>
  const chemin = cle.split('.')
  const parent = chemin.slice(0, -1).reduce<Record<string, unknown>>((o, k) => o[k] as Record<string, unknown>, copie)
  parent[chemin[chemin.length - 1]!] = valeur
  return copie
}

// ── Les sources ─────────────────────────────────────────────────────────────
/** Les chaînes littérales d'un code, lues par TypeScript : ni commentaire, ni module importé,
 * ni argument d'`emit` ou de `t`. */
function litteraux(code: string, expression: boolean): string[] {
  const sf = ts.createSourceFile('x.ts', expression ? `(${code})` : code, ts.ScriptTarget.Latest, true)
  const out: string[] = []
  const visiter = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && ['emit', 't'].includes(n.expression.text)) {
      n.arguments.slice(1).forEach(visiter)
      return
    }
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) out.push(n.text)
    if (ts.isTemplateExpression(n)) out.push(n.head.text, ...n.templateSpans.map((s) => s.literal.text))
    ts.forEachChild(n, visiter)
  }
  visiter(sf)
  return out
}

interface Noeud { type: number; content?: unknown; props?: Noeud[]; children?: Noeud[]; name?: string; value?: { content: string }; exp?: { content: string } }
const LUS = new Set(['aria-label', 'title', 'placeholder', 'alt'])

/** Ce qu'une vue affiche d'elle-même : texte du gabarit, attributs lus, chaînes des
 * expressions et du script. */
function textesDeLaVue(source: string): string[] {
  const { descriptor } = parse(source)
  const out: string[] = []
  const visiter = (n: Noeud): void => {
    if (n.type === 2 && typeof n.content === 'string') out.push(n.content)
    if (n.type === 5) out.push(...litteraux((n.content as { content: string }).content, true))
    if (n.type !== 1) return
    for (const p of n.props ?? []) {
      if (p.type === 6 && p.name && LUS.has(p.name) && p.value) out.push(p.value.content)
      if (p.type === 7 && p.name !== 'on' && p.exp) out.push(...litteraux(p.exp.content, true))
    }
    ;(n.children ?? []).forEach(visiter)
  }
  ;((descriptor.template?.ast as unknown as Noeud | undefined)?.children ?? []).forEach(visiter)
  const script = descriptor.scriptSetup?.content ?? descriptor.script?.content ?? ''
  out.push(...litteraux(script, false))
  return out.map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

const vues = (dossier: string) => readdirSync(join(SRC, dossier)).filter((f) => f.endsWith('.vue')).map((f) => join(SRC, dossier, f))
const PARCOURUES = [
  ...vues('views/console/automations'),
  ...vues('components/console/automations'),
  join(SRC, 'views/console/AutomationsView.vue'),
  join(SRC, 'components/console/RunnerJobDetail.vue'),
  join(SRC, 'components/console/RunnerTriggersCard.vue'),
]

function fautesDesSources(lire: (f: string) => string = (f) => readFileSync(f, 'utf8')): string[] {
  return PARCOURUES.flatMap((f) => textesDeLaVue(lire(f))
    .flatMap((txt) => fautes(txt).map((q) => `${relative(SRC, f)} : « ${txt} » : ${q}`)))
}

describe('lexique de l’espace Automatisations — ce qui est parcouru', () => {
  it('parcourt bien les pages, les composants et la copie (garde contre un zéro vide)', () => {
    // 22 fichiers depuis le 24/09/2026 : les listes des campagnes et des programmations sont
    // fondues dans l'entrée (quatre fichiers retirés, `AutomationsList` ajouté, `WebhookDeliveries`).
    expect(PARCOURUES.length).toBeGreaterThanOrEqual(22)
    const textes = PARCOURUES.flatMap((f) => textesDeLaVue(readFileSync(f, 'utf8')))
    // 211 textes mesurés le 13/09/2026 (dont 116 dans la fiche d'une exécution) : la plupart des
    // pages parlent par clés i18n, parcourues par le dictionnaire. Un effondrement de ce compte
    // voudrait dire que la lecture des gabarits ne voit plus rien.
    expect(textes.length).toBeGreaterThan(150)
    // Le texte en dur d'un gabarit ET une chaîne d'expression sont bien lus.
    expect(textes).toContain('Journal')
    expect(textes).toContain('pas encore prise')
    expect(copieDe(fr).length).toBeGreaterThan(150)
    expect(copieDe(en).length).toBe(copieDe(fr).length)
  })
})

describe('lexique de l’espace Automatisations', () => {
  it('la copie française n’emploie aucun mot retiré', () => {
    expect(fautesDuDictionnaire(fr, 'fr')).toEqual([])
  })

  it('la copie anglaise non plus, sous les mots anglais', () => {
    expect(fautesDuDictionnaire(en, 'en')).toEqual([])
  })

  it('chaque citation d’interface tierce figure mot pour mot dans sa clé : une exception périmée se voit', () => {
    for (const [cle, citations] of Object.entries(CITATIONS_INTERFACE_TIERCE)) {
      for (const [langue, dict] of [['fr', fr], ['en', en]] as const) {
        const valeur = copieDe(dict).find(([k]) => k === cle)?.[1] ?? ''
        expect(valeur, `${cle} (${langue})`).toContain(citations[langue])
      }
    }
  })

  it('les pages et les composants de l’espace n’en écrivent aucun en dur', () => {
    expect(fautesDesSources()).toEqual([])
  })
})

describe('contre-épreuve : le contrôle voit ce qu’il prétend voir', () => {
  it.each([
    'Supprimer ce déclencheur ?', 'Déclencheurs programmés', 'la flotte relance', 'Aucun travail.',
    'voir les travaux', 'voir les jobs', 'Agent programmé', "fiche d'un agent", 'l’agent de la procédure',
    'Cette campagne est un agent',
  ])('rougit sur « %s »', (phrase) => {
    expect(fautes(phrase)).not.toEqual([])
  })

  it.each([
    'espace de travail', 'La file de travail de ce tableau ne t’est pas lisible',
    'demande à ton agent de déclarer une nouvelle campagne', 'exécution la plus lourde', 'La ligne qu’elle a travaillée',
  ])('laisse passer « %s »', (phrase) => {
    expect(fautes(phrase)).toEqual([])
  })

  it('rougit en anglais sur trigger, fleet, job', () => {
    for (const phrase of ['Delete this trigger?', 'the fleet stops', 'No job.']) expect(fautes(phrase, 'en')).not.toEqual([])
    expect(fautes('the tool oto_trigger', 'en')).toEqual([])
  })

  it('l’exception d’interface tierce ne couvre que sa citation, sur sa clé', () => {
    const cle = 'automations.routines.empty'
    const citationEn = CITATIONS_INTERFACE_TIERCE[cle]!.en
    const citationFr = CITATIONS_INTERFACE_TIERCE[cle]!.fr
    const valeurEn = copieDe(en).find(([k]) => k === cle)![1]
    const valeurFr = copieDe(fr).find(([k]) => k === cle)![1]
    // « trigger » ailleurs dans la MÊME clé reste refusé.
    expect(fautesDuDictionnaire(muter(en, cle, `${valeurEn} Delete this trigger.`), 'en')).toHaveLength(1)
    // « déclencheur » dans la même clé reste refusé.
    expect(fautesDuDictionnaire(muter(fr, cle, `${valeurFr} Supprime ce déclencheur.`), 'fr')).toHaveLength(1)
    // La même citation, portée par une AUTRE clé, n'est pas couverte.
    expect(fautesDuDictionnaire(muter(en, 'automations.triggers.sub', citationEn), 'en')).toHaveLength(1)
    expect(fautesDuDictionnaire(muter(fr, 'automations.triggers.sub', `${citationFr}, un déclencheur`), 'fr')).toHaveLength(1)
    // Sans l'exception, la clé rougirait bien en anglais : l'exception sert, elle n'est pas décorative.
    expect(fautes(valeurEn, 'en')).not.toEqual([])
  })

  it('une copie mutée en mémoire rougit, et la faute nomme sa clé', () => {
    const mute = JSON.parse(JSON.stringify(fr)) as { automations: { campaign: { noJobs: string } } }
    mute.automations.campaign.noJobs = 'Aucun travail rattaché à cette campagne.'
    expect(fautesDuDictionnaire(mute, 'fr')).toEqual([
      'automations.campaign.noJobs = « Aucun travail rattaché à cette campagne. » : « travail » (→ exécution)',
    ])
  })

  it('une source mutée en mémoire rougit : texte en dur, attribut lu, littéral d’expression', () => {
    const cible = join(SRC, 'components/console/RunnerTriggersCard.vue')
    const lire = (f: string) => {
      const s = readFileSync(f, 'utf8')
      if (f !== cible) return s
      return s
        .replace('<code>oto_trigger</code>.', '<code>oto_trigger</code>. Aucun déclencheur.')
        .replace('class="dim rt-effet"', 'class="dim rt-effet" title="flotte en cours"')
        .replace("t('automations.triggers.title')", "'Agent programmé'")
    }
    const trouvees = fautesDesSources(lire)
    expect(trouvees).toHaveLength(3)
    expect(trouvees.every((x) => x.startsWith('components/console/RunnerTriggersCard.vue'))).toBe(true)
    expect(new Set(trouvees.map((x) => x.split(' : ').at(-1)))).toEqual(new Set([
      '« déclencheur » (→ programmation)', '« flotte » (→ campagne)', '« agent programmé » (→ programmation)',
    ]))
  })
})
