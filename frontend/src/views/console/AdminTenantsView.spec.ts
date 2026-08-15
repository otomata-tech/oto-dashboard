// Smoke test de montage (même patron que `MarkdownEditor.spec.ts`) : la logique de
// verdict est testée à part (`lib/tenantVerdict.spec.ts`), ici on couvre le CÂBLAGE —
// ce que le typecheck ne voit pas et ce qu'un écran d'ops ne pardonne pas :
//   1. le deep-link `?tenant=<slug>` ouvre la fiche AU MONTAGE (une URL partagée par
//      un opérateur doit atterrir sur la bonne fiche, pas sur la liste nue) ;
//   2. les trois listes de la fiche (orgs, comptes, écarts de rattachement) sont
//      RENDUES — le chiffre `orgs_desalignees` sans son adresse est une alarme muette ;
//   3. le verdict et les domaines déclarés apparaissent dans la liste.
import { describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const ROW = {
  id: 2, slug: 'tulina', name: 'Tulina', created_at: '2026-08-01 10:00:00',
  issuer: 'https://auth.tulina.ai/oidc', jwks_uri: 'https://auth.tulina.ai/oidc/jwks',
  hosts: ['mcp.tulina.ai'], oauth_client_id: 'cid', dashboard_url: 'https://x.tulina.ai',
  link_paths: { doc: '/n/d' }, primary: false, issuer_source: 'db', authenticates: true,
  // déclaré en base MAIS absent du registre du process : le cas qui doit crier.
  loaded: false, pending_restart: true, live_hosts: [],
  orgs: 3, orgs_archivees: 1, comptes: 10, comptes_actifs: 2, appels: 44,
  dernier_compte_at: null, last_seen_at: '2026-08-14 09:00:00', orgs_desalignees: 1,
}

vi.mock('@/api/console', () => ({
  getAdminTenants: vi.fn(async () => ({
    tenants: [ROW], days: 30,
    totals: { tenants: 1, orgs: 3, comptes: 10, comptes_actifs: 2, appels: 44 },
  })),
  getAdminTenant: vi.fn(async () => ({
    tenant: {
      ...ROW,
      orgs_recentes: [{
        id: 1, name: 'Tulina', created_at: '2026-08-01 10:00:00', archived_at: null,
        personal: false, front_base_url: null, front_brand: 'Tulina', membres: 4,
      }],
      comptes_recents: [{
        sub: 'tulina:carla', email: 'carla@tulina.ai', name: 'Carla', role: 'member',
        created_at: null, appels: 44, last_seen_at: '2026-08-14 09:00:00',
      }],
      orgs_desalignees_detail: [{
        id: 9, name: 'Reprise', created_by: 'tulina:dan', tenant_du_createur: 'oto',
      }],
    },
    days: 30,
  })),
}))

async function mountView(query = '') {
  const View = (await import('./AdminTenantsView.vue')).default
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/platform/tenants', component: defineComponent({ render: () => h('div') }) }],
  })
  await router.push(`/platform/tenants${query}`)
  await router.isReady()
  const host = document.createElement('div')
  const app = createApp(View)
  app.use(router)
  app.mount(host)
  // Deux fetchs enchaînés (liste puis fiche) : laisser les microtâches se vider.
  for (let i = 0; i < 10; i++) await nextTick()
  await new Promise((r) => setTimeout(r, 20))
  for (let i = 0; i < 10; i++) await nextTick()
  return { host, unmount: () => app.unmount() }
}

describe('AdminTenantsView', () => {
  it('rend la liste avec son verdict', async () => {
    const { host, unmount } = await mountView()
    expect(host.innerHTML).toContain('Tulina')
    expect(host.innerHTML).toContain('redémarrage requis')
    unmount()
  })

  it('ouvre la fiche depuis le deep-link ?tenant= et en rend les trois listes', async () => {
    const { host, unmount } = await mountView('?tenant=tulina')
    const html = host.innerHTML
    expect(html).toContain('mcp.tulina.ai')       // domaines déclarés
    expect(html).toContain('tulina:carla')        // comptes du tenant
    expect(html).toContain('Reprise')             // l'org désalignée, NOMMÉE
    expect(html).toContain('oto')                 // le tenant de son créateur
    unmount()
  })
})
