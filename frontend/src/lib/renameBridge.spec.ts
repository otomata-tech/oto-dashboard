// Le PONT DE RENOMMAGE `namespace` → `datastore` (lot A, 08/09/2026) et — surtout —
// ce qui le fera RETIRER.
//
// oto bascule ses clés de réponse à sec, sans fenêtre où les deux noms marchent.
// Le pont d'`api/console.ts` accepte les deux le temps de la bascule. Un pont qu'on
// ne retire pas devient permanent, et un pont permanent masque le renommage suivant
// exactement comme celui-ci aurait masqué celui-là.
//
// Le retrait n'est donc pas une note dans un journal : c'est le dernier test de ce
// fichier. Il devient ROUGE le jour où le contrat commité ne déclare plus l'ancien
// chemin — c'est-à-dire au premier `npm run api:refresh` après la bascule.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { servedName, servedList } from '@/api/console'

describe('le pont lit les deux noms', () => {
  it('lit l\'ancien nom, que le backend sert encore aujourd\'hui', () => {
    expect(servedName({ namespace: 'leads' }, 'test')).toBe('leads')
    expect(servedList({ namespaces: [1, 2] }, 'test')).toEqual([1, 2])
  })

  it('lit le nouveau nom, que le backend servira après la bascule', () => {
    expect(servedName({ datastore: 'leads' }, 'test')).toBe('leads')
    expect(servedList({ datastores: [1, 2] }, 'test')).toEqual([1, 2])
  })

  // Le point de tout le lot. Avant, `(data.namespaces ?? [])` rendait une LISTE VIDE
  // sur une clé disparue : écran blanc, aucune erreur, et les gestes destructifs
  // escamotés au lieu de mal tirer. Un renommage inattendu doit casser franchement.
  it('LÈVE quand aucun des deux noms n\'est là, au lieu de rendre du vide', () => {
    expect(() => servedName({}, 'entrée')).toThrow(/datastore.*namespace/)
    expect(() => servedList({}, 'liste')).toThrow(/datastores.*namespaces/)
    expect(() => servedList({ namespaces: null }, 'liste')).toThrow()
  })
})

describe('le pont doit-il encore exister ?', () => {
  const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const contrat = JSON.parse(
    readFileSync(join(RACINE, 'openapi/oto-openapi.json'), 'utf8'),
  ) as { paths: Record<string, unknown> }

  // ⚠️ Ce témoin couvre DEUX dépôts, pas seulement celui-ci. Le front partenaire
  // (`Tulina-team/tulina-app-front`) porte le même pont, et son intégration continue
  // ne nous appartient pas : y poser un contrôle engagerait leur dépôt. Un témoin qui
  // vit chez le consommateur doit être accepté par lui ; celui-ci vit chez nous, à
  // côté du contrat servi — et c'est nous qui savons quand l'ancien nom disparaît.
  // D'où un message d'échec qui nomme les deux ponts à retirer, pas un seul.
  const AU_RETRAIT = [
    'oto ne sert plus /api/datastore/namespaces : la bascule namespace → datastore a',
    'atterri. DEUX ponts sont à retirer, et ce test est le seul endroit qui le dit :',
    '',
    '  1. ICI (oto-dashboard) : servedName, servedList, ServedEntry, normaliseEntries',
    '     et leurs appels dans src/api/console.ts ; la clé datastore_exists doublée',
    '     dans src/locales/{fr,en}.json ; la section du pont dans docs/datastore.md ;',
    '     puis ce fichier.',
    '  2. CHEZ LE PARTENAIRE (Tulina-team/tulina-app-front, prévenir Julien) :',
    '     servedName/servedList dans src/lib/datastore-api.ts ; les codes doublés dans',
    '     datastore-cell.tsx et datastore-table.tsx ; les trois case doublés dans',
    '     components/datastore/activity-feed.tsx.',
    '',
    'Ne PAS retirer un seul des deux : le pont restant masquerait le renommage suivant.',
  ].join('\n')

  it('oto sert encore l\'ancien chemin — sinon, RETIRER LES DEUX PONTS', () => {
    expect(Object.keys(contrat.paths).includes('/api/datastore/namespaces'), AU_RETRAIT)
      .toBe(true)
  })
})
