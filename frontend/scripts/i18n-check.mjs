// Garde-fou i18n (oto#195) : une copy visible écrite EN DUR dans un gabarit `.vue` ne doit
// pas revenir. Toute copy passe par une clé (`t('…')` / `$t('…')`), en `fr` et en `en`.
//
// Ce que le contrôle lit : le GABARIT de chaque composant (compilé par @vue/compiler-sfc),
// ses nœuds de texte et ses attributs visibles statiques (title, placeholder, aria-label…).
// Un texte compte s'il porte au moins deux lettres — la ponctuation seule (« · », « → »)
// n'est pas de la copy. Il ne lit PAS le script (`toast('…')`) : c'est la limite connue.
//
// La dette : au premier passage, des centaines de chaînes étaient en dur. Un témoin qui naît
// rouge n'est jamais lu ; `scripts/i18n-dette.txt` porte donc, fichier par fichier, le nombre
// de chaînes en dur CONNUES. Le contrôle échoue :
//   - sur un fichier qui en a PLUS que sa ligne (ou qui n'y figure pas) — une chaîne ajoutée ;
//   - sur un fichier qui en a MOINS — la dette baisse, sa ligne doit baisser avec (`--write`).
// La liste ne fait que décroître. `node scripts/i18n-check.mjs --list <fichier>` les montre.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parse } from '@vue/compiler-sfc'

const ROOT = new URL('..', import.meta.url).pathname
const SRC = join(ROOT, 'src')
const DETTE = join(ROOT, 'scripts', 'i18n-dette.txt')
const ATTRS = new Set(['title', 'placeholder', 'aria-label', 'alt', 'label', 'sub', 'empty', 'hint',
  'description', 'search-placeholder', 'confirm-label', 'submit-label', 'none-label'])
const COPY = /\p{L}.*\p{L}/u

function vues(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? vues(p) : (n.endsWith('.vue') ? [p] : [])
  })
}

function enDur(fichier) {
  const { descriptor } = parse(readFileSync(fichier, 'utf8'), { filename: fichier })
  const out = []
  const walk = (node) => {
    if (!node) return
    if (node.type === 2 && COPY.test(node.content.trim())) out.push({ ligne: node.loc.start.line, texte: node.content.trim() })
    if (node.type === 1) {
      for (const p of node.props ?? []) {
        if (p.type === 6 && ATTRS.has(p.name) && p.value && COPY.test(p.value.content))
          out.push({ ligne: p.loc.start.line, texte: `${p.name}="${p.value.content}"` })
      }
    }
    for (const c of node.children ?? []) walk(c)
    for (const b of node.branches ?? []) walk(b)
  }
  walk(descriptor.template?.ast)
  return out
}

const mesure = new Map(vues(SRC).map((f) => [relative(ROOT, f), enDur(f)]))
const args = process.argv.slice(2)

if (args[0] === '--list') {
  for (const [f, l] of mesure) if (!args[1] || f.includes(args[1])) for (const x of l) console.log(`${f}:${x.ligne}  ${x.texte}`)
  process.exit(0)
}

const ecrire = () => {
  const lignes = [...mesure].filter(([, l]) => l.length).sort(([a], [b]) => a.localeCompare(b)).map(([f, l]) => `${f} ${l.length}`)
  const tete = readFileSync(DETTE, 'utf8').split('\n').filter((l) => l.startsWith('#')).join('\n')
  writeFileSync(DETTE, `${tete}\n${lignes.join('\n')}\n`)
  console.log(`dette réécrite : ${lignes.length} fichiers, ${[...mesure.values()].reduce((a, l) => a + l.length, 0)} chaînes`)
}
if (args[0] === '--write') { ecrire(); process.exit(0) }

const dette = new Map(readFileSync(DETTE, 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#'))
  .map((l) => { const i = l.lastIndexOf(' '); return [l.slice(0, i), Number(l.slice(i + 1))] }))
const fautes = []
for (const [f, l] of mesure) {
  const connu = dette.get(f) ?? 0
  if (l.length > connu) fautes.push(`${f} : ${l.length} chaînes en dur, ${connu} connues — une copy ajoutée hors i18n (voir --list ${f})`)
  else if (l.length < connu) fautes.push(`${f} : ${l.length} chaînes en dur, ${connu} inscrites — la dette a baissé, baisse sa ligne (--write)`)
}
for (const f of dette.keys()) if (!mesure.has(f)) fautes.push(`${f} : fichier disparu, retire sa ligne (--write)`)
const total = [...mesure.values()].reduce((a, l) => a + l.length, 0)
if (fautes.length) { console.error(fautes.join('\n')); process.exit(1) }
console.log(`i18n : ${total} chaînes en dur connues, aucune nouvelle.`)
