// Le lien d'invitation que le backend envoie est `/invitation/<token>` depuis le 15/09
// (oto-backend#560 : code court retiré). La page lisait encore le segment comme un code
// et appelait `/api/invitations/code/{code}`, route disparue : toute invitation par mail
// tombait en « lien invalide » (constaté le 23/09). Ce test tient le raccord.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'

const api = vi.hoisted(() => ({
  previewInvite: vi.fn(async () => ({ email: 'x@y.fr', org_name: 'Acme', scope: 'org' })),
  acceptInvite: vi.fn(async () => ({ ok: true, org_id: 1, org_role: 'org_member', name: 'Acme' })),
}))
vi.mock('@/api/console', () => api)
vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({ isAuthenticated: { value: false }, login: vi.fn(), logout: vi.fn() }),
}))

import InviteAcceptView from './InviteAcceptView.vue'

async function monter(chemin: string) {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/invitation/:token', component: InviteAcceptView },
    { path: '/invite', component: InviteAcceptView },
  ] })
  await router.push(chemin)
  await router.isReady()
  const host = document.createElement('div')
  const app = createApp(InviteAcceptView).use(router)
  app.mount(host)
  for (let i = 0; i < 5; i++) { await new Promise((r) => setTimeout(r, 0)); await nextTick() }
  return { host, app }
}

describe('InviteAcceptView — le lien porte le jeton', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('/invitation/<token> : l’aperçu est demandé par jeton', async () => {
    const { app } = await monter('/invitation/tok-256-bits')
    expect(api.previewInvite).toHaveBeenCalledWith('tok-256-bits')
    app.unmount()
  })
})
