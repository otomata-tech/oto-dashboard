import { describe, it, expect } from 'vitest'
import { instructionRights } from './instructionRights'

// Les deux témoins qui décident du lot (oto-dashboard#144) : une MEMBRE non-cheffe voit
// l'édition et PAS la suppression ; une cheffe voit les deux. Le reste ancre le repli.
describe('instructionRights — chaque geste lit le drapeau de son geste', () => {
  it('membre non-cheffe : peut écrire, ne peut pas supprimer', () => {
    // Ce que le serveur sert à une membre d'équipe : can_edit reste FAUX (elle
    // n'administre pas l'équipe) mais l'écriture lui est ouverte.
    expect(instructionRights({
      can_edit: false, can_write_instructions: true, can_delete_instructions: false,
    })).toEqual({ canWrite: true, canDelete: false })
  })

  it('cheffe d\'équipe : les deux', () => {
    expect(instructionRights({
      can_edit: true, can_write_instructions: true, can_delete_instructions: true,
    })).toEqual({ canWrite: true, canDelete: true })
  })

  it('la suppression ne s\'élargit PAS au droit d\'écrire', () => {
    // La porte ouverte à tort : un bouton que le serveur refuserait.
    const r = instructionRights({ can_edit: false, can_write_instructions: true })
    expect(r.canDelete).toBe(false)
  })

  it('champs absents (serveur plus ancien) : repli sur can_edit pour les deux', () => {
    // Une absence n'est pas un « non » — on retombe sur l'écran d'avant le lot.
    expect(instructionRights({ can_edit: true })).toEqual({ canWrite: true, canDelete: true })
    expect(instructionRights({ can_edit: false })).toEqual({ canWrite: false, canDelete: false })
  })

  it('un `false` SERVI gagne sur can_edit (ce n\'est pas une absence)', () => {
    expect(instructionRights({
      can_edit: true, can_write_instructions: false, can_delete_instructions: false,
    })).toEqual({ canWrite: false, canDelete: false })
  })

  it('un repli explicite passe AVANT can_edit (le rôle connu de l\'appelant)', () => {
    // L'écran d'équipe sait déjà, par le rôle du requérant, qu'une membre peut écrire.
    // Devant un serveur plus ancien, retomber sur `can_edit` lui fermerait la porte que
    // oto-dashboard#147 avait ouverte : le repli de l'appelant vaut mieux.
    expect(instructionRights({ can_edit: false }, { canWrite: true, canDelete: false }))
      .toEqual({ canWrite: true, canDelete: false })
    // …mais il ne prime JAMAIS sur ce que le serveur sert, fût-ce un refus.
    expect(instructionRights(
      { can_edit: false, can_write_instructions: false, can_delete_instructions: false },
      { canWrite: true, canDelete: true },
    )).toEqual({ canWrite: false, canDelete: false })
  })

  it('bundle pas encore chargé : rien n\'est accordé', () => {
    expect(instructionRights(null)).toEqual({ canWrite: false, canDelete: false })
    expect(instructionRights(undefined)).toEqual({ canWrite: false, canDelete: false })
    expect(instructionRights({})).toEqual({ canWrite: false, canDelete: false })
  })
})
