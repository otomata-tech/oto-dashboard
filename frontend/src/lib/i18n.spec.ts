import { beforeEach, describe, expect, it } from 'vitest'
import { i18n, applyMeLocale } from './i18n'
import { humanize } from './errors'

// Exerce le cœur i18n de bout en bout (sans navigateur) : lookup des messages,
// réactivité de la locale active, interpolation nommée, intégration avec humanize.
describe('i18n', () => {
  beforeEach(() => { i18n.global.locale.value = 'en' })

  it('resolves nav keys per active locale', () => {
    expect(i18n.global.t('nav.overview')).toBe('overview')
    applyMeLocale('fr')
    expect(i18n.global.locale.value).toBe('fr')
    expect(i18n.global.t('nav.overview')).toBe('aperçu')
  })

  it('humanize follows the active locale', () => {
    expect(humanize(new Error('409 namespace_exists'))).toBe('a namespace with that name already exists')
    applyMeLocale('fr')
    expect(humanize(new Error('409 namespace_exists'))).toBe('un tableau porte déjà ce nom')
  })

  it('applyMeLocale ignores null / unsupported values', () => {
    applyMeLocale(null)
    expect(i18n.global.locale.value).toBe('en')
    applyMeLocale('de' as unknown as 'en')
    expect(i18n.global.locale.value).toBe('en')
  })

  it('interpolates named params', () => {
    expect(i18n.global.t('overview.stat.callsSub', { errors: 3, rate: 12 })).toBe('3 errors · 12%')
  })
})
