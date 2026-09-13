// `/procedures/:id` affiche la procédure DEMANDÉE, jamais une autre (oto#201).
//
// Le défaut : l'écran résolvait le paramètre contre SA liste (perso, org, équipe active).
// Un id absent — la procédure d'une autre équipe, ouverte depuis « Dernières
// modifications » ou un lien de projet — remplaçait l'URL par `/procedures`, et le
// `watch` sélectionnait alors la PREMIÈRE procédure de la liste. Aucun message : l'écran
// énonçait un fait faux.
//
// Le monde de ces tests est construit pour que la substitution se voie : la liste porte
// deux procédures (A, puis B), et chaque cas vérifie que le titre et le corps affichés
// sont ceux de l'id demandé — jamais ceux de A par défaut.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { i18n } from '@/lib/i18n'
import { ApiError } from '@/api'
import type { DoctrineBundle } from '@/types/api'

const api = vi.hoisted(() => ({
  getDoctrine: vi.fn(), getInstruction: vi.fn(), getInstructionVersions: vi.fn(),
  getToolRegistry: vi.fn(), getInstructionUsage: vi.fn(), getOrg: vi.fn(),
  getGuideById: vi.fn(),
}))
vi.mock('@/api/console', () => api)
vi.mock('@/composables/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }))

// Le corps rendu est la preuve de QUELLE procédure est ouverte : le bouchon l'écrit tel quel.
vi.mock('@/components/console/doctrine/DoctrineContent.vue', () => ({
  default: defineComponent({
    props: { text: { type: String, default: '' } },
    render() { return h('div', { class: 'corps' }, this.text) },
  }),
}))
// Les cartes voisines chargent leurs propres données : hors sujet ici.
const bouchon = vi.hoisted(() => async () => {
  const { defineComponent: dc, h: hh } = await import('vue')
  return { default: dc({ render: () => hh('div') }) }
})
vi.mock('@/components/console/doctrine/ReferencedTools.vue', bouchon)
vi.mock('@/components/console/doctrine/UsageCard.vue', bouchon)
vi.mock('@/components/console/RunnerTriggersCard.vue', bouchon)
vi.mock('@/components/console/SharePrincipalDialog.vue', bouchon)
const Vide = defineComponent({ render: () => h('div') })

const A = { id: 11, slug: 'proc-a', title: 'Procédure A', description: 'résumé A', version: 2, updated_at: null }
const B = { id: 12, slug: 'proc-b', title: 'Procédure B', description: 'résumé B', version: 1, updated_at: null }
const LISTE: DoctrineBundle = {
  org_id: 42, org_name: 'Acme', can_edit: false,
  doctrine: { exists: false, version: 0, updated_at: null },
  instructions: [A, B],
}
const CORPS: Record<string, string> = { 'proc-a': 'corps de A', 'proc-b': 'corps de B' }

// Une procédure d'une AUTRE équipe, telle que `GET /api/me/guides/{guide_id}` la sert
// (oto-backend `_instructions_get`, forme « guide_id fourni »).
const HORS_LISTE = {
  org_id: 42, group_id: null, guide_id: 344, doctrine_id: 344, scope: 'group',
  slug: 'proc-equipe-b', title: "Procédure de l'équipe B", description: 'résumé équipe B',
  version: 3, body_md: "corps de l'équipe B", slots: [], archived_at: null,
}

async function settle() {
  for (let i = 0; i < 10; i++) await nextTick()
  await new Promise((r) => setTimeout(r, 20))
  for (let i = 0; i < 10; i++) await nextTick()
}

async function monter(chemin: string): Promise<{ host: HTMLElement; router: Router; unmount: () => void }> {
  const View = (await import('./DoctrineView.vue')).default
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/procedures', component: Vide },
      { path: '/procedures/:id', component: Vide },
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

const texte = (host: HTMLElement, sel: string) => host.querySelector(sel)?.textContent?.trim() ?? null
const titre = (host: HTMLElement) => texte(host, '.hdr__title')
const corps = (host: HTMLElement) => texte(host, '.corps')

beforeEach(() => {
  vi.clearAllMocks()
  i18n.global.locale.value = 'fr'
  api.getDoctrine.mockResolvedValue(LISTE)
  api.getToolRegistry.mockResolvedValue({ tools: [], count: 0 })
  api.getOrg.mockResolvedValue({ members: [] })
  api.getInstruction.mockImplementation(async (slug: string) => {
    const d = [A, B].find((x) => x.slug === slug)
    if (!d) throw new ApiError(404, 'unknown_guide')
    return { ...d, body_md: CORPS[slug], set_by: null, created_at: null }
  })
  api.getInstructionVersions.mockResolvedValue({ versions: [] })
  api.getInstructionUsage.mockResolvedValue({ count: 0, series: [] })
})

describe('/procedures/:id hors de la liste chargée', () => {
  it('affiche la procédure demandée, lue par son id, et non la première de la liste', async () => {
    api.getGuideById.mockResolvedValue(HORS_LISTE)
    const { host, router, unmount } = await monter('/procedures/344')

    expect(titre(host)).toBe("Procédure de l'équipe B")
    expect(corps(host)).toBe("corps de l'équipe B")
    expect(api.getGuideById).toHaveBeenCalledWith(344)
    // L'adresse reste celle qui a été demandée : aucune réécriture vers la route nue.
    expect(router.currentRoute.value.fullPath).toBe('/procedures/344')
    // La liste de droite reste affichée (A et B y figurent), mais aucune ligne n'y est
    // marquée ouverte : la procédure ouverte n'en fait pas partie.
    expect(host.querySelectorAll('.docrow.on')).toHaveLength(0)
    expect(host.textContent).not.toContain('corps de A')
    // Aucun appel indexé par slug pour une procédure qui n'est pas dans le palier
    // actif : le slug y résoudrait un homonyme, ou rien.
    expect(api.getInstruction).not.toHaveBeenCalled()
    expect(api.getInstructionVersions).not.toHaveBeenCalled()
    expect(api.getInstructionUsage).not.toHaveBeenCalled()
    // Aucun compteur « chargée 0× » : rien n'a été mesuré pour elle.
    expect(host.textContent).not.toContain('chargée')
    unmount()
  })

  it('une réponse pour un AUTRE id que celui demandé est un refus, pas une procédure', async () => {
    api.getGuideById.mockResolvedValue({ ...HORS_LISTE, guide_id: 999, doctrine_id: 999 })
    const { host, unmount } = await monter('/procedures/344')

    expect(texte(host, '.target-refusal')).toContain('#344')
    expect(titre(host)).toBeNull()
    expect(corps(host)).toBeNull()
    unmount()
  })

  it.each([
    [403, 'forbidden', 'Accès refusé à ce guide.'],
    [404, 'unknown_guide', 'Aucun guide #344.'],
    [500, 'internal_error', undefined],
  ])('un refus %i du serveur s\'affiche avec son code, sans aucune procédure à la place', async (status, code, detail) => {
    api.getGuideById.mockRejectedValue(new ApiError(status, code, detail))
    const { host, router, unmount } = await monter('/procedures/344')

    const refus = texte(host, '.target-refusal')
    expect(refus).toContain('#344')
    expect(refus).toContain(`${status} ${code}`)
    if (detail) expect(refus).toContain(detail)
    expect(titre(host)).toBeNull()
    expect(corps(host)).toBeNull()
    expect(host.textContent).not.toContain('corps de A')
    expect(router.currentRoute.value.fullPath).toBe('/procedures/344')
    unmount()
  })

  it('un slug absent de la liste ne retombe pas sur la première procédure', async () => {
    const { host, router, unmount } = await monter('/procedures/proc-inconnue')

    expect(texte(host, '.target-refusal')).toContain('proc-inconnue')
    expect(titre(host)).toBeNull()
    expect(host.textContent).not.toContain('corps de A')
    expect(router.currentRoute.value.fullPath).toBe('/procedures/proc-inconnue')
    expect(api.getGuideById).not.toHaveBeenCalled()
    unmount()
  })
})

describe('/procedures/:id dans la liste, et /procedures sans id', () => {
  it('un id de la liste ouvre CETTE procédure (la liste sert de cache), pas la première', async () => {
    const { host, router, unmount } = await monter('/procedures/12')

    expect(titre(host)).toBe('Procédure B')
    expect(corps(host)).toBe('corps de B')
    expect(router.currentRoute.value.fullPath).toBe('/procedures/12')
    expect(api.getGuideById).not.toHaveBeenCalled()
    unmount()
  })

  it('un slug de la liste est normalisé vers son id', async () => {
    const { host, router, unmount } = await monter('/procedures/proc-b')

    expect(titre(host)).toBe('Procédure B')
    expect(router.currentRoute.value.fullPath).toBe('/procedures/12')
    unmount()
  })

  it("l'entrée du menu, sans id, ouvre la première procédure (choix conservé)", async () => {
    const { host, router, unmount } = await monter('/procedures')

    expect(titre(host)).toBe('Procédure A')
    expect(corps(host)).toBe('corps de A')
    expect(router.currentRoute.value.fullPath).toBe('/procedures/11')
    unmount()
  })

  it('passer d\'une procédure listée à un id hors liste change bien de procédure', async () => {
    api.getGuideById.mockResolvedValue(HORS_LISTE)
    const { host, router, unmount } = await monter('/procedures/11')
    expect(titre(host)).toBe('Procédure A')

    await router.push('/procedures/344')
    await settle()
    expect(titre(host)).toBe("Procédure de l'équipe B")
    expect(corps(host)).toBe("corps de l'équipe B")
    expect(router.currentRoute.value.fullPath).toBe('/procedures/344')
    unmount()
  })
})
