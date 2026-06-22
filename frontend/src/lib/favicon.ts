import { markSvg, type MarkState } from './mark'

// Favicon dynamique : la marque d'Oto dans l'onglet reflète l'activité.
// `static` = le « o » au repos ; `think` = le « o » + corona (rappel que l'app
// travaille). On vise la variante quadri (cohérente avec le favicon du site).
// NB : les favicons SVG ne s'animent pas — c'est un échange d'état (frame), pas
// une animation ; suffisant pour signaler « Oto bosse » dans l'onglet.

function dataUri(state: MarkState): string {
  return 'data:image/svg+xml,' + encodeURIComponent(markSvg('quad', state))
}

export function setFaviconState(state: MarkState): void {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"][type="image/svg+xml"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    link.type = 'image/svg+xml'
    document.head.appendChild(link)
  }
  link.href = dataUri(state)
}
