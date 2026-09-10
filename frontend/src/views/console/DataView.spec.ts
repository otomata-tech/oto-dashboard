// La liste des tableaux dit-elle À QUI ils sont ?
//
// Le 10/09/2026, la liste rendue dans le contexte d'une org a montré dix tableaux
// PERSONNELS et zéro tableau de l'org — sans aucune marque. Une ligne sans badge se
// lit comme « le cas normal, celui de l'org où je suis » : exactement l'inverse de la
// vérité, d'où la conclusion (fausse) que les données d'un autre client étaient là.
// Ce n'était pas une fuite ; c'était la vue qui taisait l'appartenance.
//
// Ce qui se teste ici : les quatre appartenances portent chacune leur badge, et aucune
// ne porte celui d'une autre. Le cas qui a coûté la confusion — org active, liste
// 100 % personnelle — est joué tel quel.
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
    badges: lignes.map((l) => [...l.querySelectorAll('.tag')].map((t) => t.textContent?.trim() ?? '')),
    unmount: () => { app.unmount(); host.remove() },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  i18n.global.locale.value = 'fr'
  // Le contexte de la confusion : une org active, dont AUCUN tableau n'existe.
  me.value = { sub: 'u-alexis', active_org: 42, active_org_name: 'Client X' }
})

describe('DataView — la liste des tableaux dit à qui ils sont', () => {
  it('un tableau personnel porte son badge, dans le contexte d\'une org', async () => {
    const { badges, unmount } = await monterListe([entree()])
    expect(badges).toEqual([['personnel']])
    unmount()
  })

  it('les quatre appartenances portent chacune SON badge, et une seule', async () => {
    const { badges, unmount } = await monterListe([
      entree({ id: 1, namespace: 'a-moi' }),
      entree({ id: 2, namespace: 'de-lorg', owner_type: 'org', owner_id: '42', is_personal: false }),
      entree({ id: 3, namespace: 'de-lequipe', owner_type: 'group', owner_id: '7', is_personal: false }),
      entree({ id: 4, namespace: 'partage', owner_type: 'user', owner_id: 'u-autre',
        shared: true, is_personal: false, permission: 'read', can_write: false, can_govern: false }),
    ])
    expect(badges).toEqual([['personnel'], ['org'], ['team'], ['shared · read']])
    unmount()
  })

  it('un tableau typé garde son badge de schéma EN PLUS de son appartenance', async () => {
    const { badges, unmount } = await monterListe([
      entree({ schema: { fields: [{ name: 'titre', type: 'text' }] } as never }),
    ])
    expect(badges).toEqual([['personnel', 'typé']])
    unmount()
  })

  it('la liste du 10/09 — dix tableaux, tous personnels, zéro tableau de l\'org', async () => {
    const dix = Array.from({ length: 10 }, (_, i) =>
      entree({ id: i + 1, namespace: `table-${i + 1}` }))
    const { badges, host, unmount } = await monterListe(dix)
    expect(badges).toHaveLength(10)
    expect(badges.every((b) => b[0] === 'personnel')).toBe(true)
    // Aucune ligne ne peut plus se lire comme « celle de l'org où je suis » :
    // pas un seul badge d'org dans la liste, et pas une seule ligne nue.
    expect(badges.flat()).not.toContain('org')
    expect(badges.some((b) => !b.length)).toBe(false)
    // Le rendu tel quel, pour juger la répétition à l'œil (dix badges identiques).
    expect(host.querySelector('.rowlist')?.textContent?.trim())
      .toBe(dix.map((n) => `${n.namespace}personnel`).join(''))
    unmount()
  })
})
