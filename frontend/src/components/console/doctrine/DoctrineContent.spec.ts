// Rendu d'une procédure : les lignes d'un paragraphe se joignent.
//
// Le rendu est maison (périmètre étroit, chips `<tool:slug>` que ne saurait faire un
// parseur nu) et traitait chaque ligne source comme un paragraphe. Conséquence : tout
// auteur qui wrappe à 80 colonnes — c'est-à-dire tout le monde — voyait son texte haché,
// et devait écrire un paragraphe sur une seule longue ligne pour obtenir un rendu normal.
//
// Ces tests fixent la règle markdown : une ligne vide sépare deux paragraphes, un simple
// retour à la ligne n'en sépare pas. Et ils vérifient que les blocs qui doivent RESTER
// séparés (titres, puces) ferment bien le paragraphe en cours.
import { describe, expect, it } from 'vitest'
import { createApp, nextTick } from 'vue'
import DoctrineContent from './DoctrineContent.vue'

async function render(text: string) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(DoctrineContent, { text, reg: {} })
  app.mount(host)
  await nextTick()
  return {
    paras: [...host.querySelectorAll('p.oto-p')].map((n) => n.textContent ?? ''),
    headings: host.querySelectorAll('.oto-h').length,
    bullets: host.querySelectorAll('.oto-li').length,
    unmount: () => { app.unmount(); host.remove() },
  }
}

describe('DoctrineContent — découpage en blocs', () => {
  it('joint les lignes consécutives en un seul paragraphe', async () => {
    const r = await render('Une phrase wrappée\nsur trois lignes\ncomme dans un fichier.')
    expect(r.paras).toEqual(['Une phrase wrappée sur trois lignes comme dans un fichier.'])
    r.unmount()
  })

  it('sépare deux paragraphes sur une ligne vide', async () => {
    const r = await render('Premier paragraphe.\n\nSecond paragraphe.')
    expect(r.paras).toEqual(['Premier paragraphe.', 'Second paragraphe.'])
    r.unmount()
  })

  it('un titre ferme le paragraphe en cours', async () => {
    const r = await render('Du texte avant.\n## Un titre\nDu texte après.')
    expect(r.paras).toEqual(['Du texte avant.', 'Du texte après.'])
    expect(r.headings).toBe(1)
    r.unmount()
  })

  it('une puce ferme le paragraphe, et reste une puce par ligne', async () => {
    const r = await render('Intro.\n- premier\n- second')
    expect(r.paras).toEqual(['Intro.'])
    expect(r.bullets).toBe(2)
    r.unmount()
  })

  it('plusieurs lignes vides ne créent pas de paragraphe fantôme', async () => {
    const r = await render('Un.\n\n\n\nDeux.')
    expect(r.paras).toEqual(['Un.', 'Deux.'])
    r.unmount()
  })

  it('un texte vide ne rend aucun bloc', async () => {
    const r = await render('')
    expect(r.paras).toEqual([])
    r.unmount()
  })
})
