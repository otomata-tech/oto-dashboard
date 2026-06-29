// Export CSV (RFC 4180) d'un jeu de rows datastore (oto-dashboard#18). BOM UTF-8 en
// tête pour qu'Excel lise les accents ; objets sérialisés en JSON dans la cellule.

function esc(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function rowsToCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const head = columns.map(esc).join(',')
  const body = rows.map((r) => columns.map((c) => esc(r[c])).join(',')).join('\r\n')
  return body ? `${head}\r\n${body}` : head
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
