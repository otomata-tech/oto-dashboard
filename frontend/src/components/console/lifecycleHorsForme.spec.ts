// ─────────────────────────────────────────────────────────────────────────────
// Un cycle de vie dont les transitions sont HORS FORME (oto#63) : `{"echec": "a_traiter"}`
// — une chaîne là où le contrat dit une liste. Le serveur l'acceptait à la pose ; il le
// refuse depuis, mais un schéma stocké avant peut encore le porter.
//
// Le défaut : `.map` sur cette chaîne, dans un `computed`. La vue fiches précalcule le
// verdict d'abandon de CHAQUE ligne : une seule ligne abandonnée dans un tel état, et la
// grille entière cessait de se rendre — un tableau sain côté API qui « charge » sans fin.
// La fiche détaillée levait de même dès qu'elle s'ouvrait sur cet état.
//
// Ce banc monte les vrais composants et juge deux choses : rien ne lève, et l'écran DIT
// la faute avec la forme attendue — il ne la devine pas, il ne tourne pas en rond.
// ─────────────────────────────────────────────────────────────────────────────
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App, type Component } from 'vue'
import { i18n } from '@/lib/i18n'
import type { DatastoreLifecycle, DatastoreSchema } from '@/types/api'

vi.mock('@/composables/useAuth', () => ({ useAuth: () => ({ getAccessToken: async () => 'jeton-de-banc' }) }))
vi.mock('@/lib/busy', () => ({ beginBusy: () => {}, endBusy: () => {} }))

import DatastoreCards from './DatastoreCards.vue'
import LifecycleFault from './LifecycleFault.vue'
import RowAbandonNotice from './RowAbandonNotice.vue'
import RowDrawer from './RowDrawer.vue'

// Forcé hors du type : c'est précisément ce que le type promettait de ne jamais servir.
const HORS_FORME = {
  states: ['a_traiter', 'traite', 'echec'],
  transitions: { a_traiter: ['traite', 'echec'], echec: 'a_traiter' },
  terminal: ['traite'],
  max_claims: 3,
  abandon_state: 'echec',
} as unknown as DatastoreLifecycle
const SCHEMA: DatastoreSchema = {
  fields: [
    { key: 'societe', role: 'title', type: 'text' },
    { key: 'statut', label: 'Statut', role: 'status', type: 'text', lifecycle: HORS_FORME },
  ],
}
const ABANDONNEE = {
  _id: 'r1', societe: 'ACME', statut: 'echec',
  _abandon: 'abandonnée après 3 réservations sans écriture, plafond 3',
}
const ATTENDU = '"echec": "a_traiter" → attendu {"echec":["a_traiter"]}'

const apps: App[] = []
let erreurs: unknown[] = []
beforeEach(() => {
  i18n.global.locale.value = 'fr'
  erreurs = []
  // La relecture de la fiche reste en suspens : ce banc juge le RENDU, pas l'édition.
  vi.stubGlobal('fetch', () => new Promise(() => {}))
})
afterEach(() => {
  for (const a of apps.splice(0)) a.unmount()
  document.body.textContent = ''
  vi.unstubAllGlobals()
})
async function monter(c: Component, props: Record<string, unknown>) {
  const app = createApp(c, props)
  app.config.errorHandler = (e) => { erreurs.push(e) }
  app.component('RouterLink', { template: '<a><slot /></a>' })
  app.use(i18n)
  app.mount(document.body.appendChild(document.createElement('div')))
  apps.push(app)
  for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 0)); await nextTick() }
}

describe('cycle de vie hors forme (oto#63)', () => {
  it('la vue fiches se rend, ligne abandonnée comprise — rien ne lève', async () => {
    await monter(DatastoreCards, { rows: [ABANDONNEE], schema: SCHEMA })
    expect(erreurs).toEqual([])
    expect(document.body.textContent).toContain('ACME')
    expect(document.body.textContent).toContain(ABANDONNEE._abandon)
  })

  it('la fiche s’ouvre sur l’état fautif et DIT la faute, avec la forme attendue', async () => {
    await monter(RowDrawer, {
      open: true, row: ABANDONNEE, fields: [], isNew: false, readOnly: false, schema: SCHEMA, datastore: '77',
    })
    expect(erreurs).toEqual([])
    const alerte = document.body.querySelector('[data-lifecycle-fault]')
    expect(alerte?.getAttribute('role')).toBe('alert')
    expect(alerte?.textContent).toContain('Cycle de vie de « Statut » mal formé')
    expect(alerte?.textContent).toContain(ATTENDU)
    // aucune transition inventée depuis l'état fautif
    expect(document.body.querySelectorAll('[data-lifecycle] [data-state]')).toHaveLength(0)
    // le bandeau d'abandon ne conclut pas « aucun retour » sur une forme qu'il ne lit pas
    expect(document.body.textContent).not.toContain('aucun retour depuis cet état')
  })

  it('l’alerte ne s’affiche pas sur un cycle de vie bien formé', async () => {
    await monter(LifecycleFault, { lifecycle: { ...HORS_FORME, transitions: { echec: ['a_traiter'] } }, column: 'Statut' })
    expect(document.body.querySelector('[data-lifecycle-fault]')).toBeNull()
  })

  it('le bandeau d’abandon garde « aucun retour » quand la forme est juste', async () => {
    await monter(RowAbandonNotice, { verdict: { reason: 'x', reopens: [], malforme: false }, canWrite: true })
    expect(document.body.textContent).toContain('aucun retour depuis cet état')
  })
})
