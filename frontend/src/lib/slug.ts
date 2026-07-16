// Slugification partagée (ex-doublon : local à CreateSkillModal + absent du flux de
// publication MCP). Dé-accentue, minuscule, compresse tout non-alphanumérique en un
// séparateur, et trim les séparateurs de bord.
//
// `sep` = séparateur : `-` pour un sous-domaine (règle backend
// `^[a-z0-9]([a-z0-9-]+[a-z0-9])$`, min 3 car.), `_` pour un slug de procédure.
export function slugify(
  input: string | null | undefined,
  opts: { sep?: string; maxLen?: number } = {},
): string {
  if (!input) return ''
  const sep = opts.sep ?? '-'
  const esc = sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  let s = input
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '') // retire les diacritiques
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, sep)
    .replace(new RegExp(`^${esc}+|${esc}+$`, 'g'), '')
  if (opts.maxLen) s = s.slice(0, opts.maxLen).replace(new RegExp(`${esc}+$`), '')
  return s
}
