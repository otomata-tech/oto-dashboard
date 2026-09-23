// Arbre d'un projet dans la barre latérale (23/09/2026, repris du rail d'oto-frontend) :
// il descend aux pages et aux tableaux, crée une page et en renomme une — seulement quand
// le lecteur peut écrire. Il prévient l'écran projet par `docsSignal`.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const api = vi.hoisted(() => ({
  listDocs: vi.fn(async () => ({ project_id: 5, docs: [
    { id: 11, project_id: 5, parent_id: null, title: 'Brief client', position: 1, body_md: '', kind: 'doc' },
    { id: 12, project_id: 5, parent_id: 11, title: 'Annexe', position: 1, body_md: '', kind: 'doc' },
  ] })),
  getProject: vi.fn(async () => ({ id: 5, links: [{ target_type: 'tableau', target_ref: '77', label: 'Leads' }] })),
  createDoc: vi.fn(async () => ({ id: 13 })),
  updateDoc: vi.fn(async () => ({})),
}))
vi.mock('@/api/console', () => api)

import SidebarProjectTree from './SidebarProjectTree.vue'
import { useMe } from '@/composables/useMe'
import { docsVersion } from '@/lib/docsSignal'
import type { Me } from '@/types/api'

async function monter(project: Record<string, unknown>) {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/', component: { render: () => null } },
    { path: '/projects/:id', component: { render: () => null }, meta: { detail: 'project' } },
  ] })
  await router.push('/'); await router.isReady()
  const host = document.createElement('div')
  const app = createApp({ render: () => h(SidebarProjectTree as never, { project, color: 'red', active: true }) })
  app.use(router).mount(host)
  for (let i = 0; i < 5; i++) { await new Promise((r) => setTimeout(r, 0)); await nextTick() }
  return { host, app, router }
}

describe('SidebarProjectTree', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useMe().me.value = { sub: 'u', active_org: 1 } as unknown as Me
  })

  it('déplie le projet actif jusqu’à ses pages, sous-pages comprises, et ses tableaux', async () => {
    const { host, app } = await monter({ id: 5, name: 'Chiffrage', can_write: true })
    const texte = host.textContent ?? ''
    expect(texte).toContain('Brief client')
    expect(texte).toContain('Annexe')
    expect(texte).toContain('Leads')
    const liens = [...host.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(liens).toContain('/projects/5?doc=12')
    expect(liens).toContain('/projects/5/data/77')
    app.unmount()
  })

  it('« + » crée une page, prévient l’écran projet et l’ouvre', async () => {
    const { host, app, router } = await monter({ id: 5, name: 'Chiffrage', can_write: true })
    const avant = docsVersion(5)
    host.querySelector<HTMLButtonElement>('button[title="nouvelle page"]')!.click()
    for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 0)); await nextTick() }
    expect(api.createDoc).toHaveBeenCalledWith(5, 'Sans titre')
    expect(docsVersion(5)).toBe(avant + 1)
    expect(router.currentRoute.value.fullPath).toBe('/projects/5?doc=13')
    app.unmount()
  })

  it('projet en lecture : ni création ni renommage offerts', async () => {
    const { host, app } = await monter({ id: 5, name: 'Chiffrage', can_write: false })
    expect(host.querySelector('button[title="nouvelle page"]')).toBeNull()
    expect(host.querySelector('button[title="renommer"]')).toBeNull()
    app.unmount()
  })

  it('en consultation : ni création ni renommage, même sur un projet en écriture', async () => {
    useMe().me.value = { sub: 'u', active_org: 1, active_org_readonly: true } as unknown as Me
    const { host, app } = await monter({ id: 5, name: 'Chiffrage', can_write: true })
    expect(host.querySelector('button[title="nouvelle page"]')).toBeNull()
    app.unmount()
  })
})
