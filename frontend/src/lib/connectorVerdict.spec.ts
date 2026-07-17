import { describe, it, expect } from 'vitest'
import { connectorVerdict, keyLevelCount } from './connectorVerdict'
import type { MyConnector, ProviderStatus } from '@/types/api'

// Fabrique minimale d'un MyConnector (seuls les champs lus par le verdict comptent).
function conn(over: Partial<MyConnector> = {}): MyConnector {
  return {
    name: 'hubspot', label: 'HubSpot', category: 'CRM',
    auth: { method: 'secret' },
    state: 'active',
    free_tier: null, paid_option: null, option_ok: true,
    // le reste du ConnectorMeta n'est pas lu par le verdict
    ...(over as MyConnector),
  } as MyConnector
}

function ps(over: Partial<ProviderStatus> = {}): ProviderStatus {
  return {
    mode: 'user',
    user_key_configured: true,
    org_secret_configured: false,
    platform_key_label: null,
    quota_used_today: 0, quota_daily: null,
    ...over,
  } as ProviderStatus
}

describe('connectorVerdict — état d\'installation', () => {
  it('non installé → ○ faint, CTA connecter', () => {
    const v = connectorVerdict(conn({ state: 'not_selected' }), undefined)
    expect(v.list).toBe('Non installé')
    expect(v.dot).toBe('faint')
    expect(v.hollow).toBe(true)
    expect(v.cta).toBe('Connecter HubSpot')
  })

  it('non installé mais résout déjà (open data) → CTA Activer', () => {
    const v = connectorVerdict(conn({ state: 'not_selected', auth: { method: 'none' } }), undefined)
    expect(v.cta).toBe('Activer')
  })

  it('en veille → saffron', () => {
    const v = connectorVerdict(conn({ state: 'paused' }), ps())
    expect(v.list).toBe('En veille')
    expect(v.dot).toBe('saffron')
  })
})

describe('connectorVerdict — résolution (actif)', () => {
  it('open data → Actif · open data (olive)', () => {
    const v = connectorVerdict(conn({ auth: { method: 'none' } }), undefined)
    expect(v.list).toBe('Actif · open data')
    expect(v.dot).toBe('olive')
    expect(v.phrase).toBe('Prêt à l’emploi.')
  })

  it('résolu par ta clé, 1 seule clé → Actif · ta clé (pas de +N)', () => {
    const v = connectorVerdict(conn(), ps({ mode: 'user' }))
    expect(v.list).toBe('Actif · ta clé')
    expect(v.dot).toBe('olive')
  })

  it('résolu par clé d\'org → Actif · clé d’org', () => {
    const v = connectorVerdict(conn(), ps({ mode: 'org', user_key_configured: false, org_secret_configured: true }))
    expect(v.list).toBe('Actif · clé d’org')
  })

  it('multi-clés (ta clé + équipe + org) → suffixe (+2)', () => {
    const v = connectorVerdict(conn(), ps({
      mode: 'user', user_key_configured: true,
      group_secret_configured: true, org_secret_configured: true,
    }))
    expect(v.list).toBe('Actif · ta clé (+2)')
  })

  it('hosted résolu → Actif · compte lié', () => {
    const v = connectorVerdict(conn({ auth: { method: 'hosted' } }), ps({ mode: 'user' }))
    expect(v.list).toBe('Actif · compte lié')
  })

  it('quota atteint → saffron + CTA pose ta clé', () => {
    const v = connectorVerdict(conn(), ps({ mode: 'over_quota', platform_key_label: 'default' }))
    expect(v.list).toBe('Quota atteint')
    expect(v.dot).toBe('saffron')
    expect(v.cta).toBe('Pose ta clé')
  })
})

describe('connectorVerdict — indisponible', () => {
  it('pas de clé → À connecter', () => {
    const v = connectorVerdict(conn(), ps({ mode: 'forbidden', user_key_configured: false }))
    // forbidden sans option ni team → réservé
    expect(v.list).toBe('Réservé')
    expect(v.hint).toBe(true)
  })

  it('aucun provider status → À connecter', () => {
    const v = connectorVerdict(conn(), undefined)
    expect(v.list).toBe('À connecter')
    expect(v.cta).toBe('Connecter HubSpot')
  })

  it('option payante manquante → Option X requise (hint, pas de CTA)', () => {
    const v = connectorVerdict(
      conn({ label: 'LinkedIn', paid_option: 'LinkedIn', option_ok: false }),
      ps({ mode: 'forbidden' }))
    expect(v.list).toBe('Option LinkedIn requise')
    expect(v.hint).toBe(true)
    expect(v.cta).toBeNull()
  })

  it('clé d\'équipe hors contexte → nommer l\'équipe (pas réservé)', () => {
    const v = connectorVerdict(conn(), ps({
      mode: 'forbidden', user_key_configured: false,
      team_key_group: { id: 3, name: 'Sales' },
    }))
    expect(v.list).toBe('Clé d’équipe Sales')
    expect(v.hint).toBe(false)
  })
})

describe('keyLevelCount', () => {
  it('compte les niveaux porteurs de clé', () => {
    expect(keyLevelCount(undefined)).toBe(0)
    expect(keyLevelCount(ps({ user_key_configured: true }))).toBe(1)
    expect(keyLevelCount(ps({
      user_key_configured: true, org_secret_configured: true, platform_key_label: 'x',
    }))).toBe(3)
  })
})
