// Le panneau de connexion ne doit connaître AUCUN connecteur par son nom.
//
// Ce qu'on empêche de revenir, littéralement :
//
//   const isZoho = computed(() => ['zoho','zohodesk','zohoanalytics'].includes(c.value.name))
//   <ConnectorZohoOAuth v-if="isZoho && …" />
//
// Salesforce avait exactement la même forme côté backend — capacité de démarrage,
// callback, les deux hooks d'état, la fabrique OAuth — mais il n'était pas dans la
// liste. Résultat : aucun bouton sur sa fiche, et un client ne pouvait pas terminer sa
// connexion. Le réflexe naturel était d'ajouter un nom ; le vrai correctif est que le
// geste soit DÉCLARÉ par le backend (`connector_flow` → champ `connect` du catalogue) et
// rendu génériquement.
//
// Un test qui vérifie le comportement actuel ne protège pas de ça : la régression se
// fait en AJOUTANT un cas particulier, pas en cassant un cas existant. D'où un test qui
// lit la source.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// `__dirname` — la convention des specs qui lisent la source ici (cf. lib/orgScope.spec.ts).
const HERE = __dirname
const WIDGETS = join(HERE, '..')

/** Fichiers qui décident QUOI RENDRE pour la connexion d'un connecteur. */
const SURVEILLES = [
  join(HERE, 'ConnectorConnectionPanel.vue'),
  join(WIDGETS, 'ConnectorFlowConnect.vue'),
]

/** Noms de connecteurs qui ont été, ou pourraient être, gatés en dur ici. */
const NOMS = ['zoho', 'zohodesk', 'zohoanalytics', 'salesforce', 'hubspot', 'pipedrive',
              'attio', 'folk', 'brevo', 'crunchbase', 'pennylane', 'pennylaneged',
              'lemlist', 'serper', 'hunter', 'kaspr', 'dropcontact', 'spott']

function source(f: string): string {
  return readFileSync(f, 'utf8')
}

describe('le panneau de connexion ignore les noms de connecteurs', () => {
  it('aucun nom de connecteur en littéral', () => {
    for (const f of SURVEILLES) {
      const src = source(f)
      // On ignore les commentaires : ils RACONTENT l'incident, c'est leur rôle.
      const code = src.replace(/\/\/[^\n]*/g, '').replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
      for (const n of NOMS) {
        expect(code, `${f} nomme « ${n} »`).not.toMatch(
          new RegExp(`['"\`]${n}['"\`]`, 'i'))
      }
    }
  })

  it('aucun test sur `.name` du connecteur', () => {
    // `includes(c.name)`, `=== 'x'`, `startsWith('x')` : toutes les formes du gating.
    for (const f of SURVEILLES) {
      const code = source(f).replace(/\/\/[^\n]*/g, '').replace(/<!--[\s\S]*?-->/g, '')
      expect(code, `${f} branche sur le nom du connecteur`)
        .not.toMatch(/\.includes\(\s*c(onnector)?\.(value\.)?name/)
      expect(code, `${f} compare le nom du connecteur`)
        .not.toMatch(/(c|connector)\.(value\.)?name\s*===/)
    }
  })

  it('le widget de flux se rend depuis le descripteur, pas depuis une forme devinée', () => {
    const src = source(join(WIDGETS, 'ConnectorFlowConnect.vue'))
    // Il boucle sur les paramètres DÉCLARÉS…
    expect(src).toMatch(/flow\.params/)
    // …et l'étape restante vient du backend.
    expect(src).toMatch(/pending_action/)
    // Jamais un calcul local sur la présence d'une clé : poser l'application CRÉE le
    // credential, donc `user_key_configured` passe à vrai AVANT le consentement —
    // gater là-dessus masquerait le bouton au moment précis où il sert.
    // On lit le CODE, pas les commentaires : le nôtre raconte ce piège, c'est son rôle.
    const code = src.replace(/\/\/[^\n]*/g, '').replace(/<!--[\s\S]*?-->/g, '')
    expect(code).not.toMatch(/user_key_configured/)
  })

  it('le panneau monte le flux sur la présence du descripteur', () => {
    const src = source(join(HERE, 'ConnectorConnectionPanel.vue'))
    expect(src).toMatch(/c\.value\.connect/)
    expect(src).toMatch(/ConnectorFlowConnect/)
  })

  it('aucun composant de connexion nommé d\'après un connecteur ne subsiste', () => {
    // `ConnectorZohoOAuth.vue` était le symptôme visible : un composant qui porte le nom
    // d'un connecteur ne peut, par construction, servir qu'à lui.
    const fichiers = readdirSync(WIDGETS).filter((f) => f.endsWith('.vue'))
    const nommes = fichiers.filter((f) =>
      NOMS.some((n) => f.toLowerCase().includes(n) && f.startsWith('Connector')))
    expect(nommes, `composants nommés d'après un connecteur : ${nommes}`).toEqual([])
  })
})
