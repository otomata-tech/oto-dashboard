// Les deux règles du formulaire de credential — celles qui décident ce qui s'AFFICHE
// et ce qui s'ENVOIE. Elles sont un miroir du serveur : une erreur ici ne casse pas
// l'écran, elle écrit au coffre autre chose que ce que l'utilisateur voit.
import { describe, expect, it } from 'vitest'
import {
  keptSecrets, payloadFor, relevantFields, requiredAtInput, secretPlaceholder,
} from './credentialForm'
import type { CredentialField } from '@/types/api'

// Le connecteur `http` tel que le registre le déclare — le cas qui a motivé le lot.
const HTTP: CredentialField[] = [
  { name: 'base_url', label: 'URL de base', secret: false },
  { name: 'auth_mode', label: "Mode d'auth", secret: false, choices: ['bearer', 'header', 'basic', 'none'] },
  { name: 'label', label: 'Nom affiché', secret: false, required: false },
  { name: 'token', label: 'Token', secret: true, when: ['bearer', 'header'] },
  { name: 'header_name', label: 'Nom du header', secret: false, when: ['header'] },
  { name: 'username', label: 'Utilisateur', secret: false, when: ['basic'] },
  { name: 'password', label: 'Mot de passe', secret: true, when: ['basic'] },
]
const SERPER: CredentialField[] = [{ name: 'key', label: 'API key', secret: true }]

describe('relevantFields — ce que le mode rend pertinent', () => {
  it('bearer ne montre pas les champs des autres modes', () => {
    const names = relevantFields(HTTP, 'auth_mode', { auth_mode: 'bearer' }).map((f) => f.name)
    expect(names).toEqual(['base_url', 'auth_mode', 'label', 'token'])
  })

  it('none ne demande aucun secret', () => {
    const names = relevantFields(HTTP, 'auth_mode', { auth_mode: 'none' }).map((f) => f.name)
    expect(names).toEqual(['base_url', 'auth_mode', 'label'])
  })

  it('mode pas encore choisi : tout reste affiché, masquer serait deviner', () => {
    expect(relevantFields(HTTP, 'auth_mode', {})).toHaveLength(HTTP.length)
    expect(relevantFields(HTTP, 'auth_mode', { auth_mode: '' })).toHaveLength(HTTP.length)
  })

  it('la casse et les espaces de la valeur ne changent rien', () => {
    const names = relevantFields(HTTP, 'auth_mode', { auth_mode: ' Bearer ' }).map((f) => f.name)
    expect(names).toContain('token')
    expect(names).not.toContain('header_name')
  })

  it('sans discriminant déclaré, rien ne change — le cas des ~90 autres connecteurs', () => {
    expect(relevantFields(HTTP, undefined, { auth_mode: 'bearer' })).toEqual(HTTP)
    expect(relevantFields(SERPER, undefined, {})).toEqual(SERPER)
  })
})

describe('payloadFor — ce qu\'on envoie, et surtout ce qu\'on n\'envoie pas', () => {
  const bearer = relevantFields(HTTP, 'auth_mode', { auth_mode: 'bearer' })
  const stored = { base_url: 'http://x.test', auth_mode: 'bearer' }
  const KEPT = keptSecrets(HTTP, 'auth_mode', stored, true)
  const NEUF = keptSecrets(HTTP, 'auth_mode', stored, false)

  it('un secret CONSERVÉ laissé vide est OMIS — donc gardé au coffre', () => {
    const body = payloadFor(bearer, {
      base_url: 'http://127.0.0.1:8097', auth_mode: 'bearer', label: '', token: '',
    }, { kept: KEPT })
    expect(body).not.toHaveProperty('token')
    expect(body.base_url).toBe('http://127.0.0.1:8097')
  })

  it('un secret RESAISI part bien — on remplace quand on le demande', () => {
    const body = payloadFor(bearer, {
      base_url: 'https://api.test', auth_mode: 'bearer', label: '', token: 'NEUF',
    }, { kept: KEPT })
    expect(body.token).toBe('NEUF')
  })

  it('un champ NON secret vidé part vide — c\'est un effacement délibéré, il est visible', () => {
    const body = payloadFor(bearer, {
      base_url: 'https://api.test', auth_mode: 'bearer', label: '', token: '',
    }, { kept: KEPT })
    expect(body.label).toBe('')
  })

  it('à la PREMIÈRE pose, tout part — il n\'y a rien à conserver', () => {
    const body = payloadFor(bearer, {
      base_url: 'https://api.test', auth_mode: 'bearer', label: '', token: '',
    }, { kept: NEUF })
    expect(body).toHaveProperty('token', '')
  })

  it('un secret que le CHANGEMENT DE MODE rend nécessaire part, même vide', () => {
    // Il n'est pas au coffre : l'omettre laisserait le serveur refuser sans que
    // l'écran ait rien dit. Le formulaire le redemande d'abord.
    const basic = relevantFields(HTTP, 'auth_mode', { auth_mode: 'basic' })
    const body = payloadFor(basic, {
      base_url: 'https://api.test', auth_mode: 'basic', username: 'u', password: '',
    }, { kept: KEPT })
    expect(body).toHaveProperty('password', '')
  })

  it('les champs hors du mode ne sont jamais envoyés', () => {
    const body = payloadFor(bearer, {
      base_url: 'https://api.test', auth_mode: 'bearer', token: 'T',
      password: 'RESTE-DU-MODE-BASIC', header_name: 'x-api-key',
    }, { kept: NEUF })
    expect(body).not.toHaveProperty('password')
    expect(body).not.toHaveProperty('header_name')
  })
})

describe('keptSecrets — quels secrets on a le droit de laisser vides', () => {
  // Le credential tel qu'il est au coffre : mode `bearer`, jeton posé.
  const stored = { base_url: 'http://172.16.16.3:8097', auth_mode: 'bearer' }

  it('le secret du mode STOCKÉ est conservable — il est forcément au coffre', () => {
    expect(keptSecrets(HTTP, 'auth_mode', stored, true)).toEqual(new Set(['token']))
  })

  it('changer de mode redemande le secret : il n\'existe pas au coffre', () => {
    // L'utilisateur passe de `bearer` à `basic` : `password` n'a jamais été posé.
    const kept = keptSecrets(HTTP, 'auth_mode', stored, true)
    expect(kept.has('password')).toBe(false)
  })

  it('à la première pose, aucun secret n\'est conservable', () => {
    expect(keptSecrets(HTTP, 'auth_mode', stored, false).size).toBe(0)
  })

  it('ne rend JAMAIS un champ non secret : une URL de base reste requise', () => {
    const kept = keptSecrets(HTTP, 'auth_mode', stored, true)
    expect(kept.has('base_url')).toBe(false)
    expect(kept.has('auth_mode')).toBe(false)
  })

  it('sans discriminant, les secrets d\'un credential posé sont conservables', () => {
    expect(keptSecrets(SERPER, undefined, {}, true)).toEqual(new Set(['key']))
  })
})

describe('secretPlaceholder — dire que le vide conserve', () => {
  it('un secret conservé annonce qu\'on peut le laisser tranquille', () => {
    const token = HTTP.find((f) => f.name === 'token')!
    expect(secretPlaceholder(token, true)).toContain('laisse vide')
  })

  it('un secret que le changement de mode rend nécessaire ne promet rien', () => {
    // Sinon le champ dirait « laisse vide pour conserver » sur une valeur qui
    // n'existe pas — et le serveur refuserait après coup.
    const password = HTTP.find((f) => f.name === 'password')!
    expect(secretPlaceholder(password, false)).not.toContain('laisse vide')
  })

  it('à la première pose, l\'aide du champ reste l\'aide du champ', () => {
    const f: CredentialField = { name: 'token', label: 'Token', secret: true, help: 'colle le bearer' }
    expect(secretPlaceholder(f, false)).toBe('colle le bearer')
  })

  it('un champ non secret garde son aide, même sur un credential existant', () => {
    const f: CredentialField = { name: 'base_url', label: 'URL', secret: false, help: 'racine de l\'API' }
    expect(secretPlaceholder(f, true)).toBe('racine de l\'API')
  })
})

describe('l\'invariant qui relie les deux couches', () => {
  // Le défaut du 28/08 : l'envoi avait le droit d'omettre un champ que la validation
  // exigeait non vide. Le formulaire affichait « laisse vide pour conserver » ET
  // « requis » en rouge, et refusait de partir — le geste que tout ce lot devait
  // débloquer. Ce test tient les deux règles ensemble.
  const cases: Array<[string, string, boolean]> = [
    ['bearer', 'mode inchangé', true],
    ['basic', 'mode changé', true],
    ['none', 'sans secret', true],
    ['bearer', 'première pose', false],
  ]

  it.each(cases)('mode %s (%s) : un champ omissible n\'est jamais requis', (mode, _why, existing) => {
    const stored = { base_url: 'http://x.test', auth_mode: 'bearer' }
    const shown = relevantFields(HTTP, 'auth_mode', { auth_mode: mode })
    const kept = keptSecrets(HTTP, 'auth_mode', stored, existing)
    const vides = Object.fromEntries(shown.map((f) => [f.name, '']))
    const body = payloadFor(shown, vides, { kept })
    for (const f of shown) {
      const omis = !(f.name in body)
      if (omis) expect(requiredAtInput(f, kept)).toBe(false)
    }
  })

  it('et réciproquement : un champ requis part toujours dans le corps', () => {
    const stored = { base_url: 'http://x.test', auth_mode: 'bearer' }
    const shown = relevantFields(HTTP, 'auth_mode', { auth_mode: 'basic' })
    const kept = keptSecrets(HTTP, 'auth_mode', stored, true)
    const remplis = Object.fromEntries(shown.map((f) => [f.name, 'v']))
    const body = payloadFor(shown, remplis, { kept })
    for (const f of shown) {
      if (requiredAtInput(f, kept)) expect(body).toHaveProperty(f.name)
    }
  })
})
