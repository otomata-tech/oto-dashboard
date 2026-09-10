// Le défaut réparé est une COURSE, pas un calcul : la sidebar lisait `me.active_org`
// une seule fois, à son montage — or `me` arrive d'un `GET /api/me` encore en vol.
// `org` valait donc `null`, `listGroups` n'était jamais appelé, et chaque espace
// d'équipe s'affichait « Équipe » au lieu de son nom, définitivement (rien ne
// relançait la lecture). Le test monte le composant AVANT que `me` soit là, puis
// remplit `me` : c'est cette séquence, et elle seule, qui attrape le défaut.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createApp, nextTick, ref } from 'vue'

/** Laisse les promesses de chargement se résoudre ET le rendu se recalculer. */
const vider = async () => {
  for (let i = 0; i < 5; i++) { await new Promise((r) => setTimeout(r, 0)); await nextTick() }
}
import SidebarSpaces from './SidebarSpaces.vue'

const me = ref<{ active_org: number | null } | null>(null)

vi.mock('@/composables/useMe', () => ({ useMe: () => ({ me }) }))
vi.mock('@/composables/useNav', () => ({ useNav: () => ({ closeNav: () => {} }) }))
vi.mock('@/composables/useScopedLink', () => ({
  useScopedLink: () => ({ scoped: (p: string) => p }),
}))
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/overview', params: {} }),
  RouterLink: { template: '<a><slot /></a>' },
}))
vi.mock('@/api/console', () => ({
  listProjects: vi.fn(async () => ({
    projects: [{ id: 1, name: 'Prospection', owner_type: 'group', owner_id: 9 }],
  })),
  listGroups: vi.fn(async () => ({ groups: [{ id: 9, group_id: 9, name: 'Commerciale' }] })),
}))

import { listGroups } from '@/api/console'

async function monter() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  createApp(SidebarSpaces).mount(host)
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
