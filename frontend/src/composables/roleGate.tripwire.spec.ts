import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// Tripwire oto-dashboard#122 : le rôle PLATEFORME (`me.role`) ne se teste QUE via les
// helpers source-unique de `useMe` (`isSuperAdmin` / `isPlatformOperator`). Tout
// `me.role ===` inliné ailleurs est un gate recopié qui finit par diverger — c'est le
// défaut vécu (un gate figé masquait le seul contrôle d'ouverture d'un connecteur).
//
// Exemptions (chemins relatifs à src/) :
//   - composables/useMe.ts        : LA source unique des helpers ;
//   - views/console/AccountProfileView.vue : AFFICHAGE du propre rôle (label + teinte),
//                                            pas une décision d'autorisation.
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')
const ALLOW = new Set([
  'composables/useMe.ts',
  'views/console/AccountProfileView.vue',
])
// `me` (pas `org_role`/`group_role`/`f.role`, qui sont d'autres axes légitimes).
const GATE = /\bme(?:\.value)?\??\.role\s*===/

function walk(dir: string): string[] {
  const out: string[] = []
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name)
    if (ent.isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

describe('tripwire : le rôle plateforme passe par le helper source-unique (#122)', () => {
  it('aucun `me.role ===` inliné hors de useMe.ts et de l’affichage de profil', () => {
    const offenders: string[] = []
    for (const file of walk(SRC)) {
      if (!/\.(ts|vue)$/.test(file) || file.endsWith('.spec.ts')) continue
      const rel = relative(SRC, file).replace(/\\/g, '/')
      if (ALLOW.has(rel)) continue
      if (GATE.test(readFileSync(file, 'utf8'))) offenders.push(rel)
    }
    expect(
      offenders,
      `gates de rôle inlinés (utiliser isSuperAdmin/isPlatformOperator de useMe) : ${offenders.join(', ')}`,
    ).toEqual([])
  })
})
