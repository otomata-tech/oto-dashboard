// Embed d'un DATASTORE dans une page (oto/#6 top5 #5).
//
// La donnée structurée vit dans le datastore (source de vérité) ; une page l'AFFICHE
// via un bloc :
//
//     ```oto-data
//     nom-ou-id-du-tableau
//     ```
//
// Le viewer découpe le corps en segments prose (MarkdownView) + embeds (DatastoreTable)
// → tableau TOUJOURS à jour, jamais recopié à la main. Bloc inerte en markdown standard
// (rendu comme un code block ailleurs → dégradation gracieuse).

export type DocSegment =
  | { type: 'md'; text: string }
  | { type: 'data'; ns: string }

const EMBED = /```oto-data[^\S\n]*\n([^\n`]+?)[^\S\n]*\n?```/g

export function parseDocSegments(md: string): DocSegment[] {
  const out: DocSegment[] = []
  let last = 0
  let m: RegExpExecArray | null
  EMBED.lastIndex = 0
  while ((m = EMBED.exec(md)) !== null) {
    if (m.index > last) out.push({ type: 'md', text: md.slice(last, m.index) })
    out.push({ type: 'data', ns: (m[1] ?? '').trim() })
    last = EMBED.lastIndex
  }
  if (last < md.length) out.push({ type: 'md', text: md.slice(last) })
  // Un corps sans embed = un seul segment prose (comportement inchangé).
  return out.length ? out : [{ type: 'md', text: md }]
}

export function hasDataEmbed(md: string): boolean {
  EMBED.lastIndex = 0
  return EMBED.test(md)
}
