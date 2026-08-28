// Les deux règles du formulaire de credential — celles qui décident ce qui s'AFFICHE
// et ce qui s'ENVOIE. Elles sont un miroir du serveur : une erreur ici ne casse pas
// l'écran, elle écrit au coffre autre chose que ce que l'utilisateur voit.
import { describe, expect, it } from 'vitest'
import { payloadFor, relevantFields, secretPlaceholder } from './credentialForm'
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

  it('sur un credential EXISTANT, un secret vide est OMIS — donc conservé', () => {
    const body = payloadFor(bearer, {
      base_url: 'http://127.0.0.1:8097', auth_mode: 'bearer', label: '', token: '',
    }, { existing: true })
    expect(body).not.toHaveProperty('token')
    expect(body.base_url).toBe('http://127.0.0.1:8097')
  })

  it('un secret RESAISI part bien — on remplace quand on le demande', () => {
    const body = payloadFor(bearer, {
      base_url: 'https://api.test', auth_mode: 'bearer', label: '', token: 'NEUF',
    }, { existing: true })
    expect(body.token).toBe('NEUF')
  })

  it('un champ NON secret vidé part vide — c\'est un effacement délibéré, il est visible', () => {
    const body = payloadFor(bearer, {
      base_url: 'https://api.test', auth_mode: 'bearer', label: '', token: '',
    }, { existing: true })
    expect(body.label).toBe('')
  })

  it('à la PREMIÈRE pose, tout part — il n\'y a rien à conserver', () => {
    const body = payloadFor(bearer, {
      base_url: 'https://api.test', auth_mode: 'bearer', label: '', token: '',
    }, { existing: false })
    expect(body).toHaveProperty('token', '')
  })

  it('les champs hors du mode ne sont jamais envoyés', () => {
    const body = payloadFor(bearer, {
      base_url: 'https://api.test', auth_mode: 'bearer', token: 'T',
      password: 'RESTE-DU-MODE-BASIC', header_name: 'x-api-key',
    }, { existing: false })
    expect(body).not.toHaveProperty('password')
    expect(body).not.toHaveProperty('header_name')
  })
})

describe('secretPlaceholder — dire que le vide conserve', () => {
  it('un secret déjà posé annonce qu\'on peut le laisser tranquille', () => {
    const token = HTTP.find((f) => f.name === 'token')!
    expect(secretPlaceholder(token, true)).toContain('laisse vide')
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
