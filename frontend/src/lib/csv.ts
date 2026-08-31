// Export CSV (RFC 4180) d'un jeu de rows datastore (oto-dashboard#18). BOM UTF-8 en
// tête pour qu'Excel lise les accents ; une colonne composite (liste, objet) est
// APLATIE en texte lisible — pas sérialisée en JSON brut dans la cellule
// (oto-dashboard#137 : `[{"nom":"…","email":"…"}]` dans une cellule n'est pas un
// livrable, c'était juste vrai tant que toute cellule portait un scalaire).

/** Rend une valeur composite lisible : items séparés par « | », champs d'un item
 * par « , », chaque champ en `clé: valeur` — récursif pour une liste imbriquée. */
function flatten(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (Array.isArray(v)) return v.map(flatten).join(' | ')
  if (typeof v === 'object')
    return Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => `${k}: ${flatten(val)}`).join(', ')
  return String(v)
}

function esc(v: unknown): string {
  const s = flatten(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function rowsToCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const head = columns.map(esc).join(',')
  const body = rows.map((r) => columns.map((c) => esc(r[c])).join(',')).join('\r\n')
  // `rows.length`, pas la vacuité de `body` : une seule ligne dont toutes les
  // colonnes rendent vide (valeurs nulles, ou colonnes = []) produit un `body`
  // de chaîne vide indiscernable de « aucune ligne » — la ligne disparaissait.
  return rows.length ? `${head}\r\n${body}` : head
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
