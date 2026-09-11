// ─────────────────────────────────────────────────────────────────────────────
// L'HOMONYMIE, LES DEUX DERNIERS ENDROITS — et pourquoi c'est le SERVEUR qui les
// répare (oto#160, suite de `datastoreHomonymie.spec.ts`).
//
// Le défaut est le même partout : à nom égal, `resolve_datastore_ns` préfère le
// tableau PERSONNEL du demandeur. Un écran qui adresse par le nom adresse donc
// « le tableau de celui qui regarde », jamais celui qu'on lui a demandé d'ouvrir.
// Deux surfaces le portaient encore, et aucune ne pouvait s'en sortir seule :
//
//   ① le DÉTAIL D'UN TRAVAIL DE RUNNER lit le nom porté par la charge utile du
//      travail. Résoudre ce nom à l'écran, ce serait le résoudre avec le demandeur
//      de l'écran — c'est-à-dire refaire exactement le bug. Le backend le résout
//      donc au nom de QUI A DÉCLARÉ la campagne et emporte `datastore_id` avec le
//      travail ;
//   ② le REPLI D'AFFICHAGE INTÉGRÉ dans un projet (aucune méta passée) cherchait
//      dans `GET /api/datastores`, qui exclut à dessein les partages nominatifs :
//      un tableau REÇU n'y est pas. Et le lien de projet, lui, pouvait ne porter
//      qu'un NOM (#117) — le backend sert désormais son `datastore_id`, résolu
//      dans la portée du PROPRIÉTAIRE du projet, donc identique pour tous.
//
// Ce fichier tient les deux temps : la REPRODUCTION (ce que l'écran peignait) et
// la DÉSIGNATION (ce qui part au serveur). Remettre le nom à un seul de ces
// endroits le rougit.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp, nextTick } from 'vue'

// ── le monde autour des écrans (aucun réseau, aucun Logto, aucun routeur réel) ──
vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({ getAccessToken: async () => 'jeton-de-banc' }),
}))
vi.mock('@/lib/busy', () => ({ beginBusy: () => {}, endBusy: () => {} }))
vi.mock('@/composables/useToast', () => ({ useToast: () => ({ toast: () => {} }) }))
vi.mock('@/composables/usePrompt', () => ({
  usePrompt: () => ({ confirmAction: async () => true, promptForm: async () => null }),
}))
vi.mock('@/composables/useTransferOwnership', () => ({
  useTransferOwnership: () => ({ transfer: async () => false }),
}))
vi.mock('@/composables/useMe', () => ({
  useMe: () => ({ me: { value: { sub: 'moi' } } }),
}))
// ⚠️ Le `RouterLink` du banc GARDE son `to` : c'est l'adresse qu'on veut lire. Un
// stub qui l'avale rendrait ce fichier vert quoi qu'on écrive dans le `:to`.
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/automations', params: {}, query: {} }),
  useRouter: () => ({ replace: async () => {}, push: async () => {} }),
  RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
  onBeforeRouteLeave: () => {},
}))
vi.mock('@/composables/useHotkey', () => ({ useHotkey: () => {} }))

import DatastoreTable from './DatastoreTable.vue'
import RunnerJobDetail from './RunnerJobDetail.vue'
import ProjectViewer from './project/ProjectViewer.vue'

// ── les deux tableaux homonymes ────────────────────────────────────────────────
const SCHEMA = [
  { key: 'societe', label: 'société', role: 'title' as const },
]
const MIEN = {
  id: 41, datastore: 'clients', url: '', shared: false,
  owner_type: 'user' as const, is_personal: true, can_write: true, can_govern: true,
  schema: { fields: SCHEMA },
}
const RECU = {
  id: 77, datastore: 'clients', url: '', shared: true,
  owner_type: 'user' as const, is_personal: false, can_write: true, can_govern: false,
  schema: { fields: SCHEMA },
}
const LIGNES: Record<number, Array<Record<string, unknown>>> = {
  41: [{ _id: 'l41', societe: 'MON-CLIENT-A-MOI' }],
  77: [{ _id: 'l77', societe: 'CLIENT-RECU-EN-PARTAGE' }],
}
const DEMAIN = new Date(Date.now() + 3_600_000).toISOString().replace('Z', '')
/** La file de travail : une ligne sous bail, tenue par le run du travail ouvert. */
const FILES: Record<number, Array<Record<string, unknown>>> = {
  41: [{ _id: 'file41', _claimed_by: 'agent', _claimed_until: DEMAIN, _claimed_run: 'run-x' }],
  77: [{ _id: 'file77', _claimed_by: 'agent', _claimed_until: DEMAIN, _claimed_run: 'run-x' }],
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

/** Chaque segment `{datastore}` adressé par un écran, dans l'ordre. */
const adresses: string[] = []

function repondre(corps: unknown) {
  return { ok: true, status: 200, json: async () => corps } as unknown as Response
}

beforeEach(() => {
  adresses.length = 0
  document.body.innerHTML = ''
  vi.stubGlobal('fetch', async (url: string) => {
    const chemin = new URL(url).pathname
    // La liste de l'org + le perso. Elle EXCLUT le reçu nominatif, comme en prod.
    if (chemin === '/api/datastores') return repondre({ datastores: [MIEN] })
    // La seule porte qui rende les reçus nominatifs (backend v1.255.0).
    if (chemin === '/api/me/datastores/shared') return repondre({ datastores: [RECU] })
    if (chemin === '/api/me/runs/thread') return repondre({ run_id: 'run-x', messages: [] })
    const m = /^\/api\/datastores\/([^/]+)(\/.*)?$/.exec(chemin)
    if (!m) return repondre({})
    const adresse = decodeURIComponent(m[1] ?? '')
    adresses.push(adresse)
    const cible = resoudre(adresse)
    if (!cible) return { ok: false, status: 404, json: async () => ({ error: 'not_found' }) } as unknown as Response
    const reste = m[2] ?? ''
    if (reste.startsWith('/rows')) {
      const lignes = LIGNES[cible.id] ?? []
      return repondre({ rows: lignes, total: lignes.length, offset: 0, limit: 25 })
    }
    if (reste.startsWith('/aggregate')) return repondre({ groups: [] })
    if (reste.startsWith('/queue')) return repondre({ rows: FILES[cible.id] ?? [] })
    if (reste.startsWith('/activity')) return repondre({ activity: [], retention_days: 30 })
    return repondre({ ok: true })
  })
})

const vider = async () => {
  for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 0)); await nextTick() }
}

// ⚠️ `RouterLink` est enregistré GLOBALEMENT par le plugin routeur en prod : les
// écrans ne l'importent pas, donc le mock de module ne suffit pas — sans ce stub
// d'application, le `<RouterLink>` ne résout pas et l'assertion sur l'adresse
// porterait sur un élément absent (un banc vert qui ne regarde rien).
const LIEN_STUB = { props: ['to'], template: '<a :href="to"><slot /></a>' }

function monter(composant: unknown, props: Record<string, unknown>) {
  const hote = document.createElement('div')
  document.body.appendChild(hote)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const app = createApp(composant as any, props)
  app.component('RouterLink', LIEN_STUB)
  app.mount(hote)
  return hote
}

// ─────────────────────────────────────────────────────────────────────────────
// ① LE DÉTAIL D'UN TRAVAIL DE RUNNER
// ─────────────────────────────────────────────────────────────────────────────
const TRAVAIL = {
  id: 9, kind: 'start', status: 'claimed', run_id: 'run-x',
  attempts: 1, max_attempts: 3, claimed_by: 'worker-1',
  created_at: '2026-09-11T08:00:00', due_at: '2026-09-11T08:00:00',
  result: null,
}

describe('le détail d un travail de runner', () => {
  it('adresse le tableau par l identifiant que le SERVEUR a mis dans la charge utile', async () => {
    // La campagne vise le tableau REÇU. Son nom, à lui seul, désignerait le mien :
    // c'est la reproduction — avant que le backend n'emporte `datastore_id`, la
    // file lue était celle de 41 et le lien ouvrait `/data/clients`.
    monter(RunnerJobDetail, {
      job: { ...TRAVAIL, payload: { namespace: 'clients', datastore_id: 77, procedure: 'relance' } },
    })
    await vider()

    const liens = [...document.body.querySelectorAll('a')]
    // La ligne que ce run tient est celle du tableau REÇU. Avant le correctif, ce lien
    // valait `/data/clients/item/file41` : une ligne du tableau DU LECTEUR, offerte
    // comme « la ligne qu'il tient ».
    const ligne = liens.find((a) => a.textContent?.includes('ouvrir la ligne qu'))
    expect(ligne?.getAttribute('href')).toBe('/data/77/item/file77')
    // Le LIBELLÉ reste le nom — c'est ce que l'utilisateur reconnaît.
    const ouvrir = liens.find((a) => a.textContent?.includes('ouvrir le tableau'))
    expect(ouvrir?.textContent).toContain('clients')
    expect(ouvrir?.getAttribute('href')).toBe('/data/77')
    expect(adresses.length).toBeGreaterThan(0)
    expect(adresses).toEqual(adresses.map(() => '77'))
  })

  it.each(['pending', 'done', 'failed'])(
    'un travail ANCIEN au statut %s n offre aucun lien vers un tableau', async (status) => {
      // Le lien se garde sur l'identifiant, pas sur le statut : un travail conclu ou
      // pas encore pris qui nomme son tableau ne l'ouvre pas davantage.
      monter(RunnerJobDetail, {
        job: { ...TRAVAIL, status, payload: { namespace: 'clients', procedure: 'relance' } },
      })
      await vider()
      expect(adresses).toEqual([])
      expect([...document.body.querySelectorAll('a')]
        .some((a) => (a.getAttribute('href') ?? '').startsWith('/data/'))).toBe(false)
      expect(document.body.textContent).toContain('clients')
    })

  it('un travail ANCIEN, sans identifiant : il montre le nom et n ouvre RIEN', async () => {
    // ⚠️ La charge utile est persistée : ce qui a été enfilé avant le correctif
    // n'aura jamais d'identifiant. Afficher le nom sans prétendre l'ouvrir vaut
    // mieux qu'ouvrir le mauvais — donc aucune adresse ne part au serveur.
    monter(RunnerJobDetail, {
      job: { ...TRAVAIL, payload: { namespace: 'clients', procedure: 'relance' } },
    })
    await vider()

    expect(adresses).toEqual([])
    const liens = [...document.body.querySelectorAll('a')]
    expect(liens.some((a) => a.textContent?.includes('ouvrir le tableau'))).toBe(false)
    expect(document.body.textContent).toContain('sans l’identifier')
    // Le nom reste dit : on n'efface pas ce qu'on sait.
    expect(document.body.textContent).toContain('clients')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// ② LE REPLI D'AFFICHAGE INTÉGRÉ (aucune méta passée)
// ─────────────────────────────────────────────────────────────────────────────
describe('l affichage intégré dans un projet, sans méta passée', () => {
  it('résout un tableau REÇU par son identifiant — la liste de l org ne le rend pas', async () => {
    // C'est la reproduction : avant, `getNamespaces()` était la SEULE liste
    // consultée, elle exclut les partages nominatifs, et l'écran répondait
    // « Tableau introuvable dans ce contexte » sur un tableau parfaitement lisible.
    const hote = monter(DatastoreTable, { nsRef: String(RECU.id), govern: false })
    await vider()

    expect(hote.textContent).toContain('CLIENT-RECU-EN-PARTAGE')
    expect(hote.textContent).not.toContain('MON-CLIENT-A-MOI')
    expect(hote.textContent).not.toContain('introuvable')
    expect(adresses).toEqual(adresses.map(() => '77'))
  })

  it('un lien de projet posé PAR NOM peint le tableau que le serveur désigne, pas le sien', async () => {
    // LA REPRODUCTION de ② : un agent lie le tableau par son nom (#117). Le viewer
    // passait `target_ref` — le nom — et le repli le rapprochait de la liste du
    // LECTEUR : le projet peignait `MON-CLIENT-A-MOI` sous le libellé « clients ».
    const item = {
      key: 'link:tableau:clients|', kind: 'tableau', label: 'clients',
      link: { target_type: 'tableau', target_ref: 'clients', datastore: 'clients', datastore_id: 77 },
    }
    const hote = monter(ProjectViewer, { item, projectId: 5, projectName: 'p' })
    await vider()
    expect(hote.textContent).toContain('CLIENT-RECU-EN-PARTAGE')
    expect(hote.textContent).not.toContain('MON-CLIENT-A-MOI')
    expect(adresses).toEqual(adresses.map(() => '77'))
  })

  it('sans identifiant servi, le lien ne monte AUCUN tableau et le dit', async () => {
    // Le serveur n'a pas su désigner un seul tableau dans la portée du projet : on ne
    // devine pas à sa place — deviner, c'est retomber sur celui du lecteur.
    const item = {
      key: 'link:tableau:clients|', kind: 'tableau', label: 'clients',
      link: { target_type: 'tableau', target_ref: 'clients', datastore: 'clients' },
    }
    const hote = monter(ProjectViewer, { item, projectId: 5, projectName: 'p' })
    await vider()
    expect(hote.textContent).not.toContain('MON-CLIENT-A-MOI')
    expect(hote.textContent).toContain('Aucun tableau résolu pour ce lien')
    expect(adresses).toEqual([])
  })

  it('un NOM, lui, désigne toujours le tableau de celui qui regarde', async () => {
    // On ne le « corrige » pas ici — c'est la nature d'un nom, et c'est POURQUOI
    // le lien de projet ne doit plus en passer un (témoin de source ci-dessous).
    const hote = monter(DatastoreTable, { nsRef: 'clients', govern: false })
    await vider()
    expect(hote.textContent).toContain('MON-CLIENT-A-MOI')
  })
})

// ── les témoins de source : ce qu'aucun montage n'atteint ─────────────────────
const ICI = dirname(fileURLToPath(import.meta.url))
const VIEWER = readFileSync(join(ICI, 'project/ProjectViewer.vue'), 'utf8')
const JOB = readFileSync(join(ICI, 'RunnerJobDetail.vue'), 'utf8')
const TABLE = readFileSync(join(ICI, 'DatastoreTable.vue'), 'utf8')

describe('la désignation, site par site', () => {
  it('l embed de lien de projet passe l IDENTIFIANT servi, et rien d autre', () => {
    expect(VIEWER).not.toMatch(/:ns-ref="link\.target_ref"/)
    expect(VIEWER).toContain(':ns-ref="String(link.datastore_id)"')
    // …et il ne se monte pas du tout quand le serveur n'a pas su désigner : sans
    // cette garde, `String(null)` partirait comme adresse.
    expect(VIEWER).toMatch(/v-if="link\.datastore_id != null"[^>]*:ns-ref="String\(link\.datastore_id\)"/)
  })

  it('le détail de travail n adresse jamais le serveur par le nom', () => {
    for (const m of JOB.matchAll(/getNamespaceQueue\(\s*([A-Za-z_$][\w$.]*)/g))
      expect(m[1]).toBe('ns')
    // Le `ns` de ce site EST l'identifiant.
    expect(JOB).toContain('const ns = tableauId.value')
    // Aucune adresse `/data/…` bâtie sur le nom.
    for (const m of JOB.matchAll(/`\/data\/\$\{encodeURIComponent\(([A-Za-z_$][\w$.]*)\)/g))
      expect(m[1]).toBe('tableauId')
    // Le nom reste un LIBELLÉ, et il est toujours montré.
    expect(JOB).toContain('ouvrir le tableau {{ tableauNom }}')
  })

  it('le repli consulte les DEUX listes, et l identifiant avant le nom', () => {
    expect(TABLE).toContain('getSharedWithMe()')
    // L'ordre est le sujet : chercher les deux clés dans la même passe laissait
    // l'ordre de la liste trancher — donc un homonyme gagner sur l'identifiant.
    const debut = TABLE.indexOf('async function resolveMeta')
    expect(debut).toBeGreaterThan(-1)
    const repli = TABLE.slice(debut, TABLE.indexOf('async function fetchRows'))
    const parId = repli.indexOf('String(n.id) === props.nsRef')
    const parNom = repli.indexOf('n.datastore === props.nsRef')
    expect(parId).toBeGreaterThan(-1)
    expect(parNom).toBeGreaterThan(parId)
  })
})
