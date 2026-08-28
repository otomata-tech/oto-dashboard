// `billingTunnel` est un MIROIR du serveur (cf. l'en-tête du module) : rien ici ne
// casse l'écran, tout y fait mentir le montant annoncé ou la liste des manques. Ces
// tests fixent les deux contrats qu'il recopie — l'arrondi de `billing_vat` et la
// forme de `details.blockers` — sur les valeurs que le backend sert vraiment.
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api'
import {
  blockersOf, docsToAccept, nextProbeDelayMs, priceParts, vatAmount,
} from './billingTunnel'
import type { LegalStatus } from '@/types/api'

describe('vatAmount — l\'arrondi du serveur (ROUND_HALF_UP)', () => {
  it('applique 20 % au prix des paliers du catalogue', () => {
    expect(vatAmount(1900, 2000)).toBe(380)     // 19,00 € → 3,80 €
    expect(vatAmount(4900, 2000)).toBe(980)
    expect(vatAmount(24900, 2000)).toBe(4980)   // le cas qui tronquait en flottant
  })

  it('arrondit la MOITIÉ vers le haut, jamais vers le bas', () => {
    // 275 centimes × 20 % = 55,0 ; 2725 × 2 % = 54,5 → 55 (et non 54).
    expect(vatAmount(2725, 200)).toBe(55)
    expect(vatAmount(2725, 100)).toBe(27)       // 27,25 → 27
  })

  it('rend zéro sur un taux exonéré (autoliquidation, export)', () => {
    expect(vatAmount(4900, 0)).toBe(0)
  })
})

describe('priceParts', () => {
  it('décompose HT / TVA / TTC', () => {
    expect(priceParts(1900, 2000)).toEqual({ ht: 1900, vat: 380, ttc: 2280 })
    expect(priceParts(1900, 0)).toEqual({ ht: 1900, vat: 0, ttc: 1900 })
  })

  it('ne devine AUCUN taux : sans régime tranché, il n\'y a pas de montant', () => {
    expect(priceParts(1900, null)).toBeNull()
    expect(priceParts(null, 2000)).toBeNull()   // palier sur devis
  })
})

function denied(code: string, details?: Record<string, unknown>, detail?: string) {
  return new ApiError(409, code, detail, details)
}

// La forme exacte servie par oto-backend (`_purchase_preconditions` → `blockers`).
const LEGAL_BLOCKER = {
  code: 'legal_required',
  context: 'purchase',
  message: 'documents à accepter',
  documents: [
    { slug: 'terms', label: 'CGU', version: '3.0', url: 'https://oto.cx/terms', accepted_version: null },
    { slug: 'cgv', label: 'CGV', version: '2.0', url: 'https://oto.cx/cgv', accepted_version: '1.0' },
  ],
}
const BLOCKERS = {
  blockers: [
    { code: 'billing_identity_required', message: 'champs à renseigner : legal_name, country_code' },
    LEGAL_BLOCKER,
  ],
}

describe('blockersOf', () => {
  it('rend les DEUX manques d\'un coup — c\'est tout l\'objet de details.blockers', () => {
    const b = blockersOf(denied('billing_identity_required', BLOCKERS))
    expect(b?.identity?.code).toBe('billing_identity_required')
    expect(b?.legal?.documents.map((d) => d.slug)).toEqual(['terms', 'cgv'])
    // La version déjà acceptée distingue « jamais coché » de « coché sur la version d'avant ».
    expect(b?.legal?.documents.find((d) => d.slug === 'cgv')?.accepted_version).toBe('1.0')
  })

  it('ne se fie pas au code de tête : légal seul est vu même quand la tête dit identité', () => {
    // Le serveur nomme le PREMIER manque de l'ordre du tunnel ; ici il n'y en a qu'un,
    // et il est légal — un écran qui lirait la tête peindrait le mauvais bloc.
    const b = blockersOf(denied('legal_required', { blockers: [LEGAL_BLOCKER] }))
    expect(b?.identity).toBeNull()
    expect(b?.legal?.documents).toHaveLength(2)
  })

  it('retombe sur le code de tête quand le serveur ne rend pas details', () => {
    const b = blockersOf(denied('billing_identity_required', undefined, 'champs à renseigner : city'))
    expect(b?.identity).toEqual({ code: 'billing_identity_required', message: 'champs à renseigner : city' })
    expect(b?.legal).toBeNull()
  })

  it('ignore les 409 qui ne sont PAS des préalables — payment_pending a son propre écran', () => {
    expect(blockersOf(denied('payment_pending', undefined, 'un paiement est en cours'))).toBeNull()
    expect(blockersOf(denied('already_subscribed'))).toBeNull()
    expect(blockersOf(new ApiError(502, 'psp_error'))).toBeNull()
    expect(blockersOf(new Error('boom'))).toBeNull()
  })

  it('laisse tomber un document sans adresse plutôt que d\'afficher un lien mort', () => {
    const b = blockersOf(denied('legal_required', {
      blockers: [{ code: 'legal_required', message: '', documents: [{ slug: 'dpa' }] }],
    }))
    expect(b?.legal?.documents).toEqual([])
  })
})

describe('docsToAccept — la même liste, lue à froid', () => {
  const status = {
    documents: [
      { slug: 'terms', label: 'CGU', version: '3.0', url: 'u1', accepted: false, accepted_version: null, accepted_at: null },
      { slug: 'cgv', label: 'CGV', version: '2.0', url: 'u2', accepted: false, accepted_version: '1.0', accepted_at: null },
      { slug: 'dpa', label: 'DPA', version: '2.0', url: 'u3', accepted: true, accepted_version: '2.0', accepted_at: 'x' },
    ],
    contexts: { purchase: { required: ['terms', 'cgv', 'dpa'], outstanding: ['terms', 'cgv'] } },
  } as unknown as LegalStatus

  it('ne garde que ce qui reste dû pour CE contexte', () => {
    expect(docsToAccept(status, 'purchase').map((d) => d.slug)).toEqual(['terms', 'cgv'])
  })

  it('rend une liste vide sur un contexte inconnu ou un statut absent', () => {
    expect(docsToAccept(status, 'access')).toEqual([])
    expect(docsToAccept(null, 'purchase')).toEqual([])
  })
})

describe('nextProbeDelayMs', () => {
  it('suit le délai conseillé par le serveur', () => {
    expect(nextProbeDelayMs(15)).toBe(15000)
  })

  it('borne l\'absurde plutôt que de marteler ou de figer', () => {
    expect(nextProbeDelayMs(null)).toBe(5000)
    expect(nextProbeDelayMs(0)).toBe(5000)
    expect(nextProbeDelayMs(1)).toBe(2000)
    expect(nextProbeDelayMs(3600)).toBe(60000)
  })
})
