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
//
// Depuis l'arbitrage du 10/09 (oto#160), un troisième point : le personnel n'est pas
// filtré, il est RANGÉ À PART — sous la liste de l'org, dans une section repliée qui
// annonce son libellé et son nombre. Le `plan` de la liste (ordre du DOM, lignes cachées
// marquées) le vérifie : la simple présence des lignes ne dit rien de leur place.
// Repliée dans une org, dépliée hors org — aucune org active, ou l'espace personnel.
//
// Quatrième point depuis le 10/09 : une SECONDE section, « partagé avec moi », qui rend
// les partages nominatifs — ceux que la liste de l'org exclut à dessein et qu'aucune
// porte ne rendait. Trois choses s'y éprouvent : qu'aucun tableau n'y soit compté deux
// fois, que la phrase reste juste avec elle en plus, et qu'un lien direct vers un
// tableau reçu affiche ce tableau (c'est ce défaut-là qui a motivé l'arbitrage).
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n } from '@/lib/i18n'
import type { DatastoreEntry, SharedDatastoreEntry } from '@/types/api'

const api = vi.hoisted(() => ({
  getNamespaces: vi.fn(),
  getSharedWithMe: vi.fn(),
  createNamespace: vi.fn(),
}))
vi.mock('@/api/console', () => api)
const { getNamespaces, getSharedWithMe } = api

type MeLite = {
  sub: string; active_org: number | null; active_org_name?: string | null
  active_org_is_personal?: boolean
}
const me = ref<MeLite | null>(null)
vi.mock('@/composables/useMe', () => ({ useMe: () => ({ me }) }))

const Vide = defineComponent({ render: () => h('div') })
// Le panneau de droite rend ce qu'on lui PASSE : c'est la preuve qu'un lien direct a
// résolu — quel tableau est ouvert, et sous quelle référence il ira chercher ses lignes.
const Tableau = defineComponent({
  props: { nsRef: { type: String, default: '' }, nsMeta: { type: Object, default: null } },
  render() {
    return h('div', { class: 'ds-table' },
      `${this.nsRef}|${(this.nsMeta as { datastore?: string } | null)?.datastore ?? ''}`)
  },
})
vi.mock('@/components/console/DatastoreTable.vue', () => ({ default: Tableau }))
vi.mock('@/components/console/NamespaceCreateDialog.vue', () => ({ default: Vide }))

// Une entrée telle que `GET /api/datastores` la sert (cf. registre.py `_entry`) :
// `is_personal` = owner_type 'user' ET owner_id == mon sub. Un tableau d'un AUTRE
// user reçu par partage a donc `shared: true` et `is_personal: false`.
function entree(over: Partial<DatastoreEntry> = {}): DatastoreEntry {
  return {
    id: 1, datastore: 'prospects', url: '/data/1', shared: false,
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

// La liste telle qu'on la LIT, dans l'ordre du DOM : un nom par ligne (« (caché) » si sa
// section est repliée), et chaque en-tête de section avec son libellé, son nombre, son état.
function lirePlan(host: HTMLElement): string[] {
  return [...host.querySelectorAll('.rowlist .ns-fold, .rowlist .ns-item')].map((e) => {
    if (e.classList.contains('ns-fold')) {
      const etat = e.getAttribute('aria-expanded') === 'true' ? 'ouvert' : 'replié'
      const libelle = e.querySelector('.ns-fold-label')?.textContent?.trim()
      return `[${libelle} ${e.querySelector('.ns-fold-count')?.textContent?.trim()} ${etat}]`
    }
    const cache = (e.closest('.ns-groupe') as HTMLElement | null)?.style.display === 'none'
    return `${e.querySelector('code')?.textContent?.trim()}${cache ? ' (caché)' : ''}`
  })
}

async function monterListe(
  entrees: DatastoreEntry[], chemin = '/data', recus: SharedDatastoreEntry[] = [],
) {
  getNamespaces.mockResolvedValue({ datastores: entrees })
  getSharedWithMe.mockResolvedValue({ datastores: recus })
  const DataView = (await import('./DataView.vue')).default
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/data', component: Vide },
      { path: '/data/:id', component: Vide },
      { path: '/data/:id/item/:rowId', component: Vide },
    ],
  })
  await router.push(chemin)
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
    // Ce que le panneau de droite affiche : `<nsRef>|<nom>` s'il tient un tableau, null sinon.
    panneau: () => host.querySelector('.ds-table')?.textContent ?? null,
    // Le titre des cartes de la colonne de droite (`ConsoleCard` rend son titre en `.t`) :
    // « pick a datastore » et « tableau introuvable ici » sont les deux culs-de-sac.
    titres: () => [...host.querySelectorAll('.data-layout .card-head .t')]
      .map((t) => t.textContent?.trim()),
    plan: () => lirePlan(host),
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
      entree({ id: 1, datastore: 'a-moi' }),
      entree({ id: 2, datastore: 'de-lorg', ...DE_LORG }),
      entree({ id: 3, datastore: 'de-lequipe', ...DE_LEQUIPE }),
      entree({ id: 4, datastore: 'partage', ...RECU }),
    ])
    // Le personnel passe SOUS l'org (arbitrage oto#160) : l'ordre change, pas les badges.
    expect(badges).toEqual([['org'], ['team'], ['shared · read'], ['personnel']])
    unmount()
  })

  it('l\'appartenance reste le DERNIER badge, même flanquée du schéma', async () => {
    // Le zigzag : enfants directs d'un `space-between`, l'appartenance se décalait
    // vers le milieu sur les seules lignes portant aussi `typé`. Un groupe unique,
    // appartenance en dernier — c'est le bord droit stable qui rend la colonne
    // scannable. La CSS ne se teste pas ici ; l'ORDRE et le groupe, si.
    const { badges, lignes, unmount } = await monterListe([
      entree({ id: 1, datastore: 'nu' }),
      entree({ id: 2, datastore: 'typee', ...TYPE }),
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
      entree({ id: i + 1, datastore: `table-${i + 1}` }))
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
    const { contexte, unmount } = await monterListe([entree(), entree({ id: 2, datastore: 'b' })])
    // « ceux ci-dessous sont personnels » décrivait une liste mêlée ; sous la phrase il n'y
    // a plus qu'un en-tête replié qui les compte. Elle dit donc où ils sont rangés.
    expect(contexte).toBe(
      'aucun tableau dans Client X — tes tableaux personnels sont rangés à part, ci-dessous.')
    unmount()
  })

  it('un tableau accordé à l\'ORG est partagé à ELLE, pas à moi — la phrase ne confond plus', async () => {
    // Elle disait « ceux ci-dessous sont partagés avec toi » de tableaux accordés à l'org
    // ou à une de ses équipes (`list_datastores_granted_to` n'accepte pas d'autre
    // principal). Depuis qu'une section s'appelle « partagé avec moi », ce mot doit
    // désigner une seule chose : ce qui a été donné à MA personne.
    const { contexte, unmount } = await monterListe([
      entree({ id: 1, datastore: 'a-moi' }),
      entree({ id: 2, datastore: 'recu', ...RECU }),
    ])
    expect(contexte).toBe('aucun tableau dans Client X — ceux ci-dessous lui sont partagés'
      + ' ; tes tableaux personnels sont rangés à part.')
    unmount()
  })

  it('sans personnel, la phrase ne promet pas une section qui n\'existe pas', async () => {
    const { contexte, unmount } = await monterListe([entree({ id: 2, datastore: 'recu', ...RECU })])
    expect(contexte).toBe('aucun tableau dans Client X — ceux ci-dessous lui sont partagés.')
    unmount()
  })

  it('se tait dès que l\'org possède UN tableau — sinon elle parlerait tout le temps', async () => {
    const { contexte, unmount } = await monterListe([
      entree({ id: 1, datastore: 'a-moi' }),
      entree({ id: 2, datastore: 'de-lorg', ...DE_LORG }),
    ])
    expect(contexte).toBeNull()
    unmount()
  })

  it('se tait aussi quand c\'est une ÉQUIPE de l\'org qui possède — la table y vit', async () => {
    const { contexte, unmount } = await monterListe([
      entree({ id: 1, datastore: 'a-moi' }),
      entree({ id: 2, datastore: 'de-lequipe', ...DE_LEQUIPE }),
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

describe('DataView — le personnel est rangé à part, replié, et s\'annonce (oto#160)', () => {
  it('org qui a ses tableaux + du personnel : l\'org seule en tête, le personnel dessous, replié et compté', async () => {
    const { plan, contexte, unmount } = await monterListe([
      entree({ id: 1, datastore: 'a-moi' }),
      entree({ id: 2, datastore: 'de-lorg', ...DE_LORG }),
      entree({ id: 3, datastore: 'a-moi-aussi' }),
      entree({ id: 4, datastore: 'de-lequipe', ...DE_LEQUIPE }),
    ])
    expect(plan()).toEqual([
      'de-lorg', 'de-lequipe',
      '[personnel 2 replié]', 'a-moi (caché)', 'a-moi-aussi (caché)',
    ])
    expect(contexte).toBeNull()
    unmount()
  })

  it('la liste du 10/09 — l\'org n\'a rien : la phrase, puis le personnel replié qui dit combien', async () => {
    const dix = Array.from({ length: 10 }, (_, i) =>
      entree({ id: i + 1, datastore: `table-${i + 1}` }))
    const { plan, contexte, unmount } = await monterListe(dix)
    expect(contexte).toBe(
      'aucun tableau dans Client X — tes tableaux personnels sont rangés à part, ci-dessous.')
    expect(plan()[0]).toBe('[personnel 10 replié]')
    // Plus une seule ligne personnelle VISIBLE : ce sont elles qui se lisaient comme
    // « les tableaux du client ». Replié, l'en-tête les compte sans les mêler.
    expect(plan().slice(1)).toHaveLength(10)
    expect(plan().slice(1).every((l) => l.endsWith('(caché)'))).toBe(true)
    unmount()
  })

  it('un clic déplie la section, un second la replie', async () => {
    const { host, plan, unmount } = await monterListe([entree({ id: 1, datastore: 'a-moi' })])
    const pli = host.querySelector<HTMLButtonElement>('.ns-fold')!
    pli.click()
    await settle()
    expect(plan()).toEqual(['[personnel 1 ouvert]', 'a-moi'])
    pli.click()
    await settle()
    expect(plan()).toEqual(['[personnel 1 replié]', 'a-moi (caché)'])
    unmount()
  })

  it('un lien direct vers un tableau personnel ouvre sa section — la ligne active n\'est pas cachée', async () => {
    const { plan, unmount } = await monterListe([
      entree({ id: 1, datastore: 'de-lorg', ...DE_LORG }),
      entree({ id: 2, datastore: 'a-moi' }),
    ], '/data/2')
    expect(plan()).toEqual(['de-lorg', '[personnel 1 ouvert]', 'a-moi'])
    unmount()
  })

  it('sans tableau personnel, pas d\'en-tête — pas de section à zéro', async () => {
    const { host, unmount } = await monterListe([entree({ id: 1, datastore: 'de-lorg', ...DE_LORG })])
    expect(host.querySelector('.ns-fold')).toBeNull()
    unmount()
  })

  it('aucune organisation : la liste servie est vide — ni section ni phrase, l\'état vide parle', async () => {
    // Sans org active, `GET /api/datastores` rend [] (`active_owner(None)` → liste vide,
    // registre.py) : le personnel n'y est pas servi du tout. On rend ce que le serveur sert.
    me.value = { sub: 'u-alexis', active_org: null, active_org_name: null }
    const { plan, contexte, host, unmount } = await monterListe([])
    expect(plan()).toEqual([])
    expect(contexte).toBeNull()
    expect(host.textContent).toContain('create one')
    unmount()
  })

  it('hors organisation, la section est DÉPLIÉE par défaut — il n\'y a rien d\'autre à montrer', async () => {
    // Décision d'Alexis du 10/09. Aujourd'hui le serveur ne sert aucune ligne sans org
    // active (test précédent) : la règle est posée pour le jour où il en servira.
    me.value = { sub: 'u-alexis', active_org: null, active_org_name: null }
    const { plan, contexte, unmount } = await monterListe([
      entree({ id: 1, datastore: 'a-moi' }),
      entree({ id: 2, datastore: 'a-moi-aussi' }),
    ])
    expect(plan()).toEqual(['[personnel 2 ouvert]', 'a-moi', 'a-moi-aussi'])
    expect(contexte).toBeNull()
    unmount()
  })

  it('dans l\'espace personnel, dépliée aussi — et la phrase se tait : ce n\'est pas une org', async () => {
    // Le cas qui a motivé la décision : un tableau créé par un agent naît personnel
    // (ADR 0068) ; replié ici, un utilisateur seul trouverait toutes ses tables cachées.
    // L'espace perso a un nom d'org SERVI : sans ce silence, la phrase dirait
    // « aucun tableau dans <son propre nom> ».
    me.value = { sub: 'u-alexis', active_org: 7, active_org_name: 'Alexis', active_org_is_personal: true }
    const { plan, contexte, unmount } = await monterListe([
      entree({ id: 1, datastore: 'a-moi' }),
      entree({ id: 2, datastore: 'a-moi-aussi' }),
    ])
    expect(plan()).toEqual(['[personnel 2 ouvert]', 'a-moi', 'a-moi-aussi'])
    expect(contexte).toBeNull()
    unmount()
  })

  it('dépliée par défaut, elle se replie quand même au clic — le geste prime sur le défaut', async () => {
    me.value = { sub: 'u-alexis', active_org: null, active_org_name: null }
    const { host, plan, unmount } = await monterListe([entree({ id: 1, datastore: 'a-moi' })])
    host.querySelector<HTMLButtonElement>('.ns-fold')!.click()
    await settle()
    expect(plan()).toEqual(['[personnel 1 replié]', 'a-moi (caché)'])
    unmount()
  })
})

describe('DataView — « partagé avec moi » : ce qu\'aucune liste ne rendait (oto#160)', () => {
  // Un tableau partagé NOMINATIVEMENT : `GET /api/datastores` l'exclut à dessein, et
  // `GET /api/me/datastores/shared` est la seule porte qui le rende. Forme d'une entrée
  // de cette route : celle d'un tableau, plus `shared_by`.
  function recu(over: Partial<SharedDatastoreEntry> = {}): SharedDatastoreEntry {
    return entree({
      id: 90, datastore: 'chantier-julien', owner_type: 'user', owner_id: 'u-julien',
      shared: true, is_personal: false, permission: 'write', can_write: true,
      can_govern: false, ...over,
    } as Partial<DatastoreEntry>) as SharedDatastoreEntry
  }

  it('se range SOUS le personnel, repliée dans une org, et dit son libellé et son nombre', async () => {
    const { plan, unmount } = await monterListe(
      [entree({ id: 1, datastore: 'de-lorg', ...DE_LORG }), entree({ id: 2, datastore: 'a-moi' })],
      '/data',
      [recu(), recu({ id: 91, datastore: 'vivier-partage' })],
    )
    expect(plan()).toEqual([
      'de-lorg',
      '[personnel 1 replié]', 'a-moi (caché)',
      '[partagé avec moi 2 replié]', 'chantier-julien (caché)', 'vivier-partage (caché)',
    ])
    unmount()
  })

  it('aucun doublon : un tableau que la liste de l\'org rend déjà n\'y réapparaît pas', async () => {
    // Le serveur écarte le même jeu, mais la vue compose DEUX réponses : entre les deux,
    // un partage nominatif peut avoir été élargi à l'org. L'invariant se tient ici.
    const partout = { id: 5, datastore: 'commun' }
    const { plan, unmount } = await monterListe(
      [entree({ ...partout, ...DE_LORG })], '/data', [recu(partout)],
    )
    expect(plan()).toEqual(['commun'])
    expect(plan().filter((l) => l.startsWith('commun'))).toHaveLength(1)
    unmount()
  })

  it('un lien direct vers un tableau REÇU l\'affiche — ni page vide, ni « introuvable »', async () => {
    // Le défaut vécu en clientèle le 10/09 : l'id était jeté en silence et l'écran rendu
    // était celui de « rien de sélectionné ». On vérifie les trois faces du geste — la
    // section s'ouvre, la ligne est active, et le panneau tient CE tableau.
    const { plan, panneau, titres, host, unmount } = await monterListe(
      [entree({ id: 1, datastore: 'de-lorg', ...DE_LORG })], '/data/90', [recu()],
    )
    expect(plan()).toEqual(['de-lorg', '[partagé avec moi 1 ouvert]', 'chantier-julien'])
    expect(panneau()).toBe('90|chantier-julien')
    expect(titres()).not.toContain('pick a datastore')
    expect(titres()).not.toContain('tableau introuvable ici')
    expect(host.querySelector('.ns-item.active code')?.textContent).toBe('chantier-julien')
    unmount()
  })

  it('un id qui ne résout NULLE PART reste un cul-de-sac nommé — la carte n\'accuse plus le partage', async () => {
    const { titres, host, unmount } = await monterListe(
      [entree({ id: 1, datastore: 'a-moi' })], '/data/404', [],
    )
    expect(titres()).toContain('tableau introuvable ici')
    // La phrase disait « un partage à une personne n'entre dans aucune liste » : depuis
    // cette section, ce serait envoyer le destinataire réclamer ce qu'il a déjà.
    expect(host.textContent).not.toContain('nominativement')
    unmount()
  })

  it('la phrase de l\'org nomme les DEUX sections rangées à part', async () => {
    const { contexte, unmount } = await monterListe(
      [entree({ id: 1, datastore: 'a-moi' }), entree({ id: 2, datastore: 'accorde', ...RECU })],
      '/data', [recu()],
    )
    expect(contexte).toBe('aucun tableau dans Client X — ceux ci-dessous lui sont partagés'
      + ' ; tes tableaux personnels et les tableaux partagés avec toi sont rangés à part.')
    unmount()
  })

  it('rien que des reçus : la phrase les nomme seuls, et l\'état vide se tait', async () => {
    const { contexte, host, plan, unmount } = await monterListe([], '/data', [recu()])
    expect(contexte).toBe(
      'aucun tableau dans Client X — les tableaux partagés avec toi sont rangés à part, ci-dessous.')
    expect(plan()).toEqual(['[partagé avec moi 1 replié]', 'chantier-julien (caché)'])
    // « no datastores yet » sous une section qui en montre un serait la contradiction
    // même qu'on retire de cet écran.
    expect(host.textContent).not.toContain('create one')
    unmount()
  })

  it('hors organisation, elle est DÉPLIÉE — comme la personnelle, et pour la même raison', async () => {
    me.value = { sub: 'u-alexis', active_org: null, active_org_name: null }
    const { plan, contexte, unmount } = await monterListe([], '/data', [recu()])
    expect(plan()).toEqual(['[partagé avec moi 1 ouvert]', 'chantier-julien'])
    expect(contexte).toBeNull()
    unmount()
  })

  it('aucun partage reçu : pas d\'en-tête — pas de section à zéro', async () => {
    const { plan, unmount } = await monterListe([entree({ id: 1, datastore: 'a-moi' })], '/data', [])
    expect(plan()).toEqual(['[personnel 1 replié]', 'a-moi (caché)'])
    unmount()
  })

  it('qui a partagé se lit au survol de la ligne — jamais dans une colonne de 220px', async () => {
    const { host, unmount } = await monterListe([], '/data', [recu({ shared_by: 'Julien Tulina' })])
    expect(host.querySelector('.ns-item')?.getAttribute('title')).toBe('partagé par Julien Tulina')
    unmount()
  })

  it('sans `shared_by` servi, aucun survol inventé — un serveur plus ancien ne le rend pas', async () => {
    const { host, unmount } = await monterListe([], '/data', [recu()])
    expect(host.querySelector('.ns-item')?.getAttribute('title')).toBeNull()
    unmount()
  })
})
