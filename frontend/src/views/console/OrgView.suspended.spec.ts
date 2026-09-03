// Sonde de source, comme `roleGate.tripwire.spec.ts` — et pour la même raison : ce
// qu'elle garde ne casse rien quand on l'enlève, donc rien ne le rappellerait.
//
// La mise en pause d'un compte (oto-backend, 03/09) se pilotait par appel, sans aucun
// écran : un administrateur ne pouvait pas savoir qui était neutralisé dans son org.
// Le serveur sert `suspended` sur chaque membre depuis toujours ; personne ne le
// lisait.
//
// ⚠️ Ce que cette sonde NE fait pas : elle ne rend pas le composant. Elle tient que
// le champ est consommé et que la colonne voisine ne se lit plus « actif » — les deux
// faits qu'un remaniement ferait disparaître en silence.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'OrgView.vue'), 'utf8')

describe('OrgView — un compte en pause se voit', () => {
  it('lit `suspended` sur le membre et le marque', () => {
    expect(SRC, 'le marqueur de pause a disparu : la fonction redevient invisible, '
      + 'et un admin ne peut plus savoir qui est neutralisé dans son org')
      .toMatch(/m\.suspended/)
  })

  it('ne présente plus la colonne voisine comme un état de compte', () => {
    // `active` dit que cette org est l'org MAISON du membre — le serveur le signale
    // lui-même comme « un faux ami de longue date ». Deux marqueurs côte à côte, dont
    // l'un se lit « actif » alors qu'il parle d'autre chose, rendent la ligne
    // illisible : un membre en pause dont c'est l'org maison serait « actif » ET
    // « en pause ».
    expect(SRC, 'la colonne est redevenue « active » : elle se lira comme un état de '
      + 'compte, à côté du marqueur de pause qui en est un vraiment')
      .not.toMatch(/<th>active<\/th>/)
    expect(SRC).toMatch(/home org/)
  })
})
