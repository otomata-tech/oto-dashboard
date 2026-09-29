// Le tunnel lit un contrat (oto-commerce) et refait une règle du serveur (la TVA) : ce
// qu'aucun type ne vérifie, c'est que le montant ANNONCÉ est celui qui sera DÉBITÉ, et
// qu'un refus qui nomme un préalable est lu comme tel.
import { ApiError } from '@/api'
import { describe, expect, it } from 'vitest'
import {
  acceptationsOf, blockersOf, cgvDocs, dernierPaiement, nextProbeDelayMs, priceParts,
  taxPreview, vatAmount,
} from './billingTunnel'
import type { CommerceIdentiteVue, CommercePaiement } from '@/types/api.commerce'

describe('vatAmount — l\'arrondi du serveur (ROUND_HALF_UP)', () => {
  it('applique 20 % au prix d\'une place', () => {
    expect(vatAmount(2500, 2000)).toBe(500)
    expect(vatAmount(7500, 2000)).toBe(1500)
  })

  it('arrondit la MOITIÉ vers le haut, jamais vers le bas', () => {
    // 1 × 0,2 = 0,2 → 0 ; 3 × 0,2 = 0,6 → 1 ; 5 × 0,1 = 0,5 → 1.
    expect(vatAmount(1, 2000)).toBe(0)
    expect(vatAmount(3, 2000)).toBe(1)
    expect(vatAmount(5, 1000)).toBe(1)
  })

  it('rend zéro sur un taux exonéré (autoliquidation, export)', () => {
    expect(vatAmount(2500, 0)).toBe(0)
  })
})

describe('priceParts', () => {
  it('décompose HT / TVA / TTC', () => {
    expect(priceParts(7500, 2000)).toEqual({ ht: 7500, vat: 1500, ttc: 9000 })
  })

  it('ne devine AUCUN taux : sans régime tranché, il n\'y a pas de montant', () => {
    expect(priceParts(7500, null)).toBeNull()
    expect(priceParts(null, 2000)).toBeNull()
  })
})

// Le miroir de `tva.scheme_for` : chaque branche de la règle du serveur.
function fiche(country_code: string, vat_number: string | null = null,
  manquants: string[] = []): CommerceIdentiteVue {
  return {
    identite: { legal_name: 'ACME', country_code, vat_number, address_line: '1 rue',
      postal_code: '13001', city: 'Marseille', email: 'compta@acme.test' },
    manquants,
  }
}

describe('taxPreview — la règle de TVA du commerce, rejouée avant souscription', () => {
  it('France : TVA française, 20 %', () => {
    expect(taxPreview(fiche('FR'))).toEqual({ scheme: 'fr_ttc', rateBps: 2000, blocked: null })
  })

  it('Union hors France AVEC numéro : autoliquidation, 0 %', () => {
    expect(taxPreview(fiche('BE', 'BE0123456789')))
      .toEqual({ scheme: 'reverse_charge', rateBps: 0, blocked: null })
  })

  it('Union hors France SANS numéro : refusé, jamais un taux au jugé', () => {
    expect(taxPreview(fiche('BE'))).toEqual({ scheme: null, rateBps: null, blocked: 'vat_consumer_unsupported' })
  })

  it('hors Union : export, 0 %', () => {
    expect(taxPreview(fiche('US'))).toEqual({ scheme: 'export', rateBps: 0, blocked: null })
  })

  it('fiche absente ou incomplète : l\'identité est requise, quel que soit le pays', () => {
    expect(taxPreview(null).blocked).toBe('billing_identity_required')
    expect(taxPreview({ identite: null, manquants: ['legal_name'] }).blocked).toBe('billing_identity_required')
    expect(taxPreview(fiche('FR', null, ['city'])).blocked).toBe('billing_identity_required')
  })
})

describe('les documents d\'achat, lus et acceptés', () => {
  const CGV = { documents: {
    cgv: { version: '2.1', label: 'CGV', url: 'https://oto.cx/cgv' },
    dpa: { version: '2.1', label: 'DPA', url: 'https://oto.cx/dpa' },
  } }

  it('rend les documents dans l\'ordre servi, avec leur version', () => {
    expect(cgvDocs(CGV).map((d) => `${d.slug}@${d.version}`)).toEqual(['cgv@2.1', 'dpa@2.1'])
    expect(cgvDocs(null)).toEqual([])
  })

  it('l\'acceptation porte la version de CHAQUE document montré', () => {
    expect(acceptationsOf(cgvDocs(CGV))).toEqual({ cgv: '2.1', dpa: '2.1' })
  })
})

describe('blockersOf — le préalable qu\'un refus de souscription nomme', () => {
  it('l\'identité manquante ou fermée à la souscription', () => {
    for (const code of ['billing_identity_required', 'vat_consumer_unsupported']) {
      const b = blockersOf(new ApiError(400, code, 'champs à renseigner : city'))
      expect(b?.identity?.code).toBe(code)
      expect(b?.legal).toBeNull()
    }
  })

  it('les documents d\'achat ont changé de version', () => {
    const b = blockersOf(new ApiError(400, 'purchase_documents_required', 'cgv 2.2'))
    expect(b).toEqual({ identity: null, legal: { message: 'cgv 2.2' } })
  })

  it('ignore les refus qui ne sont PAS des préalables', () => {
    expect(blockersOf(new ApiError(409, 'subscription_alive', 'déjà abonnée'))).toBeNull()
    expect(blockersOf(new ApiError(400, 'invalid_places', 'au moins une place'))).toBeNull()
    expect(blockersOf(new Error('stale_session'))).toBeNull()
  })
})

describe('dernierPaiement — un encaissement en vol, lu au journal', () => {
  let id = 0
  const p = (nature: string, statut: string): CommercePaiement => ({
    id: ++id, created_at: '2026-09-28T10:00:00+00:00', nature, statut, places: 3, montant_ht: 7500,
    tva_bps: 2000, tva: 1500, montant_ttc: 9000, regime_tva: 'fr_ttc', periode_fin: null,
  })

  it('lit le DERNIER paiement de la nature demandée — le journal arrive du plus récent au plus ancien', () => {
    const journal = [p('method_change', 'paid'), p('initial', 'open'), p('initial', 'failed')]
    expect(dernierPaiement(journal, 'initial')).toBe('en_vol')
    expect(dernierPaiement(journal, 'method_change')).toBe('paye')
    expect(dernierPaiement(journal, 'renewal')).toBeNull()
  })

  it('un paiement échoué, annulé ou expiré n\'est plus en vol', () => {
    for (const s of ['failed', 'canceled', 'expired']) {
      expect(dernierPaiement([p('initial', s)], 'initial')).toBe('echec')
    }
    for (const s of ['open', 'pending', 'authorized']) {
      expect(dernierPaiement([p('initial', s)], 'initial')).toBe('en_vol')
    }
  })
})

describe('nextProbeDelayMs', () => {
  it('suit le délai demandé', () => {
    expect(nextProbeDelayMs(10)).toBe(10_000)
  })

  it('borne l\'absurde plutôt que de marteler ou de figer', () => {
    expect(nextProbeDelayMs(null)).toBe(5_000)
    expect(nextProbeDelayMs(0)).toBe(5_000)
    expect(nextProbeDelayMs(1)).toBe(2_000)
    expect(nextProbeDelayMs(3600)).toBe(60_000)
  })
})
