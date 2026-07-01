// Humanisation des erreurs backend : api() lève `Error("<status> <code>")`
// (ex. "409 namespace_exists") ou une string nue ("stale_session"). `humanize`
// doit extraire le code et le mapper — sans jamais masquer un code inconnu.
import { describe, expect, it } from 'vitest'
import { humanize } from './errors'

describe('humanize', () => {
  it('maps a "<status> <code>" error to its message', () => {
    expect(humanize(new Error('409 namespace_exists')))
      .toBe('a namespace with that name already exists')
  })

  it('maps a bare code string (no status prefix)', () => {
    expect(humanize('stale_session')).toBe('your session expired — sign in again')
  })

  it('maps a bare Error whose whole message is a known code', () => {
    expect(humanize(new Error('forbidden'))).toBe("you don't have access to this")
  })

  it('falls back to the raw message for an unknown code', () => {
    expect(humanize(new Error('500 kaboom_unmapped'))).toBe('500 kaboom_unmapped')
  })

  it('handles non-Error values by stringifying', () => {
    expect(humanize('missing_bearer')).toBe('not authenticated')
    expect(humanize(12345)).toBe('12345')
  })
})
