// ─────────────────────────────────────────────────────────────────────────────
// L'HOMONYMIE, LA DERNIÈRE SURFACE : les FILES DE TRAVAIL d'un projet (oto#160).
//
// Même défaut que `datastoreHomonymie.spec.ts` et `homonymieDesignationServeur.spec.ts` :
// à nom égal, `resolve_datastore_ns` préfère le tableau PERSONNEL de celui qui regarde.
// Le bloc « Files de travail » de l'accueil d'un projet recevait les NOMS des tableaux
// liés (`l.datastore ?? l.target_ref`, projetés par ProjectDetailView) et les
// rapprochait de la liste DU LECTEUR. Il adressait bien le serveur par un id — mais
// l'id d'une entrée CHOISIE PAR LE NOM : un lecteur qui possède un `clients` à lui et
// ouvre un projet lié à un autre `clients` voyait les compteurs du sien, sous le
// libellé du tableau du projet, avec un lien qui ouvrait le sien.
//
// Rejoué sur le code d'avant, ce banc peignait « clients 3 · a_faire 3 · fait 0 ·
// 1 sous bail » et adressait `41`, `41` — le tableau du projet en porte 24 et deux baux.
//
// Le serveur sert désormais l'adresse avec le lien (`datastore_id`, backend v1.262.0,
// résolu dans la portée du PROPRIÉTAIRE du projet) : le bloc la lit, et un lien qui
// n'en porte pas est NOMMÉ sans compteurs — jamais résolu à l'écran.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp, nextTick } from 'vue'

// ── le monde autour de l'écran (aucun réseau, aucun Logto, aucun routeur réel) ──
vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({ getAccessToken: async () => 'jeton-de-banc' }),
}))
vi.mock('@/lib/busy', () => ({ beginBusy: () => {}, endBusy: () => {} }))
vi.mock('@/composables/useToast', () => ({ useToast: () => ({ toast: () => {} }) }))
vi.mock('@/composables/usePrompt', () => ({
  usePrompt: () => ({ confirmAction: async () => true, promptForm: async () => null }),
}))
vi.mock('@/composables/useMe', () => ({ useMe: () => ({ me: { value: { sub: 'moi' } } }) }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/projects/5', params: {}, query: {} }),
  useRouter: () => ({ replace: async () => {}, push: async () => {} }),
  RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
  onBeforeRouteLeave: () => {},
}))
vi.mock('@/composables/useHotkey', () => ({ useHotkey: () => {} }))

import ProjectViewer from './project/ProjectViewer.vue'

// ── les deux tableaux homonymes, tous deux des files (statut à cycle de vie) ──
const SCHEMA = [
  { key: 'societe', label: 'société', role: 'title' as const },
  { key: 'etat', label: 'état', role: 'status' as const, lifecycle: { states: ['a_faire', 'fait'] } },
]
const MIEN = {
  id: 41, datastore: 'clients', url: '', shared: false, owner_type: 'user' as const,
  is_personal: true, can_write: true, can_govern: true, schema: { fields: SCHEMA },
}
const RECU = {
  id: 77, datastore: 'clients', url: '', shared: true, owner_type: 'user' as const,
  is_personal: false, can_write: true, can_govern: false, schema: { fields: SCHEMA },
}
// Des chiffres qui ne se confondent pas : 3 et un bail chez moi, 24 et deux baux au reçu.
const GROUPES: Record<number, Array<Record<string, unknown>>> = {
  41: [{ etat: 'a_faire', count: 3 }],
  77: [{ etat: 'a_faire', count: 11 }, { etat: 'fait', count: 13 }],
}
const DEMAIN = new Date(Date.now() + 3_600_000).toISOString().replace('Z', '')
const bail = (id: string) => ({ _id: id, _claimed_by: 'agent', _claimed_until: DEMAIN })
const FILES: Record<number, Array<Record<string, unknown>>> = {
  41: [bail('f41')],
  77: [bail('f77a'), bail('f77b')],
}

/** Le tri de `resolve_datastore_ns` : match par NOM d'abord, puis perso > org > grant. */
function resoudre(adresse: string) {
  const candidats = [MIEN, RECU].filter(
    (t) => t.datastore === adresse || String(t.id) === adresse)
  candidats.sort((a, b) =>
    (Number(a.datastore !== adresse) - Number(b.datastore !== adresse))
    || (Number(!a.is_personal) - Number(!b.is_personal)))
  return candidats[0] ?? null
}

/** Chaque segment `{datastore}` adressé par l'écran, dans l'ordre. */
const adresses: string[] = []
const repondre = (corps: unknown) =>
  ({ ok: true, status: 200, json: async () => corps }) as unknown as Response

beforeEach(() => {
  adresses.length = 0
  document.body.textContent = ''
  vi.stubGlobal('fetch', async (url: string) => {
    const chemin = new URL(url).pathname
    // La liste de l'org + le perso. Elle EXCLUT le reçu nominatif, comme en prod.
    if (chemin === '/api/datastores') return repondre({ datastores: [MIEN] })
    // La seule porte qui rende les reçus nominatifs (backend v1.255.0).
    if (chemin === '/api/me/datastores/shared') return repondre({ datastores: [RECU] })
    if (chemin === '/api/me/projects') return repondre({ runs: [] })
    const m = /^\/api\/datastores\/([^/]+)(\/.*)?$/.exec(chemin)
    if (!m) return repondre({})
    const adresse = decodeURIComponent(m[1] ?? '')
    adresses.push(adresse)
    const cible = resoudre(adresse)
    if (!cible) return { ok: false, status: 404, json: async () => ({ error: 'not_found' }) } as unknown as Response
    const reste = m[2] ?? ''
    if (reste.startsWith('/aggregate')) return repondre({ groups: GROUPES[cible.id] ?? [] })
    if (reste.startsWith('/queue')) return repondre({ rows: FILES[cible.id] ?? [] })
    return repondre({ ok: true })
  })
})

const vider = async () => {
  for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 0)); await nextTick() }
}

// ⚠️ `RouterLink` est enregistré GLOBALEMENT par le plugin routeur : sans ce stub
// d'application, le lien ne se rend pas et l'assertion sur l'adresse ne regarde rien.
const LIEN_STUB = { props: ['to'], template: '<a :href="to"><slot /></a>' }

/** L'accueil du projet, avec les liens `tableau` tels que le serveur les sert. */
async function accueil(tableLinks: Array<Record<string, unknown>>) {
  const hote = document.createElement('div')
  document.body.appendChild(hote)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const app = createApp(ProjectViewer as any, {
    item: { key: 'home', kind: 'page', label: 'Accueil · Brief', home: true },
    projectId: 5, projectName: 'p', tableLinks,
  })
  app.component('RouterLink', LIEN_STUB)
  app.mount(hote)
  await vider()
  const bloc = hote.querySelector('.pwq')
  return {
    texte: (bloc?.textContent ?? '').replace(/\s+/g, ' '),
    hrefs: [...(bloc?.querySelectorAll('a') ?? [])].map((a) => a.getAttribute('href')),
    lignes: bloc?.querySelectorAll('.pwq-line').length ?? 0,
    puces: bloc?.querySelectorAll('.pwq-chip').length ?? 0,
  }
}

// Un lien posé PAR NOM par un agent (#117) : `target_ref` est un nom, l'adresse est
// celle que le serveur a résolue dans la portée du propriétaire du projet.
const LIE_AU_RECU = { target_type: 'tableau', target_ref: 'clients', datastore: 'clients', datastore_id: 77 }
// Même forme, sans adresse : le serveur n'a désigné aucun tableau.
const SANS_ADRESSE = { target_type: 'tableau', target_ref: 'clients', datastore: 'clients' }

describe('les files de travail d un projet, tableau lié homonyme d un des miens', () => {
  it('comptent le tableau LIÉ, pas celui de même nom qui est à moi', async () => {
    const { texte, hrefs, lignes } = await accueil([LIE_AU_RECU])
    expect(lignes).toBe(1)
    // Le libellé reste le NOM — c'est ce que l'utilisateur reconnaît.
    expect(texte).toContain('clients')
    expect(texte).toContain('a_faire 11')
    expect(texte).toContain('fait 13')
    expect(texte).toContain('2 sous bail')
    expect(texte).not.toContain('a_faire 3')
    expect(texte).not.toContain('1 sous bail')
    // Le lien d'ouverture vise le même tableau que les compteurs.
    expect(hrefs).toEqual(['/data/77'])
    expect(adresses.length).toBeGreaterThanOrEqual(2)   // agrégat + file
    expect(adresses).toEqual(adresses.map(() => '77'))
  })

  it('comptent MON tableau quand c est lui que le projet lie (population témoin)', async () => {
    // Sans ce cas, un bloc qui ne montrerait JAMAIS 41 passerait le test du dessus.
    const { texte, hrefs } = await accueil([
      { target_type: 'tableau', target_ref: '41', datastore: 'clients', datastore_id: 41 },
    ])
    expect(texte).toContain('a_faire 3')
    expect(texte).toContain('1 sous bail')
    expect(texte).not.toContain('a_faire 11')
    expect(hrefs).toEqual(['/data/41'])
    expect(adresses).toEqual(adresses.map(() => '41'))
  })

  it('un lien sans identifiant est NOMMÉ, sans compteurs, et n adresse rien', async () => {
    // Le résoudre à l'écran, ce serait le résoudre chez le lecteur : il compterait 41.
    const { texte, hrefs, puces } = await accueil([SANS_ADRESSE])
    expect(texte).toContain('clients')
    expect(texte).toContain('aucun tableau résolu pour ce lien')
    expect(puces).toBe(0)
    expect(texte).not.toContain('sous bail')
    expect(hrefs).toEqual([])
    expect(adresses).toEqual([])
  })

  it('les deux côte à côte : le lié compté, l autre nommé, le mien nulle part', async () => {
    const { texte, hrefs, lignes } = await accueil([LIE_AU_RECU, SANS_ADRESSE])
    expect(lignes).toBe(2)
    expect(texte).toContain('a_faire 11')
    expect(texte).toContain('aucun tableau résolu pour ce lien')
    expect(texte).not.toContain('a_faire 3')
    expect(hrefs).toEqual(['/data/77'])
    expect(adresses).toEqual(adresses.map(() => '77'))
  })
})

// ── les témoins de source : ce qu'aucun montage n'atteint ─────────────────────
// Lus RELATIVEMENT à ce fichier pour les composants (la preuve de chute les rejoue
// depuis une copie mutée), depuis la racine `src/` pour la vue qui n'est pas montée.
const ICI = dirname(fileURLToPath(import.meta.url))
const SRC = ICI.slice(0, ICI.lastIndexOf('/src/') + '/src/'.length)
const FILES_PROJET = readFileSync(join(ICI, 'project/ProjectWorkQueues.vue'), 'utf8')
const VIEWER = readFileSync(join(ICI, 'project/ProjectViewer.vue'), 'utf8')
const DETAIL = readFileSync(join(SRC, 'views/console/ProjectDetailView.vue'), 'utf8')

describe('la désignation des files de projet, site par site', () => {
  it('la page projet passe les LIENS entiers, pas des noms projetés', () => {
    // ProjectDetailView n'est pas montée par ce banc : c'est ici que le nom repartirait.
    expect(DETAIL).toContain(':table-links="linksOf(\'tableau\')"')
    expect(DETAIL).not.toMatch(/l\.datastore \?\? l\.target_ref/)
    expect(VIEWER).toContain(':links="tableLinks"')
  })

  it('le bloc choisit ses tableaux par l identifiant du lien, jamais par le nom', () => {
    expect(FILES_PROJET).toContain('ids.has(n.id)')
    // …et l'adresse qui part est l'id de l'entrée choisie, pas son nom : les deux
    // moitiés comptent (choisir par id puis adresser par le nom recompte le mien).
    expect(FILES_PROJET).toContain('const ref = String(n.id)')
    expect(FILES_PROJET).not.toMatch(/\.has\(\s*n\.datastore\s*\)/)
    expect(FILES_PROJET).not.toMatch(/n\.datastore\s*===/)
    expect(FILES_PROJET).not.toMatch(/getNamespace\w*\(\s*n\.datastore/)
  })
})
