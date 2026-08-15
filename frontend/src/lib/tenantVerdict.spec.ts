import { describe, it, expect } from 'vitest'
import { tenantVerdict, needsAttention } from './tenantVerdict'
import type { TenantRow } from '@/types/api'

function tenant(p: Partial<TenantRow> = {}): TenantRow {
  return {
    id: 2, slug: 'tulina', name: 'Tulina', created_at: null,
    issuer: 'https://auth.tulina.ai/oidc', jwks_uri: null, hosts: ['mcp.tulina.ai'],
    oauth_client_id: null, dashboard_url: null, link_paths: {},
    primary: false, issuer_source: 'db', authenticates: true,
    loaded: true, pending_restart: false, live_hosts: ['mcp.tulina.ai'],
    orgs: 3, orgs_archivees: 0, comptes: 10, comptes_actifs: 2, appels: 44,
    dernier_compte_at: null, last_seen_at: null, orgs_desalignees: 0,
    ...p,
  }
}

describe('tenantVerdict', () => {
  it('un tenant chargé est « servi » (olive)', () => {
    const v = tenantVerdict(tenant())
    expect(v.label).toBe('servi')
    expect(v.tone).toBe('olive')
  })

  it("« redémarrage requis » PRIME sur tout : c'est le seul état où l'écran dirait « servi » alors que les jetons sont rejetés", () => {
    // Déclaré (authenticates) mais absent du registre du process : sans cette
    // priorité, la ligne s'afficherait en olive et personne ne redémarrerait.
    const v = tenantVerdict(tenant({ authenticates: true, loaded: false, pending_restart: true }))
    expect(v.tone).toBe('terra')
    expect(v.label).toBe('redémarrage requis')
  })

  it('un tenant sans émetteur est « incomplet » (saffron), jamais une erreur', () => {
    // Il n'a rien promis : son annuaire n'est pas encore provisionné. Le peindre en
    // terra ferait chercher une panne là où il n'y a qu'une étape restante.
    const v = tenantVerdict(tenant({ issuer: null, issuer_source: null, authenticates: false, loaded: false }))
    expect(v.tone).toBe('saffron')
    expect(v.label).toBe('sans émetteur')
  })

  it('le tenant de la plateforme se distingue (ink) — son émetteur vient de la config', () => {
    const v = tenantVerdict(tenant({ slug: 'oto', primary: true, issuer: null, issuer_source: 'env' }))
    expect(v.tone).toBe('ink')
    expect(v.label).toBe('plateforme')
  })

  it("un tenant primaire non chargé reste un « redémarrage requis » — le verdict ne dépend pas de qui c'est", () => {
    const v = tenantVerdict(tenant({ slug: 'oto', primary: true, pending_restart: true }))
    expect(v.tone).toBe('terra')
  })
})

describe('needsAttention', () => {
  it('un écart de rattachement appelle une action (deux sources qui divergent)', () => {
    expect(needsAttention(tenant({ orgs_desalignees: 2 }))).toBe(true)
  })
  it('un tenant déclaré mais pas chargé aussi', () => {
    expect(needsAttention(tenant({ pending_restart: true }))).toBe(true)
  })
  it("un tenant en attente de provisionnement n'est PAS une alerte", () => {
    expect(needsAttention(tenant({ authenticates: false, loaded: false }))).toBe(false)
  })
  it('un tenant servi et cohérent ne remonte pas', () => {
    expect(needsAttention(tenant())).toBe(false)
  })
})
