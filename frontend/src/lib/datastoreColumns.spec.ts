// Quelles colonnes d'un tableau sont à l'utilisateur, et lesquelles sont visibles
// — la règle que l'export CSV et DataTable.vue partagent (oto-dashboard#137).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { userFields, defaultColumns, visibleColumns, hiddenPatch } from './datastoreColumns'
import type { DatastoreField, DatastoreSchema } from '@/types/api'

describe('userFields', () => {
  it('exclut toute clé préfixée `_`, connue ou pas', () => {
    const rows = [
      { _id: '1', _created_at: 't', _updated_at: 't', _claimed_by: 'w', _claimed_until: 't', nom: 'a' },
    ]
    expect(userFields(rows)).toEqual(['nom'])
  })

  it("n'a besoin d'aucune liste énumérée — une colonne interne inconnue est couverte", () => {
    // La ligne de #137 : `_claimed_by`/`_claimed_until` sont nées APRÈS l'exclusion
    // énumérée et l'ont traversée. La règle par préfixe n'a rien à énumérer.
    expect(userFields([{ _brand_new_internal_field: 1, x: 1 }])).toEqual(['x'])
  })

  it('conserve l\'ordre de première apparition, union sur toutes les lignes', () => {
    expect(userFields([{ b: 1 }, { a: 1, b: 2 }, { c: 1 }])).toEqual(['b', 'a', 'c'])
  })

  it('rend [] sur un jeu vide', () => {
    expect(userFields([])).toEqual([])
  })
})

describe('defaultColumns', () => {
  it('sans schéma, rend tous les champs tels quels', () => {
    expect(defaultColumns(['a', 'b'], null)).toEqual(['a', 'b'])
    expect(defaultColumns(['a', 'b'], { fields: [] })).toEqual(['a', 'b'])
  })

  it('retire les champs déclarés `hidden: true` au schéma', () => {
    const schema = { fields: [{ key: 'a' }, { key: 'b', hidden: true }, { key: 'c', hidden: false }] }
    expect(defaultColumns(['a', 'b', 'c'], schema)).toEqual(['a', 'c'])
  })

  it('un champ user hors schéma reste visible par défaut (le schéma ne le connaît pas)', () => {
    const schema = { fields: [{ key: 'a', hidden: true }] }
    expect(defaultColumns(['a', 'residuel'], schema)).toEqual(['residuel'])
  })
})

describe('visibleColumns', () => {
  const schema = { fields: [{ key: 'a' }, { key: 'b', hidden: true }, { key: 'c' }] }

  it('sans choix ponctuel, applique le `hidden` du schéma', () => {
    expect(visibleColumns(['a', 'b', 'c'], schema, null)).toEqual(['a', 'c'])
  })

  it('le choix ponctuel (`?cols=`) prime sur le schéma, y compris pour ré-afficher une colonne masquée', () => {
    expect(visibleColumns(['a', 'b', 'c'], schema, ['b'])).toEqual(['b'])
  })

  it('un `?cols=` qui pointe une colonne disparue depuis ne la ressuscite pas', () => {
    expect(visibleColumns(['a', 'c'], schema, ['a', 'b', 'c'])).toEqual(['a', 'c'])
  })

  it('un choix ponctuel vide (tout décoché) est respecté — aucune colonne', () => {
    expect(visibleColumns(['a', 'b', 'c'], schema, [])).toEqual([])
  })
})

// ── « enregistrer comme vue par défaut » ne détruit pas ce qu'il ne nomme pas ──
//
// Le défaut fermé ici : le bouton reposait le schéma ENTIER (`PUT`), reconstruit en
// retirant `hidden` de tous les champs puis en le reposant sur les seuls décochés. Un
// aller-retour dans ce menu — dont tous les autres gestes sont purement locaux —
// rendait donc visibles, pour tout le monde, les colonnes masquées ailleurs : par un
// agent, ou sur une colonne absente de la page courante donc absente du menu.
//
// Ce banc juge le RÉSULTAT, pas la forme du corps : il applique au schéma la fusion
// par clé du serveur (miroir de `merge_fields`, oto-backend/oto_mcp/datastore/schema.py
// — les propriétés listées écrasent, les autres sont préservées, une clé inconnue est
// ajoutée) et vérifie ce qui reste debout après l'enregistrement.
const champ = (schema: DatastoreSchema, key: string): DatastoreField => {
  const f = (schema.fields ?? []).find((x) => x.key === key)
  if (!f) throw new Error(`champ absent du schéma : ${key}`)
  return f
}

function fusionServeur(schema: DatastoreSchema, patch: Array<Partial<DatastoreField>>): DatastoreSchema {
  const out = (schema.fields ?? []).map((f) => ({ ...f }))
  for (const p of patch) {
    const cible = out.find((f) => f.key === p.key)
    if (cible) Object.assign(cible, p)
    else out.push(p as DatastoreField)
  }
  return { ...schema, fields: out }
}

describe('hiddenPatch — enregistrer une vue préserve ce qu\'elle ne nomme pas', () => {
  // Un schéma réaliste : deux colonnes servies sur la page (donc dans le menu), une
  // troisième masquée par un agent et absente des lignes affichées, et des attributs
  // par champ qu'aucun réglage d'affichage n'a le droit de perdre.
  const schema: DatastoreSchema = {
    fields: [
      { key: 'nom', label: 'Nom du contact', type: 'text', width: 'half', required: true },
      { key: 'notes', label: 'Notes', type: 'text', width: 'full' },
      { key: 'scoring_interne', label: 'Score', type: 'number', hidden: true },
      {
        key: 'adresse', label: 'Adresse', type: 'object',
        fields: [{ key: 'rue', label: 'Rue' }, { key: 'cp', label: 'Code postal', hidden: true }],
      },
    ],
  }
  const menu = ['nom', 'notes']   // ce que la page affiche, donc ce que le menu gouverne

  it('ne nomme QUE la colonne décochée', () => {
    expect(hiddenPatch(menu, ['notes'], schema)).toEqual([{ key: 'notes', hidden: true }])
  })

  it('laisse intact un `hidden` posé sur une colonne hors du menu', () => {
    // Le cœur du défaut : `scoring_interne` est masquée par un agent et n'apparaît
    // sur aucune ligne de la page — l'utilisateur ne l'a jamais vue.
    const apres = fusionServeur(schema, hiddenPatch(menu, ['notes'], schema))
    expect(champ(apres, 'scoring_interne').hidden).toBe(true)
  })

  it('laisse intacts les autres attributs de TOUTES les colonnes', () => {
    const apres = fusionServeur(schema, hiddenPatch(menu, ['notes'], schema))
    expect(champ(apres, 'nom')).toEqual(champ(schema, 'nom'))          // pas touchée du tout
    expect(champ(apres, 'notes').label).toBe('Notes')
    expect(champ(apres, 'notes').width).toBe('full')
    expect(champ(apres, 'notes').type).toBe('text')
    expect(champ(apres, 'scoring_interne').label).toBe('Score')
  })

  it('laisse intacts les sous-champs d\'un composite, `hidden` compris', () => {
    const apres = fusionServeur(schema, hiddenPatch(menu, ['notes'], schema))
    expect(champ(apres, 'adresse').fields).toEqual(champ(schema, 'adresse').fields)
  })

  it('recocher une colonne masquée pose `hidden: false`, et rien d\'autre', () => {
    const avec = { fields: [{ key: 'nom' }, { key: 'notes', label: 'Notes', hidden: true }] }
    expect(hiddenPatch(menu, [], avec)).toEqual([{ key: 'notes', hidden: false }])
    const apres = fusionServeur(avec, hiddenPatch(menu, [], avec))
    expect(defaultColumns(menu, apres)).toEqual(['nom', 'notes'])
    expect(champ(apres, 'notes').label).toBe('Notes')
  })

  it('ne nomme rien quand la vue demandée est déjà celle du schéma — donc aucun appel', () => {
    // Zéro champ à patcher ⇒ l'appelant n'émet AUCUNE requête. Une modification de
    // schéma reconstruit un index sur la table partagée par tous les tableaux : un
    // appel gratuit est un verrou gratuit (interblocage du 05/09).
    expect(hiddenPatch(menu, [], schema)).toEqual([])
    expect(hiddenPatch(['nom', 'notes', 'scoring_interne'], ['scoring_interne'], schema)).toEqual([])
  })

  it('n\'ajoute pas au schéma une colonne qu\'il ne déclare pas', () => {
    // Une colonne servie par les lignes mais hors schéma (`unknown_fields: report`) :
    // la déclarer changerait ce que le tableau ACCEPTE — une décision de gouvernance,
    // pas un réglage d'affichage.
    expect(hiddenPatch(['nom', 'residuel'], ['residuel'], schema)).toEqual([])
  })

  it('un enregistrement groupe TOUS ses changements en une seule charge', () => {
    const patch = hiddenPatch(['nom', 'notes'], ['nom', 'notes'], schema)
    expect(patch).toEqual([{ key: 'nom', hidden: true }, { key: 'notes', hidden: true }])
  })
})

// ── le CÂBLAGE, pas seulement la fonction ───────────────────────────────────
// `hiddenPatch` ne protège rien si l'écran repose malgré tout le schéma entier, ou
// s'il lui passe pour portée autre chose que les colonnes du menu (les clés du
// schéma, par exemple : on remettrait `hidden: false` sur des colonnes que
// l'utilisateur n'a jamais vues). Ces deux régressions sont invisibles à un test de
// la fonction seule — elles vivent au point d'appel. Ce contrôle lit donc la source :
// s'il rougit sur une reformulation, c'est le moment de relire ce qu'on déplace.
describe('l\'écran enregistre la vue par un amendement, jamais par une repose', () => {
  const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')
  const lire = (rel: string) => readFileSync(join(SRC, rel), 'utf8')
  const compact = (s: string) => s.replace(/\s+/g, ' ')

  // ⚠️ Ce témoin cherchait le NOM `setNamespaceSchema` dans l'écran. Un nom se renomme —
  // et le jour où il l'aurait été (la bascule `namespace` → `datastore`, faite le 10/09/2026),
  // il serait passé au VERT sans plus rien mesurer. Il vise désormais le GESTE : un `PUT`
  // vers `…/schema`, quel que soit le nom de la fonction qui le porte, et où que ce soit
  // dans la couche API. Le wrapper mort a été supprimé le 08/09/2026 ; ceci empêche son
  // retour sous un autre nom.
  it('la couche API ne porte plus AUCUN PUT qui repose le schéma entier', () => {
    expect(compact(lire('api/console.ts'))).not.toMatch(/\/schema`,\s*\{\s*method: 'PUT'/)
  })

  it('amende par clé, et une seule fois par geste', () => {
    // Un seul appel : une modification de schéma reconstruit un index sur la table
    // que TOUS les tableaux partagent (interblocage du 05/09).
    const src = lire('components/console/DatastoreTable.vue')
    expect(src).toContain('hiddenPatch(')
    expect(src.match(/patchNamespaceSchema\(/g) ?? []).toHaveLength(1)
  })

  it('envoie pour portée les colonnes du MENU', () => {
    expect(compact(lire('components/console/DataTable.vue'))).toContain(
      "emit('save-view', { fields, hidden: fields.filter((k) => !isShown(k)) })")
  })
})
