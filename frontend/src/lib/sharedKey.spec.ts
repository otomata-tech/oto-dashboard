import { describe, expect, it } from 'vitest'
import { sharedKeySource } from './sharedKey'
import type { ProviderStatus } from '@/types/api'

const ps = (mode: ProviderStatus['mode'], user = false): ProviderStatus => ({
  mode, user_key_configured: user, org_secret_configured: mode === 'org',
  platform_key_label: null, quota_used_today: 0, quota_daily: null,
})

describe('sharedKeySource — la clé parvient-elle au membre d’un niveau partagé ?', () => {
  it.each(['org', 'group', 'tenant', 'platform'] as const)('%s : fournie, rien à saisir', (m) => {
    expect(sharedKeySource(ps(m))).toBe(m)
  })
  it('aucune clé, sa propre clé, quota épuisé : rien de fourni', () => {
    expect(sharedKeySource(undefined)).toBeNull()
    expect(sharedKeySource(ps('forbidden'))).toBeNull()
    expect(sharedKeySource(ps('user', true))).toBeNull()
    expect(sharedKeySource(ps('over_quota'))).toBeNull()
  })
  it('sa propre clé posée prime : la clé d’org ne se dit plus « fournie »', () => {
    expect(sharedKeySource(ps('org', true))).toBeNull()
  })
  it('en org perso, une clé d’org ou d’équipe EST la sienne', () => {
    expect(sharedKeySource(ps('org'), { isPersonal: true })).toBeNull()
    expect(sharedKeySource(ps('group'), { isPersonal: true })).toBeNull()
    expect(sharedKeySource(ps('tenant'), { isPersonal: true })).toBe('tenant')
  })
})
