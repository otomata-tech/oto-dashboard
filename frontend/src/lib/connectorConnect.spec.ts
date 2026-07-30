// Le contrat de rendu de la connexion — et surtout : une méthode d'auth inconnue ne
// doit JAMAIS produire un panneau vide.
//
// Régression fondatrice (28/07 → 29/07) : le backend a ajouté `secret_then_oauth` au jeu
// de `auth.method`, le `switch` du panneau est tombé dans son `default`, et la carte
// Salesforce n'a plus rien rendu en prod — ni formulaire, ni bouton. Personne ne l'a vu :
// le type TS déclarait le jeu fermé (donc aucune erreur de compilation) et le test qui
// gèle ce jeu vit dans l'AUTRE repo. Ce fichier est le garde-fou côté front.
import { describe, expect, it } from 'vitest'
import { HANDLED_AUTH_METHODS, connectWidgetKind, type WidgetKind } from './connectorConnect'

const auth = (method: string, cardinality: 'single' | 'multi_account' = 'single') =>
  ({ method, cardinality }) as never

describe('connectWidgetKind', () => {
  it('rend un widget pour CHAQUE méthode du jeu fermé backend', () => {
    // Si le backend ajoute une valeur à `providers.auth_method`, elle doit arriver ici
    // AVANT d'être servie — sinon la carte se vide. Ce test est le rappel mécanique.
    for (const m of HANDLED_AUTH_METHODS) {
      const kind = connectWidgetKind(auth(m))
      expect(kind, `méthode ${m}`).not.toBe('unknown')
    }
  })

  it('le jeu géré est exactement celui du backend (providers.py::auth_method)', () => {
    // Miroir explicite du jeu fermé de `oto-backend/oto_mcp/providers.py`, gelé là-bas
    // par `tests/test_auth_descriptor.py::test_method_in_closed_set`. Les deux listes
    // doivent bouger ENSEMBLE — c'est un contrat cross-repo, et il se déploie en deux
    // fois : le front doit connaître la valeur AVANT que le backend la serve.
    expect([...HANDLED_AUTH_METHODS].sort()).toEqual(
      ['cookie', 'hosted', 'none', 'oauth', 'remote', 'secret'])
  })

  it('oauth multi-compte et mono-compte ne rendent pas le même widget', () => {
    expect(connectWidgetKind(auth('oauth', 'multi_account'))).toBe('google')
    expect(connectWidgetKind(auth('oauth', 'single'))).toBe('memento')
  })

  it('une méthode INCONNUE rend `unknown`, jamais un vide silencieux', () => {
    // Le cas exact de l'incident, plus quelques formes plausibles d'un backend en avance.
    for (const m of ['secret_then_oauth', 'saml', 'mtls', '', 'SECRET']) {
      expect(connectWidgetKind(auth(m)), `méthode ${m}`).toBe('unknown')
    }
  })

  it('tous les widgets rendus sont des valeurs déclarées', () => {
    const known: WidgetKind[] = ['key', 'session', 'google', 'memento', 'unipile',
                                 'remote', 'opendata', 'unknown']
    for (const m of [...HANDLED_AUTH_METHODS, 'nimportequoi']) {
      expect(known).toContain(connectWidgetKind(auth(m)))
    }
  })
})
