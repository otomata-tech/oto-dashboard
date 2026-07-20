// Régression : le parent (ProjectDetailView) monte ce composant avec `v-if="addKind"`
// donc il naît déjà `open=true` (jamais togglé sur une instance existante). Un
// `watch(() => props.open, …)` SANS `immediate: true` ne voit alors jamais la
// transition false→true et `loadOptions()` n'est jamais appelé — liste d'options
// vide silencieuse (« aucune entité de ce type »), quel que soit le kind, AUCUN
// appel réseau. Verrouille : loadOptions() tourne dès le montage, sans dépendre
// d'un toggle ultérieur de `open`.
import { describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import EntityPickerDialog from './EntityPickerDialog.vue'

const getDoctrine = vi.fn(async () => ({
  org_id: 1, org_name: 'Partoo', can_edit: true,
  doctrine: { exists: true, version: 1, updated_at: null },
  instructions: [{ id: 120, slug: 'partoo-prospection-folk', title: 'Partoo Prospection → folk', description: '', version: 4 }],
}))

vi.mock('@/api/console', () => ({
  linkProject: vi.fn(),
  createDoc: vi.fn(),
  uploadProjectFile: vi.fn(),
  getNamespaces: vi.fn(async () => ({ namespaces: [] })),
  getConnectors: vi.fn(async () => ({ connectors: [] })),
  getDoctrine: () => getDoctrine(),
  getKbProject: vi.fn(),
  listDocs: vi.fn(),
  getConnectorIdentities: vi.fn(),
}))

async function mountPicker(kind: 'connecteur' | 'tableau' | 'procedure' | 'doc' | 'page' | 'file') {
  const host = document.createElement('div')
  document.body.appendChild(host)
  // Reproduit EXACTEMENT le patron du parent : le composant naît avec open déjà
  // `true` (pas de toggle sur une instance existante — `v-if="addKind"` monte/démonte).
  const app = createApp(EntityPickerDialog, { open: true, kind, projectId: 1 })
  app.mount(host)
  await nextTick()
  await nextTick()  // laisse la promesse de loadOptions() se résoudre
  return { unmount: () => { app.unmount(); host.remove() } }
}

describe('EntityPickerDialog', () => {
  it('charge les options DÈS LE MONTAGE (pas seulement sur un toggle ultérieur de `open`)', async () => {
    const { unmount } = await mountPicker('procedure')
    expect(getDoctrine).toHaveBeenCalledTimes(1)
    // Teleporté sur document.body (pas dans `host`).
    expect(document.body.querySelector('.ep__rowname')?.textContent).toBe('Partoo Prospection → folk')
    expect(document.body.textContent).not.toContain('aucune entité de ce type')
    unmount()
  })
})
