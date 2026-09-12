// La cellule de liste rend le badge d'un `CellVM` APRÈS le libellé du verdict (oto#166) :
// sans ce rendu, l'adaptateur peut porter la provenance sans que personne ne la lise.
import { describe, expect, it } from 'vitest'
import { createApp, h } from 'vue'
import ConnectorScopeCell from './ConnectorScopeCell.vue'
import type { CellVM } from './adapter'

function rendre(vm: CellVM) {
  const host = document.createElement('div')
  const app = createApp({ render: () => h(ConnectorScopeCell, { vm }) })
  app.mount(host)
  return { host, unmount: () => app.unmount() }
}

describe('ConnectorScopeCell — badge', () => {
  it('rend le badge après le libellé', () => {
    const { host, unmount } = rendre({ dot: 'olive', label: 'Actif · clé d’org', badge: { text: 'installé par ton organisation' } })
    const ligne = host.querySelector('.csc')!
    expect(ligne.lastElementChild?.classList.contains('tag')).toBe(true)
    expect(ligne.lastElementChild?.textContent?.trim()).toBe('installé par ton organisation')
    unmount()
  })

  it('sans badge, aucun tag ajouté', () => {
    const { host, unmount } = rendre({ dot: 'olive', label: 'Actif · ta clé' })
    expect(host.querySelector('.tag')).toBeNull()
    unmount()
  })
})
