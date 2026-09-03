// Cohérence de la navigation : chaque écran atteignable doit savoir se nommer.
//
// ⚠️ Pourquoi ce fichier existe : `ConsoleTopbar` retombe sur l'entrée `/overview`
// quand un chemin n'est pas dans `PAGE_META`. Le repli est SILENCIEUX — la page
// `/automations` a affiché « overview » comme titre alors que ses libellés
// existaient déjà dans les deux locales (constaté le 2026-08-28) ; il ne manquait
// qu'une ligne dans la table. Rien ne cassait, rien n'alertait, et le titre mentait.
//
// Une règle qu'on doit penser à tenir finit par ne plus l'être : ces tests la
// tiennent à notre place. Ils échouent à l'ajout d'un écran sans son titre, ou
// d'un titre sans sa traduction.
import { describe, expect, it } from 'vitest'
import { NAV, PAGE_META } from './consoleNav'
import fr from '@/locales/fr.json'
import en from '@/locales/en.json'

const chemins = [...new Set(NAV.flatMap((g) => g.items.map((i) => i.path)))]

/** Résout une clé pointée (« pageMeta.orgBilling.title ») dans un dictionnaire. */
function resoudre(dict: unknown, cle: string): unknown {
  return cle.split('.').reduce<unknown>(
    (o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined),
    dict,
  )
}

describe('PAGE_META', () => {
  it('nomme tous les écrans de la navigation', () => {
    const manquants = chemins.filter((p) => !PAGE_META[p])
    expect(manquants, 'écrans sans titre — ils afficheraient « overview »').toEqual([])
  })

  // ⚠️ PAS de test « entrée de titre orpheline ». Il a été écrit puis retiré :
  // `/search`, `/documents` et `/activity` ont légitimement un titre sans entrée
  // de menu — on y arrive par un lien, une redirection ou un raccourci. Le test
  // criait donc sur trois cas sains, et une garde qui crie à tort cesse d'être
  // lue. Une entrée en trop n'a d'ailleurs aucun effet visible ; c'est l'absence
  // qui fait mentir le titre, et c'est elle qu'on garde ci-dessus.

  it('a ses libellés traduits dans les deux locales', () => {
    const absents: string[] = []
    for (const [chemin, meta] of Object.entries(PAGE_META)) {
      for (const cle of [meta.title, meta.crumb]) {
        for (const [nom, dict] of [['fr', fr], ['en', en]] as const) {
          if (typeof resoudre(dict, cle) !== 'string') absents.push(`${chemin} → ${cle} (${nom})`)
        }
      }
    }
    expect(absents, 'clés i18n non résolues').toEqual([])
  })
})

describe('NAV', () => {
  it('ne déclare pas deux fois le même chemin', () => {
    const tous = NAV.flatMap((g) => g.items.map((i) => i.path))
    const doublons = tous.filter((p, i) => tous.indexOf(p) !== i)
    expect([...new Set(doublons)]).toEqual([])
  })

  it('a ses libellés d’entrée traduits dans les deux locales', () => {
    const absents: string[] = []
    for (const g of NAV) {
      const cles = [...(g.group ? [g.group] : []), ...g.items.map((i) => i.label)]
      for (const cle of cles) {
        for (const [nom, dict] of [['fr', fr], ['en', en]] as const) {
          if (typeof resoudre(dict, cle) !== 'string') absents.push(`${cle} (${nom})`)
        }
      }
    }
    expect([...new Set(absents)], 'libellés de nav non traduits').toEqual([])
  })
})

// ── #160 : la sidebar d'org s'adapte aux DROITS, pas seulement au niveau ───────
//
// Un membre simple n'avait AUCUN chemin vers l'écran d'abonnement : l'unique entrée
// vivait au niveau `org`, dont la porte est gatée sur l'admin. La page lui est
// pourtant servie et conçue pour lui (ses factures, ses paiements, l'état de son
// org) — il fallait connaître l'URL.
//
// Ouvrir ce chemin sans trier le reste aurait remplacé « aucune porte » par « six
// portes fermées » : la sidebar ne filtrait que par `level`, jamais par droits.
// Ces deux tests tiennent les deux moitiés, et ils échoueront si l'une repart.

describe('#160 — le cran `orgAdmin` sur les entrées du niveau org', () => {
  const orgItems = NAV.find((g) => g.level === 'org')?.items ?? []

  it("l'abonnement reste ouvert à tout membre", () => {
    const billing = orgItems.find((i) => i.path === '/org/billing')
    expect(billing, "l'entrée abonnement a disparu du niveau org").toBeTruthy()
    expect(
      billing?.orgAdmin,
      'abonnement remarqué `orgAdmin` : un membre simple perdrait de nouveau tout '
      + 'chemin vers une page qui lui est servie — ses LECTURES sont ORG_MEMBER côté '
      + 'serveur (billing.status, billing.payments, invoices, identity.get), seules '
      + 'les écritures exigent l’admin et l’écran les masque déjà',
    ).toBeFalsy()
  })

  // `/org/context` est le SECOND écran de ce niveau ouvert à tout membre, et ce
  // test l'a découvert : ses lectures sont `SUB_ONLY`/`ORG_MEMBER` côté serveur
  // (`org.guide.get`, `org.instruction.get`) et sa vue masque déjà les écritures
  // (`ContextOrgView.vue` : `:can-edit="isOrgAdmin"` sur ses deux cartes). Il a donc
  // le même profil que l'abonnement — et souffrait du même manque de chemin.
  const OUVERTS = ['/org/billing', '/org/context']

  it('toutes les autres entrées du niveau org sont réservées à l’admin', () => {
    const ouvertes = orgItems
      .filter((i) => !OUVERTS.includes(i.path) && !i.orgAdmin)
      .map((i) => i.path)
    expect(
      ouvertes,
      'entrées d’administration visibles pour un membre simple : depuis #160 il '
      + 'PEUT atteindre le niveau org (par l’abonnement), donc une entrée non marquée '
      + 'lui est montrée — et il la trouvera fermée',
    ).toEqual([])
  })
})
