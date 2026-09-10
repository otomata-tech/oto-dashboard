import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

// Tripwire : **le modèle « base de connaissance » n'existe plus.** Il ne doit pas
// revenir dans un texte que le dashboard sert.
//
// Ce que le produit fait aujourd'hui : des **projets** et des **documents**. Les
// documents d'une org vivent dans un projet d'org ordinaire — même substrat, même UI
// wiki que n'importe quel projet. Il n'y a plus de « KB », plus d'entité à part, et le
// verbe MCP `oto_kb` est retiré côté plateforme (v1.257.0). Un écran qui promet une
// « base de connaissance » promet donc quelque chose qui n'existe pas.
//
// ── Ce que ce contrôle parcourt ──────────────────────────────────────────────
// Tout `frontend/index.html` + tout `.vue`, `.ts` et `.json` sous `frontend/src`,
// **commentaires retirés**. La règle porte sur ce qui peut atteindre un écran : le
// texte des templates et les littéraux de chaîne. Un commentaire qui raconte
// l'histoire de l'ancien modèle reste permis — il n'est jamais servi (la
// minification l'emporte), et interdire d'expliquer le passé n'aide personne.
//
// ── Ce qu'il ne parcourt PAS, et pourquoi ────────────────────────────────────
//  • `types/api.generated.ts` — fichier DÉRIVÉ du contrat backend, jamais écrit ici,
//    et composé de types seuls : TypeScript les efface au build, aucun octet n'en
//    est servi. Le backend y garde délibérément une mention historique (« what used
//    to be called its knowledge base ») sur `/api/me/kb` ; la recopier n'est pas
//    notre décision, et elle n'atteint aucun écran.
//  • ce fichier — il cite les motifs qu'il interdit.
//
// ── Le jeton « KB » n'est PAS banni ──────────────────────────────────────────
// Il est ambigu : il désigne aussi une taille. Le dépôt écrit déjà `Ko`
// (`ProjectViewer.vue`, kilo-octets) et « si KO » (échec, `imageUpload.ts`) — bannir
// le jeton ferait rougir ce contrôle sur des lignes qui n'ont rien à voir. On vise
// le SENS : les tournures qui nomment le concept, et le verbe retiré `oto_kb`.
// Même prudence de l'autre côté : `zero-knowledge` (ADR 0032, partage public
// chiffré) est une propriété cryptographique, pas ce modèle-ci.
//
// ── L'adresse `/knowledge`, elle, RESTE ──────────────────────────────────────
// Elle a été distribuée ; une adresse distribuée doit continuer de résoudre. Ce qui
// disparaît est le vocabulaire servi, pas la compatibilité des liens. Le second test
// de ce fichier l'exige positivement, pour qu'un futur ménage ne l'emporte pas.

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')
const FRONTEND = join(SRC, '..')

const EXCLUS = new Set([
  join('types', 'api.generated.ts'),
  join('lib', 'vocabulaire.tripwire.spec.ts'),
])

const INTERDITS: { motif: RegExp; quoi: string }[] = [
  { motif: /bases?\s+de\s+connaissances?/gi, quoi: '« base de connaissance »' },
  { motif: /knowledge\s+bases?/gi, quoi: '“knowledge base”' },
  { motif: /\bconnaissances?\b/gi, quoi: 'le nom « connaissance »' },
  // `zero-knowledge` est l'AUTRE sens (une propriété cryptographique, ADR 0032) :
  // le partage public chiffré n'a rien à voir avec le modèle retiré.
  { motif: /(?<!zero-)\bknowledge\b/gi, quoi: 'le nom “knowledge”' },
  { motif: /\boto_kb\b/g, quoi: 'le verbe MCP retiré `oto_kb`' },
]

// L'ADRESSE, pas le vocabulaire : on la retire du texte avant de chercher.
const ADRESSE_TOLEREE = /(['"`])\/knowledge\1/g

// Commentaires sur leur PROPRE ligne (le style du dépôt) — jamais un `//` pris
// dans une chaîne (`https://…`), qui n'est pas en tête de ligne.
function sansCommentaires(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l))
    .join('\n')
}

function fichiers(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return fichiers(p)
    return /\.(vue|ts|json)$/.test(e.name) ? [p] : []
  })
}

const PARCOURUS = [
  ...fichiers(SRC).filter((p) => !EXCLUS.has(relative(SRC, p))),
  join(FRONTEND, 'index.html'),
]

describe('vocabulaire retiré — « base de connaissance »', () => {
  it('parcourt bien tout le source écrit à la main (garde contre un zéro vide)', () => {
    // Un zéro ne vaut que si on sait ce qu'il couvre : si ce compte s'effondre, le
    // test suivant devient vert sans plus rien mesurer.
    expect(PARCOURUS.length).toBeGreaterThan(150)
    expect(PARCOURUS.some((p) => p.endsWith(`${sep}locales${sep}fr.json`))).toBe(true)
    expect(PARCOURUS.some((p) => p.endsWith(`${sep}locales${sep}en.json`))).toBe(true)
    expect(PARCOURUS.some((p) => p.endsWith('index.html'))).toBe(true)
  })

  it('n’apparaît dans aucun texte servi, dans aucune des deux langues', () => {
    const trouves: string[] = []
    for (const p of PARCOURUS) {
      const texte = sansCommentaires(readFileSync(p, 'utf8')).replace(ADRESSE_TOLEREE, '$1/$1')
      for (const { motif, quoi } of INTERDITS) {
        for (const m of texte.matchAll(motif)) {
          const a = Math.max(0, m.index - 60)
          trouves.push(`${relative(FRONTEND, p)} — ${quoi} : …${texte.slice(a, m.index + m[0].length + 60).replace(/\s+/g, ' ')}…`)
        }
      }
    }
    expect(trouves, 'le modèle est « projets » et « documents » : réécris la phrase, ne la traduis pas').toEqual([])
  })

  it('garde l’adresse /knowledge, qui doit continuer de résoudre', () => {
    const routes = readFileSync(join(SRC, 'router', 'index.ts'), 'utf8')
    expect(routes).toMatch(/\{\s*path:\s*'\/knowledge',\s*redirect:\s*'\/documents'\s*\}/)
  })
})
