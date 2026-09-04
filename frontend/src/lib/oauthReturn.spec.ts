// oto-backend#670 — avant ce lot, un retour OAuth en échec ne disait RIEN
// (widget silencieusement « not connected »). Banc qui mord : sans `oauthReturnToast`,
// `ConnectorsHubView` ne lisait aucun query param de retour — un `?connect=error`
// atterrissait sans qu'aucun message n'apparaisse nulle part.
import { describe, expect, it } from 'vitest'
import { oauthReturnToast } from './oauthReturn'

describe('oauthReturnToast', () => {
  it('confirme une connexion réussie, en nommant le connecteur', () => {
    expect(oauthReturnToast('connected', 'zoho')).toBe('zoho connecté')
  })

  it('nomme un refus de droits distinctement d\'un échec générique', () => {
    const forbidden = oauthReturnToast('forbidden', 'salesforce')
    const error = oauthReturnToast('error', 'salesforce')
    expect(forbidden).toContain('droits')
    expect(error).not.toContain('droits')
    expect(forbidden).not.toBe(error)
  })

  it('retombe sur un nom générique quand `connector` est absent ou non-string', () => {
    expect(oauthReturnToast('error', undefined)).toBe('connexion à ce connecteur échouée — réessaie depuis sa fiche')
    expect(oauthReturnToast('error', 42)).toBe('connexion à ce connecteur échouée — réessaie depuis sa fiche')
  })

  it('ne rend jamais de message sur une valeur absente ou inconnue — pas de cause inventée', () => {
    expect(oauthReturnToast(undefined, 'zoho')).toBeNull()
    expect(oauthReturnToast('', 'zoho')).toBeNull()
    expect(oauthReturnToast('deconnected', 'zoho')).toBeNull()
  })
})
