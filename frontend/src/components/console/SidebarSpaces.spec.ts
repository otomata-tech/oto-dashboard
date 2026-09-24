// Le défaut réparé est une COURSE, pas un calcul : la sidebar lisait `me.active_org`
// une seule fois, à son montage — or `me` arrive d'un `GET /api/me` encore en vol.
// `org` valait donc `null`, `listGroups` n'était jamais appelé, et chaque espace
// d'équipe s'affichait « Équipe » au lieu de son nom, définitivement (rien ne
// relançait la lecture). Le test monte le composant AVANT que `me` soit là, puis
// remplit `me` : c'est cette séquence, et elle seule, qui attrape le défaut.
import { i18n } from '@/lib/i18n'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createApp, nextTick, ref } from 'vue'

/** Laisse les promesses de chargement se résoudre ET le rendu se recalculer. */
const vider = async () => {
  for (let i = 0; i < 5; i++) { await new Promise((r) => setTimeout(r, 0)); await nextTick() }
}
import SidebarSpaces from './SidebarSpaces.vue'

const me = ref<{ active_org: number | null; sub?: string; active_org_name?: string } | null>(null)

vi.mock('@/composables/useMe', () => ({ useMe: () => ({ me }), canWriteInOrg: () => true }))
vi.mock('@/composables/useNav', () => ({ useNav: () => ({ closeNav: () => {} }) }))
vi.mock('@/composables/useScopedLink', () => ({
  useScopedLink: () => ({ scoped: (p: string) => p }),
}))
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/overview', params: {}, query: {}, meta: {} }),
  useRouter: () => ({ push: async () => {} }),
  RouterLink: { template: '<a><slot /></a>' },
}))
const PROJETS = vi.hoisted(() => ({ liste: [{ id: 1, name: 'Prospection', owner_type: 'group', owner_id: 9 }] as unknown[] }))
vi.mock('@/api/console', () => ({
  listProjects: vi.fn(async () => ({ projects: PROJETS.liste })),
  listGroups: vi.fn(async () => ({ groups: [{ id: 9, group_id: 9, name: 'Commerciale' }] })),
}))

import { listGroups } from '@/api/console'

async function monter() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  i18n.global.locale.value = 'fr'
  createApp(SidebarSpaces).use(i18n).mount(host)
  await vider()
  return host
}

describe('SidebarSpaces — les noms d équipes suivent `me`', () => {
  beforeEach(() => { me.value = null; vi.mocked(listGroups).mockClear() })

  it('nomme l espace quand `me` arrive APRÈS le montage', async () => {
    const host = await monter()
    expect(listGroups).not.toHaveBeenCalled()   // rien à demander tant qu'on n'a pas d'org

    me.value = { active_org: 2 }                 // le profil arrive enfin
    await vider()

    expect(listGroups).toHaveBeenCalledWith(2)
    expect(host.textContent).toContain('Commerciale')
    expect(host.textContent).not.toContain('Équipe')
  })

  it('nomme aussi l espace quand `me` est DÉJÀ chargé au montage', async () => {
    me.value = { active_org: 2 }
    const host = await monter()
    expect(listGroups).toHaveBeenCalledWith(2)
    expect(host.textContent).toContain('Commerciale')
  })
})

// Le rangement suit la règle de l'index `/projects` (`projectBucket`) : la barre rangeait
// sous « Mes projets » les projets de l'org avec les projets personnels, et sous
// « Partagés » ceux que l'org partage VERS d'autres — vu le 24/09 (23 « à moi » au lieu de 5).
describe('SidebarSpaces — à qui appartient chaque projet', () => {
  beforeEach(() => {
    me.value = { active_org: 2, sub: 'u1', active_org_name: 'Otomata Admin' }
    PROJETS.liste = [
      { id: 10, name: 'Perso', owner_type: 'user', owner_id: 'u1' },
      { id: 11, name: 'De l’org', owner_type: 'org', owner_id: '2' },
      { id: 12, name: 'De l’org, partagé vers d’autres', owner_type: 'org', owner_id: '2', shared: true },
      { id: 13, name: 'Reçu d’une autre org', owner_type: 'org', owner_id: '7' },
    ]
  })

  it('personnel, organisation et reçus : trois espaces, chacun son compte', async () => {
    const host = await monter()
    const tetes = [...host.querySelectorAll('.space-hd')].map((b) => b.textContent!.replace(/\s+/g, ''))
    expect(tetes).toEqual(['Mesprojets1', 'OtomataAdmin2', 'Partagésaveccetteorganisation1'])
  })
})
