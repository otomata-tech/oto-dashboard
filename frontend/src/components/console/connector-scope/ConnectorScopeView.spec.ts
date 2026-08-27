// Un dialogue hébergé reçoit la spec ENTIÈRE — pas une liste de props recopiée.
//
// La vue hébergeait `CredentialFieldsDialog` en énumérant ses props une par une.
// Quand la spec s'est enrichie (le champ « nom du compte » du multi-compte, puis
// l'aide « où trouver ces identifiants ? »), la liste n'a pas suivi : le dialogue
// recevait `undefined`, se rendait sans broncher, et les deux fonctionnalités
// n'existaient tout simplement pas à l'écran — codées, testées unitairement,
// déployées. Deux fois le même jour (27/08).
//
// Les tests de composant ne pouvaient pas le voir : ils montent le dialogue avec
// ses props, donc court-circuitent précisément le maillon cassé. Ce test-ci garde
// le MONTAGE : la vue passe la spec en bloc.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// `import.meta.url` n'est pas un chemin fichier sous vitest (transformé) : on part
// de la racine du projet, que vitest expose.
const VUE = readFileSync(
  resolve(process.cwd(), 'src/components/console/connector-scope/ConnectorScopeView.vue'),
  'utf-8')

// Les dialogues hébergés ici, avec l'objet de spec qui les décrit.
const HÉBERGÉS: [string, string][] = [
  ['CredentialFieldsDialog', 'credSpec'],
  ['FormDialog', 'formDialog'],
]

describe('ConnectorScopeView — les dialogues hébergés', () => {
  it.each(HÉBERGÉS)('%s reçoit `%s` en bloc', (composant, spec) => {
    const balise = VUE.match(new RegExp(`<${composant}\\b[^>]*>`, 's'))?.[0]
    expect(balise, `<${composant}> introuvable dans la vue`).toBeTruthy()
    expect(balise, `<${composant}> doit recevoir v-bind="${spec}"`).toContain(`v-bind="${spec}"`)
    // Aucune prop de la spec recopiée à la main : c'est la recopie qui se périme.
    const àLaMain = balise!.match(new RegExp(`:[a-z-]+="${spec}\\.`, 'g')) ?? []
    expect(àLaMain, `props recopiées : ${àLaMain.join(', ')}`).toEqual([])
  })
})
