// Lecture du plafond de réservations et du motif d'abandon (oto-backend#433).
// Fixtures = le contrat RÉEL : le cycle de vie canonique de la doc backend, et les
// motifs littéraux que ses tests assertent — accord au singulier absent compris.
import { describe, expect, it } from 'vitest'
import { abandonState, abandonVerdict, claimBudget, maxClaims } from './datastoreClaims'
import type { DatastoreLifecycle, DatastoreRow } from '@/types/api'

// `docs/datastore.md` d'oto-backend, §plafond de reprises.
const LC: DatastoreLifecycle = {
  states: ['a_traiter', 'traite', 'echec'],
  transitions: { a_traiter: ['traite', 'echec'], echec: ['a_traiter'] },
  terminal: ['traite', 'echec'],
  max_claims: 3,
  abandon_state: 'echec',
}
// Le même tableau sans retour déclaré depuis l'abandon : le piège du contrat.
const LC_SANS_RETOUR: DatastoreLifecycle = {
  ...LC,
  transitions: { a_traiter: ['traite', 'echec'] },
}
const row = (r: Record<string, unknown>): DatastoreRow => ({ _id: 'r1', ...r })

describe('claimBudget', () => {
  it("ne dit rien d'une ligne jamais réservée", () => {
    // Le serveur OMET `_claims` à 0 — l'absence est le cas nominal, pas une anomalie.
    expect(claimBudget(row({ statut: 'a_traiter' }), LC)).toBeNull()
  })

  it('lit le compteur contre le plafond déclaré', () => {
    expect(claimBudget(row({ _claims: 2 }), LC))
      .toEqual({ claims: 2, max: 3, label: '2/3', atCeiling: false })
  })

  it('signale le plafond atteint — la prochaine libération sort la ligne', () => {
    expect(claimBudget(row({ _claims: 3 }), LC)?.atCeiling).toBe(true)
  })

  it('signale aussi un compte SUPÉRIEUR au plafond (plafond resserré depuis)', () => {
    // `data_claim_next` accepte un `max_claims` qui serre la déclaration pour une
    // passe : une ligne peut porter 5 réservations sous un plafond redescendu à 3.
    expect(claimBudget(row({ _claims: 5 }), LC))
      .toEqual({ claims: 5, max: 3, label: '5/3', atCeiling: true })
  })

  it('compte sans plafond quand le tableau n\'en déclare pas', () => {
    expect(claimBudget(row({ _claims: 2 }), { states: ['a', 'b'] }))
      .toEqual({ claims: 2, max: null, label: '2', atCeiling: false })
    expect(claimBudget(row({ _claims: 2 }), null))
      .toEqual({ claims: 2, max: null, label: '2', atCeiling: false })
  })

  it('ignore un compteur qui ne porte rien', () => {
    expect(claimBudget(row({ _claims: 0 }), LC)).toBeNull()
    expect(claimBudget(row({ _claims: null }), LC)).toBeNull()
    // Le contrat sert un entier : une chaîne signalerait une dérive, on ne la parse pas.
    expect(claimBudget(row({ _claims: '2' }), LC)).toBeNull()
    expect(claimBudget(null, LC)).toBeNull()
  })
})

describe('maxClaims / abandonState', () => {
  it('lit le plafond et l\'état d\'abandon déclarés', () => {
    expect(maxClaims(LC)).toBe(3)
    expect(abandonState(LC)).toBe('echec')
  })

  it('rend null quand la garde est inactive', () => {
    expect(maxClaims({ states: ['a'] })).toBeNull()
    expect(maxClaims({ max_claims: null })).toBeNull()
    expect(abandonState({ states: ['a'] })).toBeNull()
    expect(abandonState({ abandon_state: null })).toBeNull()
  })

  it('refuse un plafond hors contrat (le backend impose un entier >= 1)', () => {
    expect(maxClaims({ max_claims: 0 })).toBeNull()
    expect(maxClaims({ max_claims: 2.5 })).toBeNull()
    expect(maxClaims({ max_claims: true } as unknown as DatastoreLifecycle)).toBeNull()
    expect(maxClaims({ max_claims: '3' } as unknown as DatastoreLifecycle)).toBeNull()
  })
})

describe('abandonVerdict', () => {
  it("ne dit rien d'une ligne qui est encore dans la file", () => {
    expect(abandonVerdict(row({ statut: 'a_traiter', _claims: 2 }), 'statut', LC)).toBeNull()
  })

  it('rend le motif du serveur MOT POUR MOT', () => {
    // Chaîne assertée telle quelle côté backend — y compris son « 1 réservations » :
    // le motif est une trace, pas une phrase à corriger.
    const brut = 'abandonnée après 1 réservations sans écriture, plafond 1'
    expect(abandonVerdict(row({ statut: 'echec', _abandon: brut }), 'statut', LC)?.reason)
      .toBe(brut)
  })

  it('nomme les retours déclarés depuis l\'état d\'abandon', () => {
    const r = row({ statut: 'echec', _abandon: 'abandonnée après 3 réservations sans écriture, plafond 3' })
    expect(abandonVerdict(r, 'statut', LC)).toEqual({
      reason: 'abandonnée après 3 réservations sans écriture, plafond 3',
      reopens: ['a_traiter'],
    })
  })

  it('rend un retour VIDE quand le cycle de vie n\'en déclare aucun (statut gelé)', () => {
    // Cas vécu du contrat : une écriture rouvre la file (compteur et motif tombent),
    // mais un changement de statut serait REFUSÉ — l'écran doit le dire, pas proposer
    // un bouton voué au 400.
    const r = row({ statut: 'echec', _abandon: 'abandonnée après 3 réservations sans écriture, plafond 3' })
    expect(abandonVerdict(r, 'statut', LC_SANS_RETOUR)?.reopens).toEqual([])
  })

  it('reste lisible sans champ de statut connu', () => {
    const r = row({ _abandon: 'abandonnée après 2 réservations sans écriture, plafond 2' })
    expect(abandonVerdict(r, null, LC))
      .toEqual({ reason: 'abandonnée après 2 réservations sans écriture, plafond 2', reopens: [] })
  })
})
