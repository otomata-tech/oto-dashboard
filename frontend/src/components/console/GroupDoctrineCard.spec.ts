// Le témoin qui décide du lot (oto-dashboard#144) : le serveur ouvre l'écriture d'une
// procédure d'équipe à ses MEMBRES, la suppression reste au chef. On monte l'écran tel
// qu'il est monté en vrai (`TeamProceduresView` passe `can-manage=canManage` et
// `can-write=isMember`) et on regarde les boutons qui sortent du DOM.
//
// Un test sur la seule fonction de droits ne suffirait pas ici : le défaut réparé était
// un CÂBLAGE — l'écran dérivait tous ses boutons du drapeau d'administration.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createApp, nextTick } from 'vue'
import GroupDoctrineCard from './GroupDoctrineCard.vue'

type Bundle = Record<string, unknown>
let bundle: Bundle

vi.mock('@/api/console', () => ({
  getGroupInstructions: vi.fn(async () => bundle),
  getGroupInstruction: vi.fn(),
  putGroupInstruction: vi.fn(),
  deleteGroupInstruction: vi.fn(),
  getInitGuide: vi.fn(async () => ({ body_md: '' })),
  setInitGuide: vi.fn(),
}))

function withInstruction(rights: Bundle): Bundle {
  return {
    group_id: 7,
    doctrine: '',
    doctrine_version: null,
    instructions: [{ id: 12, slug: 'facturation', title: 'Facturation', description: '', version: 26 }],
    ...rights,
  }
}

/** `canManage` = cheffe d'équipe, `canWrite` = membre — ce que `useTeamScope` dérive du
 *  rôle et que la vue passe en props. Ce sont les REPLIS : le bundle prime. */
async function mountCard(canManage: boolean, canWrite: boolean) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(GroupDoctrineCard, { groupId: 7, canManage, canWrite, section: 'procedures' })
  app.mount(host)
  await nextTick()
  await nextTick()   // laisse getGroupInstructions se résoudre
  const labels = [...host.querySelectorAll('button')].map((b) => (b.textContent ?? '').trim())
  return { labels, unmount: () => { app.unmount(); host.remove() } }
}

beforeEach(() => { bundle = withInstruction({ can_edit: false }) })

describe('GroupDoctrineCard — chaque geste lit le drapeau de son geste', () => {
  it('membre non-cheffe : l\'édition s\'affiche, la suppression NON', async () => {
    // Ce que le serveur sert à une membre : elle n'administre pas l'équipe
    // (`can_edit: false`, et la vue lui passe `can-manage=false`), mais elle écrit.
    bundle = withInstruction({
      can_edit: false, can_write_instructions: true, can_delete_instructions: false,
    })
    const { labels, unmount } = await mountCard(false, true)
    expect(labels).toContain('Edit')
    expect(labels).toContain('Procedure')     // créer, c'est écrire
    expect(labels).not.toContain('Delete')
    unmount()
  })

  it('cheffe d\'équipe : l\'édition ET la suppression', async () => {
    bundle = withInstruction({
      can_edit: true, can_write_instructions: true, can_delete_instructions: true,
    })
    const { labels, unmount } = await mountCard(true, true)
    expect(labels).toContain('Edit')
    expect(labels).toContain('Delete')
    unmount()
  })

  it('simple lectrice : ni l\'un ni l\'autre', async () => {
    bundle = withInstruction({
      can_edit: false, can_write_instructions: false, can_delete_instructions: false,
    })
    const { labels, unmount } = await mountCard(false, false)
    expect(labels).not.toContain('Edit')
    expect(labels).not.toContain('Delete')
    expect(labels).not.toContain('Procedure')
    unmount()
  })

  it('le bundle prime sur les props : un `false` SERVI ferme la porte', async () => {
    // La vue croit la membre autorisée (repli à vrai), le serveur dit non : c'est le
    // serveur qui gagne. Un `false` servi est un refus, pas une absence.
    bundle = withInstruction({
      can_edit: true, can_write_instructions: false, can_delete_instructions: false,
    })
    const { labels, unmount } = await mountCard(true, true)
    expect(labels).not.toContain('Edit')
    expect(labels).not.toContain('Delete')
    unmount()
  })

  it('serveur plus ancien (champs absents) : repli sur les props, l\'écran d\'avant', async () => {
    // Une absence n'est pas un « non » : on retombe sur le rôle dérivé par la vue —
    // donc une membre GARDE l'écriture que oto-dashboard#147 lui avait ouverte, et ne
    // gagne pas la suppression.
    bundle = withInstruction({ can_edit: false })
    const membre = await mountCard(false, true)
    expect(membre.labels).toContain('Edit')
    expect(membre.labels).toContain('Procedure')
    expect(membre.labels).not.toContain('Delete')
    membre.unmount()

    bundle = withInstruction({ can_edit: false })
    const cheffe = await mountCard(true, true)
    expect(cheffe.labels).toContain('Edit')
    expect(cheffe.labels).toContain('Delete')
    cheffe.unmount()

    bundle = withInstruction({ can_edit: false })
    const lectrice = await mountCard(false, false)
    expect(lectrice.labels).not.toContain('Edit')
    expect(lectrice.labels).not.toContain('Delete')
    lectrice.unmount()
  })
})
