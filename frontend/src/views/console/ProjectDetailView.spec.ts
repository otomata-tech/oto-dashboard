// `/projects/:id` n'affiche que ce que l'adresse demande (oto#203) — même famille qu'oto#201.
//
// Trois défauts lus dans le code avant ce banc :
//  - `?doc=<id inconnu>` : `selItem` retombait sur le premier item du rail, l'accueil — le
//    brief du projet s'affichait sous une adresse qui désigne une page ;
//  - `/data/<nsRef inconnu>` au montage : même repli, le brief ;
//  - `/data/<nsRef inconnu>` en navigation : `selectFromRoute` ne touchait pas `sel`, le
//    tableau PRÉCÉDENT restait affiché sous la nouvelle adresse.
//
// Le monde est construit pour que la substitution se voie : le bouchon du viewer écrit la
// clé et le libellé de l'item qu'il reçoit, et le brief, c'est l'item `home`.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { i18n } from '@/lib/i18n'
import { ApiError } from '@/api'
import type { ProjectLink } from '@/types/api'

const api = vi.hoisted(() => ({
  getProject: vi.fn(), updateProject: vi.fn(), archiveProject: vi.fn(), copyProject: vi.fn(),
  setProjectTemplate: vi.fn(), projectHandoff: vi.fn(), getProjectActivity: vi.fn(),
  getResource: vi.fn(), listProjectFiles: vi.fn(), listDocs: vi.fn(), getProjectInventory: vi.fn(),
  getProjectRuns: vi.fn(), moveDoc: vi.fn(), createDoc: vi.fn(), getDoc: vi.fn(),
}))
vi.mock('@/api/console', () => api)
vi.mock('@/composables/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
const me = ref({ sub: 'u-alexis', active_org: 42, active_org_name: 'Acme' })
vi.mock('@/composables/useMe', () => ({ useMe: () => ({ me }) }))

// Le viewer écrit l'item reçu (`<clé>|<libellé>`) : c'est la preuve de CE qui est affiché.
// Ses deux boutons rejouent les événements qu'il émet vers la page.
vi.mock('@/components/console/project/ProjectViewer.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      props: { item: { type: Object, default: null } },
      emits: ['open-doc', 'reload-docs'],
      render() {
        const it = this.item as { key: string; label: string } | null
        return h('div', { class: 'viewer' }, [
          h('span', { class: 'viewer__item' }, it ? `${it.key}|${it.label}` : 'rien'),
          h('button', { class: 'viewer__backlink6', onClick: () => this.$emit('open-doc', 6) }),
          h('button', { class: 'viewer__reloaddocs', onClick: () => this.$emit('reload-docs') }),
        ])
      },
    }),
  }
})
// Le rail rend un bouton par item : un clic rejoue la sélection telle que la page la reçoit.
vi.mock('@/components/console/project/ProjectRail.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      props: { sel: { type: String, default: '' }, groups: { type: Array, default: () => [] } },
      emits: ['select'],
      render() {
        const items = (this.groups as { items: { key: string }[] }[]).flatMap((g) => g.items)
        return h('div', { class: 'rail', 'data-sel': this.sel }, items.map((it) =>
          h('button', { class: 'rail__item', 'data-key': it.key, onClick: () => this.$emit('select', it) })))
      },
    }),
  }
})
vi.mock('@/components/console/TopbarPage.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return { default: defineComponent({ render() { return h('div', this.$slots.default?.()) } }) }
})
const bouchon = vi.hoisted(() => async () => {
  const { defineComponent, h } = await import('vue')
  return { default: defineComponent({ render: () => h('div') }) }
})
vi.mock('@/components/console/EmojiPicker.vue', bouchon)
vi.mock('@/components/console/NameDialog.vue', bouchon)
vi.mock('@/components/console/project/ProjectShareDialog.vue', bouchon)
vi.mock('@/components/console/project/ProjectHistoryDrawer.vue', bouchon)
vi.mock('@/components/console/project/EntityPickerDialog.vue', bouchon)

const lien = (over: Partial<ProjectLink>): ProjectLink =>
  ({ target_type: 'tableau', target_ref: '41', datastore: 'clients', datastore_id: 41, ...over })
const LIENS: ProjectLink[] = [
  lien({}),
  lien({ target_ref: 'prospects', datastore: 'prospects', datastore_id: 52 }),
  { target_type: 'connecteur', target_ref: 'sirene' },
]
const projet = (links: ProjectLink[]) => ({
  id: 7, name: 'Projet Alpha', brief_md: 'BRIEF ALPHA', can_write: true, is_template: false,
  icon: null, links, excluded_url_prefixes: [],
})
const page = (id: number, title: string, project_id = 7) =>
  ({ id, project_id, parent_id: null, title, body_md: `corps ${id}`, kind: 'doc' })
const PAGES = [page(5, 'Page cinq'), page(6, 'Page six')]

async function settle() {
  for (let i = 0; i < 10; i++) await nextTick()
  await new Promise((r) => setTimeout(r, 20))
  for (let i = 0; i < 10; i++) await nextTick()
}

async function monter(chemin: string): Promise<{ host: HTMLElement; router: Router; unmount: () => void }> {
  const View = (await import('./ProjectDetailView.vue')).default
  const Vide = { render: () => null }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/projects/:id', component: Vide },
      { path: '/projects/:id/data/:nsRef', component: Vide },
      { path: '/:autre(.*)*', component: Vide },
    ],
  })
  await router.push(chemin)
  await router.isReady()
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(View)
  app.use(router)
  app.use(i18n)
  app.mount(host)
  await settle()
  return { host, router, unmount: () => { app.unmount(); host.remove() } }
}

const affiche = (host: HTMLElement) => host.querySelector('.viewer__item')?.textContent ?? null
const refus = (host: HTMLElement) =>
  host.querySelector('.target-refusal')?.textContent?.replace(/\s+/g, ' ').trim() ?? null
const choix = (host: HTMLElement) =>
  [...host.querySelectorAll('.target-refusal a')].map((a) => a.getAttribute('href'))
const selRail = (host: HTMLElement) => host.querySelector('.rail')?.getAttribute('data-sel') ?? null

beforeEach(() => {
  vi.clearAllMocks()
  i18n.global.locale.value = 'fr'
  api.getProject.mockResolvedValue(projet(LIENS))
  api.getResource.mockResolvedValue({ grants: [] })
  api.getProjectActivity.mockResolvedValue({ activity: [] })
  api.listProjectFiles.mockResolvedValue({ files: [] })
  api.listDocs.mockResolvedValue({ project_id: 7, docs: PAGES })
  api.getProjectInventory.mockResolvedValue({ audit: null, connector_sources: {} })
  api.getProjectRuns.mockResolvedValue({ runs: [] })
  api.getDoc.mockRejectedValue(new ApiError(404, 'unknown_doc', 'Aucune page #999.'))
})

describe('/projects/:id?doc= — la page demandée, jamais le brief à sa place', () => {
  it('un id absent du projet : le refus du serveur s\'affiche avec son code, et le brief ne s\'affiche pas', async () => {
    const { host, router, unmount } = await monter('/projects/7?doc=999')

    expect(affiche(host)).toBeNull()
    expect(host.textContent).not.toContain('Accueil · Brief')
    expect(api.getDoc).toHaveBeenCalledWith(999)
    expect(refus(host)).toContain('#999')
    expect(refus(host)).toContain('404 unknown_doc')
    expect(refus(host)).toContain('Aucune page #999.')
    expect(selRail(host)).not.toBe('home')
    expect(router.currentRoute.value.fullPath).toBe('/projects/7?doc=999')
    unmount()
  })

  it('une page d\'un AUTRE projet ne s\'affiche pas ici : l\'écran le dit et mène à son projet', async () => {
    api.getDoc.mockResolvedValue(page(999, 'Page ailleurs', 9))
    const { host, unmount } = await monter('/projects/7?doc=999')

    expect(affiche(host)).toBeNull()
    expect(refus(host)).toContain('#999')
    expect(host.textContent).not.toContain('Page ailleurs')
    expect(choix(host)).toEqual(['/projects/9?doc=999'])
    unmount()
  })

  it('une page du projet absente de la liste chargée s\'affiche, lue par son id', async () => {
    api.getDoc.mockResolvedValue(page(8, 'Page huit'))
    const { host, unmount } = await monter('/projects/7?doc=8')

    expect(affiche(host)).toBe('doc:8|Page huit')
    expect(refus(host)).toBeNull()
    unmount()
  })

  it('une réponse pour un AUTRE id que celui demandé est un refus, pas une page', async () => {
    api.getDoc.mockResolvedValue(page(1000, 'Page mille'))
    const { host, unmount } = await monter('/projects/7?doc=999')

    expect(affiche(host)).toBeNull()
    expect(refus(host)).toContain('#999')
    expect(host.textContent).not.toContain('Page mille')
    unmount()
  })

  it('une adresse qui n\'est pas un id ne part pas au serveur et ne retombe pas sur le brief', async () => {
    const { host, unmount } = await monter('/projects/7?doc=abc')

    expect(affiche(host)).toBeNull()
    expect(refus(host)).toContain('abc')
    expect(api.getDoc).not.toHaveBeenCalled()
    unmount()
  })

  it('passer d\'une page à un id inconnu ne garde pas la page précédente', async () => {
    const { host, router, unmount } = await monter('/projects/7?doc=5')
    expect(affiche(host)).toBe('doc:5|Page cinq')

    await router.push('/projects/7?doc=999')
    await settle()
    expect(affiche(host)).toBeNull()
    expect(refus(host)).toContain('#999')
    unmount()
  })

  it('une page listée s\'ouvre depuis la liste, sans lecture par id ; l\'adresse nue ouvre l\'accueil', async () => {
    const listee = await monter('/projects/7?doc=6')
    expect(affiche(listee.host)).toBe('doc:6|Page six')
    expect(api.getDoc).not.toHaveBeenCalled()
    listee.unmount()
    const nu = await monter('/projects/7')
    expect(affiche(nu.host)).toBe('home|Accueil · Brief')
    expect(refus(nu.host)).toBeNull()
    nu.unmount()
  })
})

describe('/projects/:id/data/:nsRef — le tableau lié demandé, jamais un autre', () => {
  it('au montage, un tableau non lié s\'affiche comme introuvable, pas le brief', async () => {
    const { host, router, unmount } = await monter('/projects/7/data/inconnu')

    expect(affiche(host)).toBeNull()
    expect(refus(host)).toContain('inconnu')
    expect(selRail(host)).not.toBe('home')
    expect(router.currentRoute.value.fullPath).toBe('/projects/7/data/inconnu')
    unmount()
  })

  it('en navigation, le tableau précédent ne reste pas affiché sous la nouvelle adresse', async () => {
    const { host, router, unmount } = await monter('/projects/7/data/41')
    expect(affiche(host)).toBe('link:tableau:41||clients')

    await router.push('/projects/7/data/inconnu')
    await settle()
    expect(affiche(host)).toBeNull()
    expect(refus(host)).toContain('inconnu')
    unmount()
  })

  it('un nom porté par deux tableaux liés ne choisit pas : les candidats sont listés, par leur lien', async () => {
    api.getProject.mockResolvedValue(projet([lien({}), lien({ target_ref: '77', datastore_id: 77 })]))
    const { host, router, unmount } = await monter('/projects/7/data/clients')

    expect(affiche(host)).toBeNull()
    expect(refus(host)).toContain('clients')
    expect(choix(host)).toEqual(['/projects/7/data/41', '/projects/7/data/77'])
    expect(router.currentRoute.value.fullPath).toBe('/projects/7/data/clients')
    unmount()
  })

  it('un tableau lié s\'ouvre par son lien, et par son nom quand il est seul à le porter', async () => {
    const parLien = await monter('/projects/7/data/prospects')
    expect(affiche(parLien.host)).toBe('link:tableau:prospects||prospects')
    parLien.unmount()
    const parNom = await monter('/projects/7/data/clients')
    expect(affiche(parNom.host)).toBe('link:tableau:41||clients')
    parNom.unmount()
  })
})

describe('ce que la page ouvre d\'elle-même porte sa propre adresse', () => {
  it('un backlink ouvert depuis un tableau change l\'adresse : la page ne s\'affiche pas sous celle du tableau', async () => {
    const { host, router, unmount } = await monter('/projects/7/data/41')
    host.querySelector<HTMLButtonElement>('.viewer__backlink6')!.click()
    await settle()

    expect(affiche(host)).toBe('doc:6|Page six')
    expect(router.currentRoute.value.fullPath).toBe('/projects/7?doc=6')
    unmount()
  })

  it('une page choisie dans le rail depuis un tableau s\'ouvre à sa propre adresse', async () => {
    const { host, router, unmount } = await monter('/projects/7/data/41')
    host.querySelector<HTMLButtonElement>('[data-key="doc:6"]')!.click()
    await settle()

    expect(affiche(host)).toBe('doc:6|Page six')
    expect(router.currentRoute.value.fullPath).toBe('/projects/7?doc=6')
    unmount()
  })

  it('un connecteur choisi depuis une page quitte l\'adresse de la page', async () => {
    const { host, router, unmount } = await monter('/projects/7?doc=5')
    host.querySelector<HTMLButtonElement>('[data-key="link:connecteur:sirene|"]')!.click()
    await settle()

    expect(affiche(host)).toBe('link:connecteur:sirene||sirene')
    expect(router.currentRoute.value.fullPath).toBe('/projects/7')
    unmount()
  })

  it('depuis une adresse introuvable, une page choisie dans le rail s\'ouvre', async () => {
    const { host, router, unmount } = await monter('/projects/7?doc=999')
    host.querySelector<HTMLButtonElement>('[data-key="doc:5"]')!.click()
    await settle()

    expect(affiche(host)).toBe('doc:5|Page cinq')
    expect(refus(host)).toBeNull()
    expect(router.currentRoute.value.fullPath).toBe('/projects/7?doc=5')
    unmount()
  })

  it('la page affichée supprimée : l\'adresse la quitte avant que l\'accueil ne s\'affiche', async () => {
    const { host, router, unmount } = await monter('/projects/7?doc=5')
    api.listDocs.mockResolvedValue({ project_id: 7, docs: [page(6, 'Page six')] })
    host.querySelector<HTMLButtonElement>('.viewer__reloaddocs')!.click()
    await settle()

    expect(affiche(host)).toBe('home|Accueil · Brief')
    expect(router.currentRoute.value.fullPath).toBe('/projects/7')
    unmount()
  })
})
