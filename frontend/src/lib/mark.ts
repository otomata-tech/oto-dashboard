// Moteur de la marque Oto — le « O ouvert » (anneau à ouverture haut-droite, bouts
// arrondis en écho aux pills), framework-agnostique. Source unique partagée par le
// composant <OtoMark> (et exportable ailleurs sans dépendre de la lib Vue, ADR 0007).
// viewBox élargi à -80..80 pour loger la « corona » d'état autour de l'anneau.
//
//   cœur  = identité fixe (l'anneau ouvert), variantes quad / mono / olive
//   corona = strate vivante qui exprime l'état (idle/think/talk) — n'apparaît que
//            là où le mouvement a un sens réel (chargements, plus tard MCP Apps).
//            En `think`, l'anneau tourne lentement à l'inverse des points d'orbite.

export type MarkVariant = 'quad' | 'mono' | 'olive'
export type MarkState = 'static' | 'idle' | 'think' | 'talk'

export const MARK_VIEWBOX = '-80 -80 160 160'

const INK = '#2c2112'
const HAIR = '#dccfa8'
const SAFF = '#f0b41e'

// Dégradés chauds de l'anneau (mêmes valeurs que le DS « Oto Console »).
export const MARK_DEFS = `<defs>` +
  `<radialGradient id="otoSaff" cx="38%" cy="30%" r="82%"><stop offset="0%" stop-color="#ffd24a"/><stop offset="55%" stop-color="#f0b41e"/><stop offset="100%" stop-color="#cf8f10"/></radialGradient>` +
  `<radialGradient id="otoOliv" cx="38%" cy="30%" r="82%"><stop offset="0%" stop-color="#c0db4e"/><stop offset="55%" stop-color="#8aa620"/><stop offset="100%" stop-color="#5c7212"/></radialGradient>` +
  `</defs>`

// Cœur identitaire : l'anneau ouvert (ouverture haut-droite, bouts ronds).
// quad = dégradé chaud saffron, olive = dégradé olive, mono = saffron plat.
export function coreMark(variant: MarkVariant): string {
  let stroke: string
  if (variant === 'quad') stroke = 'url(#otoSaff)'
  else if (variant === 'olive') stroke = 'url(#otoOliv)'
  else stroke = SAFF
  return `<circle r="44" fill="none" stroke="${stroke}" stroke-width="28" stroke-linecap="round" stroke-dasharray="230 46" transform="rotate(-8)"/>`
}

// Corona d'état : vit hors du disque (r>58). Les classes portent l'animation
// (déclarées dans <OtoMark>) ; `static` ne dessine rien.
export function corona(state: MarkState): string {
  if (state === 'static') return ''
  if (state === 'idle') {
    return `<g class="oto-breathe">` +
      `<circle r="66" fill="none" stroke="${INK}" stroke-width="1.4"/>` +
      `<circle r="74" fill="none" stroke="${HAIR}" stroke-width="1"/></g>`
  }
  if (state === 'think') {
    const n = 10, r = 70
    let dots = ''
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n - Math.PI / 2
      dots += `<circle cx="${(r * Math.cos(a)).toFixed(1)}" cy="${(r * Math.sin(a)).toFixed(1)}" r="3.4" fill="${SAFF}"/>`
    }
    return `<g class="oto-orbit"><g class="oto-twinkle">${dots}</g></g>`
  }
  // talk
  const n = 36, r0 = 62, r1 = 76
  let ticks = ''
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n
    ticks += `<line x1="${(r0 * Math.cos(a)).toFixed(1)}" y1="${(r0 * Math.sin(a)).toFixed(1)}" x2="${(r1 * Math.cos(a)).toFixed(1)}" y2="${(r1 * Math.sin(a)).toFixed(1)}" style="animation-delay:${((i % 6) * 0.09).toFixed(2)}s"/>`
  }
  return `<g class="oto-wave" stroke="${SAFF}" stroke-width="2.2" stroke-linecap="round">${ticks}</g>`
}

// Contenu interne d'un <svg viewBox=MARK_VIEWBOX> : defs + corona + cœur.
// En `think`, l'anneau est enveloppé pour contre-tourner (classe oto-corespin).
export function markInner(variant: MarkVariant, state: MarkState): string {
  const core = state === 'think' ? `<g class="oto-corespin">${coreMark(variant)}</g>` : coreMark(variant)
  return MARK_DEFS + corona(state) + core
}

// SVG autonome (pour data-URI, export, favicon dynamique).
export function markSvg(variant: MarkVariant, state: MarkState = 'static'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX}">${markInner(variant, state)}</svg>`
}
