// Moteur de la marque Oto — le « o » (disque chaud percé), framework-agnostique.
// Source unique partagée par le composant <OtoMark> (et exportable ailleurs sans
// dépendre de la lib Vue, cf. ADR 0007). Fidèle au favicon : viewBox élargi à
// -80..80 pour loger la « corona » d'état autour du disque (r=58, trou « o » r=26).
//
//   cœur  = identité fixe (disque + trou « o »), variantes quad / mono / olive
//   corona = strate vivante qui exprime l'état (idle/think/talk) — n'apparaît que
//            là où le mouvement a un sens réel (chargements, plus tard MCP Apps).

export type MarkVariant = 'quad' | 'mono' | 'olive'
export type MarkState = 'static' | 'idle' | 'think' | 'talk'

export const MARK_VIEWBOX = '-80 -80 160 160'

const CREAM = '#fefcf5'
const INK = '#2c2112'
const HAIR = '#dccfa8'
const SAFF = '#f0b41e'

// Dégradés repris tels quels du favicon canonique (oto.ninja / oto.zone).
export const MARK_DEFS = `<defs>` +
  `<radialGradient id="otoSaff" cx="38%" cy="32%" r="78%"><stop offset="0%" stop-color="#ffd24a"/><stop offset="55%" stop-color="#f0b41e"/><stop offset="100%" stop-color="#c4870c"/></radialGradient>` +
  `<radialGradient id="otoTerr" cx="38%" cy="32%" r="78%"><stop offset="0%" stop-color="#f56a2d"/><stop offset="55%" stop-color="#d63d0a"/><stop offset="100%" stop-color="#9c2c06"/></radialGradient>` +
  `<radialGradient id="otoOliv" cx="38%" cy="32%" r="78%"><stop offset="0%" stop-color="#c0db4e"/><stop offset="55%" stop-color="#8aa620"/><stop offset="100%" stop-color="#5c7212"/></radialGradient>` +
  `<radialGradient id="otoCob" cx="38%" cy="32%" r="78%"><stop offset="0%" stop-color="#4f9be0"/><stop offset="55%" stop-color="#1f6dba"/><stop offset="100%" stop-color="#124a80"/></radialGradient>` +
  `<clipPath id="otoCq"><circle r="58"/></clipPath>` +
  `</defs>`

// Cœur identitaire : le disque + le trou crème (= le « o » d'oto). Inchangé.
export function coreMark(variant: MarkVariant): string {
  let disc: string
  if (variant === 'quad') {
    disc = `<g clip-path="url(#otoCq)">` +
      `<rect x="-58" y="-58" width="58" height="58" fill="url(#otoSaff)"/>` +
      `<rect x="0" y="-58" width="58" height="58" fill="url(#otoTerr)"/>` +
      `<rect x="-58" y="0" width="58" height="58" fill="url(#otoCob)"/>` +
      `<rect x="0" y="0" width="58" height="58" fill="url(#otoOliv)"/></g>`
  } else if (variant === 'olive') {
    disc = `<circle r="58" fill="url(#otoOliv)"/>`
  } else {
    disc = `<circle r="58" fill="url(#otoSaff)"/>`
  }
  return disc + `<circle r="26" fill="${CREAM}"/>`
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
export function markInner(variant: MarkVariant, state: MarkState): string {
  return MARK_DEFS + corona(state) + coreMark(variant)
}

// SVG autonome (pour data-URI, export, favicon dynamique).
export function markSvg(variant: MarkVariant, state: MarkState = 'static'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX}">${markInner(variant, state)}</svg>`
}
