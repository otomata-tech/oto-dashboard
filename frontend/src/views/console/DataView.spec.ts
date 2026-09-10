// La liste des tableaux dit-elle À QUI ils sont, et POURQUOI elle ressemble à ça ?
//
// Le 10/09/2026, la liste rendue dans le contexte d'une org a montré dix tableaux
// PERSONNELS et zéro tableau de l'org — sans aucune marque. Deux silences se sont
// additionnés : une ligne sans badge se lit comme « le cas normal, celui de l'org où
// je suis », et rien ne disait que l'org, elle, n'avait AUCUN tableau. D'où la
// conclusion (fausse) que les données d'un autre client étaient là.
//
// Ce n'était pas une fuite ; c'était la vue qui répondait « voici ce qu'il y a ici »
// sans dire que le principal était vide. Les deux silences se testent ici :
// l'appartenance de chaque ligne, et la phrase qui explique la liste entière — dont
// les cas où elle doit se TAIRE, parce qu'un avertissement permanent n'avertit plus.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n } from '@/lib/i18n'
import type { NamespaceEntry } from '@/types/api'

const api = vi.hoisted(() => ({
  getNamespaces: vi.fn(),
  createNamespace: vi.fn(),
}))
vi.mock('@/api/console', () => api)
const { getNamespaces } = api

type MeLite = { sub: string; active_org: number | null; active_org_name?: string | null }
const me = ref<MeLite | null>(null)
vi.mock('@/composables/useMe', () => ({ useMe: () => ({ me }) }))

const Vide = defineComponent({ render: () => h('div') })
vi.mock('@/components/console/DatastoreTable.vue', () => ({ default: Vide }))
vi.mock('@/components/console/NamespaceCreateDialog.vue', () => ({ default: Vide }))

// Une entrée telle que `GET /api/datastores` la sert (cf. registre.py `_entry`) :
// `is_personal` = owner_type 'user' ET owner_id == mon sub. Un tableau d'un AUTRE
// user reçu par partage a donc `shared: true` et `is_personal: false`.
function entree(over: Partial<NamespaceEntry> = {}): NamespaceEntry {
  return {
    id: 1, namespace: 'prospects', url: '/data/1', shared: false,
    owner_type: 'user', owner_id: 'u-alexis', is_personal: true,
    can_write: true, can_govern: true, permission: 'write', schema: null,
    ...over,
  }
}
const DE_LORG = { owner_type: 'org' as const, owner_id: '42', is_personal: false }
const DE_LEQUIPE = { owner_type: 'group' as const, owner_id: '7', is_personal: false }
const RECU = {
  owner_type: 'user' as const, owner_id: 'u-autre', shared: true,
  is_personal: false, permission: 'read', can_write: false, can_govern: false,
}
const TYPE = { schema: { fields: [{ name: 'titre', type: 'text' }] } as never }

async function settle() {
  for (let i = 0; i < 10; i++) await nextTick()
  await new Promise((r) => setTimeout(r, 20))
  for (let i = 0; i < 10; i++) await nextTick()
}

async function monterListe(entrees: NamespaceEntry[]) {
  getNamespaces.mockResolvedValue({ namespaces: entrees })
  const DataView = (await import('./DataView.vue')).default
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/data', component: Vide },
      { path: '/data/:id', component: Vide },
      { path: '/data/:id/item/:rowId', component: Vide },
    ],
  })
  await router.push('/data')
  await router.isReady()
  const host = document.createElement('div')
  host.className = 'console-root'
  document.body.appendChild(host)
  const app = createApp(DataView)
  app.use(router)
  app.use(i18n)
  app.mount(host)
  await settle()
  const lignes = [...host.querySelectorAll('.ns-item')]
  return {
    host,
    lignes,
    badges: lignes.map((l) => [...l.querySelectorAll('.tag')].map((t) => t.textContent?.trim() ?? '')),
    contexte: host.querySelector('.ns-context')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
    unmount: () => { app.unmount(); host.remove() },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  i18n.global.locale.value = 'fr'
  // Le contexte de la confusion : une org active, dont AUCUN tableau n'existe.
  me.value = { sub: 'u-alexis', active_org: 42, active_org_name: 'Client X' }
})

describe('DataView — chaque ligne dit à qui elle est', () => {
  it('un tableau personnel porte son badge, dans le contexte d\'une org', async () => {
    const { badges, unmount } = await monterListe([entree()])
    expect(badges).toEqual([['personnel']])
    unmount()
  })

  it('les quatre appartenances portent chacune SON badge, et une seule', async () => {
    const { badges, unmount } = await monterListe([
      entree({ id: 1, namespace: 'a-moi' }),
      entree({ id: 2, namespace: 'de-lorg', ...DE_LORG }),
      entree({ id: 3, namespace: 'de-lequipe', ...DE_LEQUIPE }),
      entree({ id: 4, namespace: 'partage', ...RECU }),
    ])
    expect(badges).toEqual([['personnel'], ['org'], ['team'], ['shared · read']])
    unmount()
  })

  it('l\'appartenance reste le DERNIER badge, même flanquée du schéma', async () => {
    // Le zigzag : enfants directs d'un `space-between`, l'appartenance se décalait
    // vers le milieu sur les seules lignes portant aussi `typé`. Un groupe unique,
    // appartenance en dernier — c'est le bord droit stable qui rend la colonne
    // scannable. La CSS ne se teste pas ici ; l'ORDRE et le groupe, si.
    const { badges, lignes, unmount } = await monterListe([
      entree({ id: 1, namespace: 'nu' }),
      entree({ id: 2, namespace: 'typee', ...TYPE }),
    ])
    expect(badges).toEqual([['personnel'], ['typé', 'personnel']])
    for (const l of lignes) {
      expect(l.querySelectorAll('.ns-tags')).toHaveLength(1)
      // Aucun badge hors du groupe : c'est lui, et lui seul, qui est calé à droite.
      expect(l.querySelectorAll('.tag').length).toBe(l.querySelectorAll('.ns-tags .tag').length)
    }
    unmount()
  })

  it('la liste du 10/09 — dix tableaux, tous personnels, zéro tableau de l\'org', async () => {
    const dix = Array.from({ length: 10 }, (_, i) =>
      entree({ id: i + 1, namespace: `table-${i + 1}` }))
    const { badges, unmount } = await monterListe(dix)
    expect(badges).toHaveLength(10)
    // Pas un seul badge d'org, et pas une seule ligne nue. ⚠️ Assertion sur les
    // BADGES, jamais sur `host.textContent` : la prose d'aide de cette vue contient
    // « organize », « share » et « read ».
    expect(badges.flat()).not.toContain('org')
    expect(badges.some((b) => !b.length)).toBe(false)
    unmount()
  })
})

describe('DataView — la ligne de contexte dit pourquoi la liste ressemble à ça', () => {
  it('nomme l\'org quand elle n\'a aucun tableau et que la liste n\'est pas vide', async () => {
    const { contexte, unmount } = await monterListe([entree(), entree({ id: 2, namespace: 'b' })])
    expect(contexte).toBe(
      'aucun tableau dans Client X — ceux ci-dessous sont personnels ou partagés avec toi, pas les siens.')
    unmount()
  })

  it('un tableau REÇU en partage ne fait pas mentir la phrase — il n\'est à personne d\'ici', async () => {
    const { contexte, unmount } = await monterListe([
      entree({ id: 1, namespace: 'a-moi' }),
      entree({ id: 2, namespace: 'recu', ...RECU }),
    ])
    expect(contexte).toContain('aucun tableau dans Client X')
    unmount()
  })

  it('se tait dès que l\'org possède UN tableau — sinon elle parlerait tout le temps', async () => {
    const { contexte, unmount } = await monterListe([
      entree({ id: 1, namespace: 'a-moi' }),
      entree({ id: 2, namespace: 'de-lorg', ...DE_LORG }),
    ])
    expect(contexte).toBeNull()
    unmount()
  })

  it('se tait aussi quand c\'est une ÉQUIPE de l\'org qui possède — la table y vit', async () => {
    const { contexte, unmount } = await monterListe([
      entree({ id: 1, namespace: 'a-moi' }),
      entree({ id: 2, namespace: 'de-lequipe', ...DE_LEQUIPE }),
    ])
    expect(contexte).toBeNull()
    unmount()
  })

  it('se tait hors de toute org — il n\'y a alors aucun malentendu à fermer', async () => {
    me.value = { sub: 'u-alexis', active_org: null, active_org_name: null }
    const { contexte, badges, unmount } = await monterListe([entree()])
    expect(contexte).toBeNull()
    expect(badges).toEqual([['personnel']])   // le badge, lui, reste
    unmount()
  })

  it('se tait sans nom d\'org servi — « dans mon org » n\'apprendrait rien', async () => {
    me.value = { sub: 'u-alexis', active_org: 42, active_org_name: null }
    const { contexte, unmount } = await monterListe([entree()])
    expect(contexte).toBeNull()
    unmount()
  })

  it('se tait sur une liste VIDE — l\'état vide de la carte parle déjà', async () => {
    const { contexte, host, unmount } = await monterListe([])
    expect(contexte).toBeNull()
    expect(host.textContent).toContain('create one')
    unmount()
  })
})
