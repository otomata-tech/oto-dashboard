// ─────────────────────────────────────────────────────────────────────────────
// La colonne d'avancement (role="status" + lifecycle) dans la VUE DU TABLEAU : barre de
// statuts, fiches, cellule de liste, filtre et chip. Le défaut : le code brut
// (`a_qualifier`, `NON_INTERESSE`) partout, sans nom de colonne ni mot sur l'étape finale.
// Les libellés doivent être LES MÊMES qu'en fiche détaillée (`etatLisible`).
// Fixture = le cycle de vie réel du tableau 139.
// ─────────────────────────────────────────────────────────────────────────────
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, nextTick, type App, type Component } from 'vue'
import { i18n } from '@/lib/i18n'
import type { DatastoreSchema } from '@/types/api'
import DatastoreStatusBar from './DatastoreStatusBar.vue'
import DatastoreCards from './DatastoreCards.vue'
import DataTable from './DataTable.vue'

const LIFECYCLE = {
  states: ['a_qualifier', 'a_contacter', 'contacte', 'interesse', 'non_interesse', 'client'],
  transitions: {
    a_qualifier: ['a_contacter', 'non_interesse'], a_contacter: ['contacte', 'non_interesse'],
    contacte: ['interesse', 'non_interesse'], interesse: ['client'],
  },
  terminal: ['client', 'non_interesse'],
}
const SCHEMA: DatastoreSchema = {
  fields: [
    { key: 'societe', role: 'title', type: 'text' },
    { key: 'statut', label: 'Statut', role: 'status', type: 'text', lifecycle: LIFECYCLE },
  ],
}
const ROWS = [{ _id: 'r1', societe: 'ACME', statut: 'non_interesse', _updated_at: '2026-09-20T10:00:00Z' }]

const apps: App[] = []
beforeEach(() => { i18n.global.locale.value = 'fr' })
afterEach(() => {
  for (const a of apps.splice(0)) a.unmount()
  document.body.textContent = ''
})
async function monter(c: Component, props: Record<string, unknown>) {
  const app = createApp(c, props)
  app.use(i18n)
  app.mount(document.body.appendChild(document.createElement('div')))
  apps.push(app)
  await nextTick()
}

describe('barre de statuts', () => {
  const props = {
    label: 'Statut', field: SCHEMA.fields![1], states: LIFECYCLE.states, terminal: LIFECYCLE.terminal,
    counts: { a_qualifier: 3, client: 1 }, active: null, total: 4,
  }

  it('nomme la colonne et chaque étape en clair', async () => {
    await monter(DatastoreStatusBar, props)
    expect(document.querySelector('.dsb-lbl')?.textContent).toBe('Statut')
    const chip = [...document.querySelectorAll<HTMLButtonElement>('.dsb-chip')].find((b) => b.textContent!.startsWith('A qualifier'))
    expect(chip?.querySelector('.dsb-n')?.textContent).toBe('3')
    expect(document.body.textContent).not.toContain('a_qualifier')
  })

  it('une étape finale est marquée, et son infobulle l’explique', async () => {
    await monter(DatastoreStatusBar, props)
    const client = [...document.querySelectorAll<HTMLButtonElement>('.dsb-chip')].find((b) => b.textContent!.includes('Client'))!
    expect(client.querySelector('.dsb-final')).not.toBeNull()
    expect(client.title).toBe('filtrer : Client — étape finale, la fiche n\'en sort plus')
    const aQualifier = [...document.querySelectorAll<HTMLButtonElement>('.dsb-chip')].find((b) => b.textContent!.includes('A qualifier'))!
    expect(aQualifier.querySelector('.dsb-final')).toBeNull()
  })
})

describe('fiches', () => {
  it('le badge d’étape dit « Non interesse », le code reste en infobulle', async () => {
    await monter(DatastoreCards, { rows: ROWS, schema: SCHEMA })
    const tag = [...document.querySelectorAll<HTMLElement>('.ds-card__head > *')].find((e) => e.textContent?.includes('Non interesse'))
    expect(tag).toBeDefined()
    expect(tag!.title).toBe('Statut · code : non_interesse')
  })
})

describe('liste', () => {
  const props = {
    rows: ROWS, total: 1, page: 0, pageSize: 25, sortField: null, sortDir: 'desc', search: '',
    filters: [{ field: 'statut', op: 'eq', value: 'non_interesse' }], schema: SCHEMA,
  }

  it('la cellule de statut affiche l’étape en clair', async () => {
    await monter(DataTable, props)
    const cellules = [...document.querySelectorAll('tbody td')].map((td) => td.textContent?.trim())
    expect(cellules).toContain('Non interesse')
    expect(cellules).not.toContain('non_interesse')
  })

  it('la chip du filtre et la liste des étapes parlent le même libellé', async () => {
    await monter(DataTable, props)
    expect(document.querySelector('.fchip')?.textContent).toContain('Statut = Non interesse')
    ;(document.querySelector('.dt-filter-toggle') as HTMLButtonElement).click()
    await nextTick()
    const th = [...document.querySelectorAll('.dt-filter-row th')]
    const choix = [...th[1]!.querySelectorAll('select.cfc-val option')].map((o) => o.textContent?.trim())
    expect(choix).toEqual(['…', 'A qualifier', 'A contacter', 'Contacte', 'Interesse', 'Non interesse', 'Client'])
  })
})

// Les libellés DÉCLARÉS au cycle de vie (`lifecycle.labels`, oto#140) : les quatre surfaces
// de la vue du tableau les prennent, et un état sans libellé garde le libellé dérivé.
describe('libellés d’étape déclarés', () => {
  const STATUT = {
    key: 'statut', label: 'Statut', role: 'status' as const, type: 'text' as const,
    lifecycle: { ...LIFECYCLE, labels: { a_qualifier: 'À qualifier', non_interesse: 'Pas intéressé' } },
  }
  const AVEC: DatastoreSchema = { fields: [SCHEMA.fields![0]!, STATUT] }

  it('la barre de statuts', async () => {
    await monter(DatastoreStatusBar, {
      label: 'Statut', field: STATUT, states: LIFECYCLE.states, terminal: LIFECYCLE.terminal,
      counts: { a_qualifier: 3 }, active: null, total: 3,
    })
    const chips = [...document.querySelectorAll<HTMLButtonElement>('.dsb-chip')].map((b) => b.textContent!)
    expect(chips.some((c) => c.startsWith('À qualifier'))).toBe(true)
    expect(chips.some((c) => c.startsWith('A contacter'))).toBe(true)   // pas de libellé : dérivé
  })

  it('le badge des fiches', async () => {
    await monter(DatastoreCards, { rows: ROWS, schema: AVEC })
    const tag = [...document.querySelectorAll<HTMLElement>('.ds-card__head > *')].find((e) => e.textContent?.includes('Pas intéressé'))
    expect(tag?.title).toBe('Statut · code : non_interesse')
  })

  it('la cellule, la chip du filtre et la liste des étapes', async () => {
    await monter(DataTable, {
      rows: ROWS, total: 1, page: 0, pageSize: 25, sortField: null, sortDir: 'desc', search: '',
      filters: [{ field: 'statut', op: 'eq', value: 'non_interesse' }], schema: AVEC,
    })
    const cellules = [...document.querySelectorAll('tbody td')].map((td) => td.textContent?.trim())
    expect(cellules).toContain('Pas intéressé')
    expect(document.querySelector('.fchip')?.textContent).toContain('Statut = Pas intéressé')
    ;(document.querySelector('.dt-filter-toggle') as HTMLButtonElement).click()
    await nextTick()
    const th = [...document.querySelectorAll('.dt-filter-row th')]
    const choix = [...th[1]!.querySelectorAll('select.cfc-val option')].map((o) => o.textContent?.trim())
    expect(choix).toEqual(['…', 'À qualifier', 'A contacter', 'Contacte', 'Interesse', 'Pas intéressé', 'Client'])
  })
})
