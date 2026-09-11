// ─────────────────────────────────────────────────────────────────────────────
// L'HOMONYMIE : deux tableaux nommés pareil, dont un REÇU en partage.
//
// `resolve_datastore_ns` (oto-backend) résout une adresse de tableau par NOM **ou**
// par ID, et — c'est le point — à nom égal elle préfère le tableau PERSONNEL du
// demandeur (`ORDER BY CASE WHEN d.namespace = %(ns)s THEN 0 ELSE 1 END,
// CASE WHEN owner_type='user' AND owner_id=%(sub)s THEN 0 …`). Tant que l'écran
// adresse par le nom, ouvrir un tableau REÇU qui porte le nom d'un des siens
// affiche les lignes du SIEN — sous le bon libellé, sans rien qui signale la
// substitution. Pire qu'une erreur : une réponse plausible et fausse.
//
// Le serveur factice ci-dessous rejoue cette préférence à la lettre. Le banc tient
// donc deux choses :
//   1. LE COMPORTEMENT — l'écran monté sur le tableau reçu doit peindre SES lignes.
//      C'est la reproduction : avant le correctif, il peignait celles du personnel.
//   2. LA DÉSIGNATION — aucune adresse partie de cet écran ne porte un nom. Le
//      montage n'exerce que les routes de lecture ; le témoin de source qui suit
//      couvre les seize points de désignation, y compris ceux qu'aucun montage
//      n'atteint (écriture, renommage, suppression, export). Remettre le nom à un
//      SEUL d'entre eux rougit ce fichier.
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
vi.mock('@/composables/useTransferOwnership', () => ({
  useTransferOwnership: () => ({ transfer: async () => false }),
}))
// La fiche portée par l'URL est HORS de la page servie : c'est ce qui force le
// `GET …/rows/{row_id}` dédié (sinon la row est trouvée dans la page et rien ne part).
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/data/77/item/hors-page', params: { rowId: 'hors-page' }, query: {} }),
  useRouter: () => ({ replace: async () => {} }),
  RouterLink: { template: '<a><slot /></a>' },
}))

import DatastoreTable from './DatastoreTable.vue'

// ── le serveur factice : le MÊME ordre de préférence que resolve_datastore_ns ──
// Le schéma porte un `status` à cycle de vie (→ barre de statuts, donc un aggregate)
// et un `metric` (→ tuiles, donc un second aggregate) : le montage exerce ainsi six
// routes au lieu de deux.
const SCHEMA = [
  { key: 'societe', label: 'société', role: 'title' as const },
  { key: 'etat', label: 'état', role: 'status' as const,
    lifecycle: { states: ['a_faire', 'fait'] } },
  { key: 'montant', label: 'montant', role: 'metric' as const, type: 'number' as const },
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

function repondre(corps: unknown) {
  return { ok: true, status: 200, json: async () => corps } as unknown as Response
}

beforeEach(() => {
  adresses.length = 0
  vi.stubGlobal('fetch', async (url: string) => {
    const chemin = new URL(url).pathname
    if (chemin === '/api/datastores') return repondre({ datastores: [MIEN] })
    const m = /^\/api\/datastores\/([^/]+)(\/.*)?$/.exec(chemin)
    if (!m) return repondre({})
    const adresse = decodeURIComponent(m[1] ?? '')
    adresses.push(adresse)
    const cible = resoudre(adresse)
    if (!cible) return { ok: false, status: 404, json: async () => ({ error: 'not_found' }) } as unknown as Response
    const queue = m[2] ?? ''
    const fiche = /^\/rows\/([^/?]+)$/.exec(queue)
    if (fiche) return repondre({ _id: fiche[1], societe: `FICHE-DE-${cible.id}` })
    if (queue.startsWith('/rows')) {
      const lignes = LIGNES[cible.id] ?? []
      return repondre({ rows: lignes, total: lignes.length, offset: 0, limit: 25 })
    }
    if (queue.startsWith('/aggregate')) return repondre({ groups: [] })
    if (queue.startsWith('/queue')) return repondre({ rows: [] })
    if (queue.startsWith('/activity')) return repondre({ activity: [], retention_days: 30 })
    return repondre({ ok: true })
  })
})

const vider = async () => {
  for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 0)); await nextTick() }
}

async function monterSurLeRecu() {
  const hote = document.createElement('div')
  document.body.appendChild(hote)
  createApp(DatastoreTable, { nsRef: String(RECU.id), nsMeta: RECU }).mount(hote)
  await vider()
  return hote
}

describe('un tableau reçu, homonyme d un des siens', () => {
  it('peint SES lignes, pas celles du tableau personnel de même nom', async () => {
    const hote = await monterSurLeRecu()
    // Le libellé reste le NOM — c'est ce que l'utilisateur a demandé à ouvrir.
    expect(hote.textContent).toContain('clients')
    // …mais les lignes doivent venir du tableau REÇU.
    expect(hote.textContent).toContain('CLIENT-RECU-EN-PARTAGE')
    expect(hote.textContent).not.toContain('MON-CLIENT-A-MOI')
  })

  it('n adresse le serveur QUE par l identifiant', async () => {
    const hote = await monterSurLeRecu()
    // Le journal du tableau n'est chargé qu'une fois déplié : on le déplie, sinon
    // la route `…/activity` (portée par un ENFANT) ne serait jamais exercée.
    const bouton = [...hote.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'activité')
    bouton?.dispatchEvent(new Event('click', { bubbles: true }))
    await vider()

    // Six routes au moins : lignes, deux agrégats, file, fiche hors page, journal.
    expect(new Set(adresses).size).toBeGreaterThan(0)
    expect(adresses.length).toBeGreaterThanOrEqual(6)
    expect(adresses).toEqual(adresses.map(() => String(RECU.id)))
  })
})

// ── le témoin de source : les points de désignation qu'aucun montage n'atteint ──
// (écriture d'une ligne, suppression, renommage, export CSV, patch de schéma…).
const ICI = dirname(fileURLToPath(import.meta.url))
const SRC = readFileSync(join(ICI, 'DatastoreTable.vue'), 'utf8')
const FILES_PROJET = readFileSync(join(ICI, 'project/ProjectWorkQueues.vue'), 'utf8')

/** Les fonctions du client REST dont le 1ᵉʳ argument EST l'adresse du tableau. */
const ADRESSANTES = [
  'getNamespaceRows', 'getNamespaceRow', 'getNamespaceAggregate', 'getNamespaceQueue',
  'releaseRowClaim', 'appendNamespaceRow', 'updateNamespaceRow', 'deleteNamespaceRow',
  'deleteNamespace', 'renameNamespace', 'patchNamespaceSchema', 'announceTransition',
]

describe('la désignation du tableau, site par site', () => {
  it('aucun appel ne reçoit le NOM comme adresse', () => {
    for (const fn of ADRESSANTES) {
      const re = new RegExp(`\\b${fn}\\(\\s*([A-Za-z_$][\\w$.]*)`, 'g')
      for (const m of SRC.matchAll(re))
        expect(`${fn}(${m[1]}`).toBe(`${fn}(n`)   // `n`, et rien d'autre
    }
  })

  it('le `n` de chaque site est l identifiant, jamais le nom', () => {
    const liaisons = [...SRC.matchAll(/\bconst n = ([^\n]+)/g)].map((m) => (m[1] ?? '').trim())
    expect(liaisons.length).toBeGreaterThanOrEqual(12)
    for (const liaison of liaisons) expect(liaison).toBe('dsRef.value')
  })

  it('les enfants qui appellent le serveur reçoivent l identifiant', () => {
    // DatastoreActivity → GET …/activity ; RowDrawer → GET …/rows/{id}/activity.
    const props = [...SRC.matchAll(/:datastore="([^"]+)"/g)].map((m) => m[1])
    expect(props).toHaveLength(2)
    for (const p of props) expect(p).toBe('dsRef')
  })

  it('les files de projet adressent aussi par l identifiant', () => {
    // Même défaut, autre écran. ⚠️ Ce témoin ne tient que l'ADRESSE : l'entrée était
    // encore CHOISIE par le nom, et comptait l'homonyme à soi — le choix par l'id du
    // lien est tenu, et rejoué au montage, par `filesDeProjetHomonymie.spec.ts`.
    expect(FILES_PROJET).not.toMatch(/getNamespace\w*\(\s*n\.datastore/)
    expect(FILES_PROJET).toContain('const ref = String(n.id)')
  })

  it('le NOM reste ce que l écran AFFICHE', () => {
    // Le libellé de la carte, le nom du fichier exporté, la phrase de confirmation
    // de suppression : ils portent le nom, et le correctif ne doit pas les toucher.
    expect(SRC).toContain(':title="name || \'\'"')
    expect(SRC).toContain('downloadCsv(`${nom}.csv`')
    expect(SRC).toContain('title: `delete "${nom}"?`')
  })
})
