// Ce que l'écran de création de jetons doit GARANTIR (oto-dashboard#161).
//
// L'issue est née d'un coût mesuré : pour brancher UN tableau de dix lignes sur un
// service tiers, le jeton émis depuis cet écran ouvrait 35 tableaux de l'org EN
// ÉCRITURE — viviers clients et comptabilité compris — et le secret est parti chez ce
// tiers. La portée existait dans le modèle depuis le début ; aucune surface ne la
// posait. La précaution recommandée était donc juste et impraticable : le pire des deux.
import { describe, expect, it, vi, beforeEach } from 'vitest'

const appels: any[] = []
vi.mock('@/api/console', () => ({
  getTokens: () => Promise.resolve({ tokens: [] }),
  deleteToken: () => Promise.resolve({}),
  getMyOrgs: () => Promise.resolve({ orgs: [{ id: 7, name: 'acme' }] }),
  getNamespacesOfOrg: (o: number) => (appels.push(['ns', o]), Promise.resolve({ namespaces: [] })),
  listProjectsOfOrg: (o: number) => (appels.push(['proj', o]), Promise.resolve({ projects: [] })),
  createToken: (l: string, opts: any) => (appels.push(['create', l, opts]),
    Promise.resolve({ token: 'oto_x', label: l, scopes: null, ttl_days: null })),
}))

beforeEach(() => { appels.length = 0 })

describe('portée d’un jeton', () => {
  it('n’envoie AUCUNE portée quand rien n’est coché — pas une portée vide', async () => {
    // ⚠️ `{}` et `undefined` ne disent pas la même chose au backend : une portée VIDE
    // est un jeton qui n’ouvre rien, alors que la personne n’a rien demandé de tel.
    // C’est l’erreur naturelle quand on construit l’objet par accumulation.
    const { porteeDepuis } = await import('./tokenScope')
    expect(porteeDepuis({}, {})).toBeUndefined()
  })

  it('ne garde que les droits réellement choisis', async () => {
    const { porteeDepuis } = await import('./tokenScope')
    // `undefined` = la ligne est affichée mais laissée à « — » : elle ne doit pas
    // entrer dans la portée, sinon cocher puis décocher laisserait une trace.
    expect(porteeDepuis({ a: 'read', b: undefined as any }, {})).toEqual({
      namespaces: { a: 'read' },
    })
  })

  it('mêle tableaux et projets sans inventer de clé vide', async () => {
    const { porteeDepuis } = await import('./tokenScope')
    expect(porteeDepuis({ a: 'write' }, { '12': true })).toEqual({
      namespaces: { a: 'write' }, projects: { '12': 'read' },
    })
    // Un seul des deux ⇒ une seule clé. Un `projects: {}` ferait croire à une portée
    // projet posée et vide.
    expect(porteeDepuis({}, { '12': true })).toEqual({ projects: { '12': 'read' } })
  })
})

describe('la borne du label suit celle du BACKEND', () => {
  it('refuse au-delà de 32, pas de 40', async () => {
    const { schemaLabel } = await import('./tokenScope')
    expect(schemaLabel.safeParse('x'.repeat(32)).success).toBe(true)
    // ⚠️ Le formulaire acceptait 40 quand le backend refuse au-delà de 32
    // (`label_too_long`, 400) : il validait une saisie qu'il faisait ensuite rejeter.
    // Une borne de formulaire plus LARGE que celle du serveur ne protège de rien —
    // elle déplace le refus après l'envoi, là où il n'aide plus à corriger.
    expect(schemaLabel.safeParse('x'.repeat(33)).success).toBe(false)
    expect(schemaLabel.safeParse('x'.repeat(40)).success).toBe(false)
  })
})
