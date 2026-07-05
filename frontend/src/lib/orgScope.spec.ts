// Garde-fou du scope d'org (ADR 0023) — pendant front du tripwire backend
// `test_org_seam_tripwire.py`.
//
// Le contexte d'org de l'onglet (switch d'org du dashboard) voyage dans les
// headers `X-Oto-Org`/`X-Oto-Group` injectés par le client central (`api()` /
// `apiUpload()` de src/api.ts, via viewHeaders()). Un `fetch(` nu dans un
// composant contourne cette injection → la requête part SANS le contexte → le
// backend retombe sur l'org maison → mélange d'orgs silencieux (« je regarde
// l'org B mais j'édite l'org A »).
//
// Ce test fige les fichiers autorisés à appeler fetch directement. Un nouvel
// usage casse le test → passer par api()/apiUpload(), ou justifier l'ajout.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const SRC = join(__dirname, '..')

// fichier (relatif à src/) -> raison d'un fetch direct légitime.
const ALLOWED: Record<string, string> = {
  'api.ts': 'LE client central : api()/apiPublic()/apiUpload() — injecte viewHeaders().',
  'lib/account.ts': 'Logto Account API (/api/my-account/*, MFA) — user-scopé par nature, un contexte org n\'y a pas de sens.',
  'components/console/AttachmentViewer.vue':
    'Fetch du CONTENU d\'une pièce jointe via son URL S3 présignée (download_url/public_url) — hors API backend, des headers X-Oto-* y seraient étrangers.',
}

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* walk(p)
    else if (/\.(ts|vue)$/.test(name) && !name.endsWith('.spec.ts')) yield p
  }
}

describe('scope d\'org — pas de fetch hors client central', () => {
  it('fetch( n\'apparaît que dans les fichiers autorisés', () => {
    const offenders: string[] = []
    for (const file of walk(SRC)) {
      const rel = relative(SRC, file)
      if (rel in ALLOWED) continue
      const text = readFileSync(file, 'utf-8')
      // appel réel `fetch(` — pas les mentions en commentaire/string descriptive
      const lines = text.split('\n')
      lines.forEach((l, i) => {
        const code = l.replace(/\/\/.*$/, '')
        if (/(?<![\w.])fetch\(/.test(code)) offenders.push(`${rel}:${i + 1}`)
      })
    }
    expect(offenders, [
      'fetch( nu détecté hors du client central : la requête partira SANS les',
      'headers X-Oto-Org/X-Oto-Group (contexte d\'org de l\'onglet) → scope org',
      'maison silencieux. Utiliser api()/apiUpload() de src/api.ts, ou ajouter',
      'le fichier à ALLOWED avec une raison si le fetch est réellement hors-scope.',
    ].join(' ')).toEqual([])
  })
})
