// Ce que le typecheck ne voit pas : l'état des VERROUS.
//
// Ce module ne garde rien — le serveur refuse — mais il décide si l'écran ARME le
// bouton d'envoi. S'il se trompe dans le sens permissif, l'écran affiche « prêt à
// partir » pour une campagne que le serveur refusera : il aura menti sur l'état du
// garde, et c'est le mensonge qui coûte. Ces tests fixent le sens de chaque refus.
import { describe, expect, it } from 'vitest'
import {
  BLOCKER_MESSAGE, contentMissing, countByLocale, emptyContent, sendBlockers,
  servedLocales, untestedLocales, type SendState,
} from './outreach'
import type { OutreachRow } from '@/types/api'

function compte(over: Partial<OutreachRow> = {}): OutreachRow {
  return {
    sub: 'u1', email: 'a@b.com', name: null, created_at: '2026-08-01 00:00:00',
    calls: 0, last_seen_at: null, previous_outreach: 0,
    locale: null, served_locale: 'en', locale_source: 'default',
    email_domain: 'b.com', accounts: 1, sent: null, reason: null, ...over,
  }
}

// Une campagne prête à partir : tous les verrous levés.
function pret(over: Partial<SendState> = {}): SendState {
  return {
    campaign: 'onboarding-2026-09',
    content: { ...emptyContent(), subject_en: 'Hi', body_en: 'Text' },
    locales: ['en'], selected: 23, total: 23, max: 200,
    fingerprint: 'abc123', testedLocales: ['en'], ...over,
  }
}

describe('servedLocales — la langue vient des DESTINATAIRES, pas de l\'interface', () => {
  it('une préférence déclarée l\'emporte sur le défaut de la campagne', () => {
    const rows = [
      compte({ sub: 'a', served_locale: 'en', locale_source: 'default' }),
      compte({ sub: 'b', locale: 'fr', served_locale: 'fr', locale_source: 'declared' }),
    ]
    expect(servedLocales(rows, 'en')).toEqual(['en', 'fr'])
    // Les deux comptes qui ont déclaré le français comptent : le message part donc
    // AUSSI en français, et il faudra l'avoir essayé.
    expect(countByLocale(rows)).toEqual({ en: 1, fr: 1 })
  })

  it('une audience vide sert quand même la langue par défaut — c\'est elle qu\'il faudra avoir essayée',
    () => {
      expect(servedLocales([], 'en')).toEqual(['en'])
      expect(servedLocales([], 'fr')).toEqual(['fr'])
    })
})

describe('sendBlockers — chaque verrou, dans son sens', () => {
  it('rien ne bloque une campagne complète, essayée et sous le plafond', () => {
    expect(sendBlockers(pret())).toEqual([])
  })

  it('sans nom de campagne : c\'est la clé du « une seule fois par personne »', () => {
    expect(sendBlockers(pret({ campaign: '   ' }))).toContain('campaign')
  })

  it('sans personne à qui écrire, il n\'y a rien à envoyer', () => {
    expect(sendBlockers(pret({ selected: 0 }))).toContain('audience')
  })

  it('une langue SERVIE sans son texte bloque — même si l\'autre langue est écrite',
    () => {
      const s = pret({ locales: ['en', 'fr'] })   // le contenu n'a que l'anglais
      expect(contentMissing(s.content, s.locales)).toEqual(['fr'])
      expect(sendBlockers(s)).toContain('content')
    })

  it('une langue NON servie n\'est pas exigée : un texte que personne ne lit finit bâclé',
    () => {
      expect(contentMissing(pret().content, ['en'])).toEqual([])
    })

  it('au-dessus du plafond, l\'envoi ne s\'arme pas — le plafond se juge sur l\'audience ENTIÈRE',
    () => {
      // 200 servis mais 3 000 au total : c'est le total qui compte, sinon l'opérateur
      // enverrait à 200 personnes en croyant en avoir couvert 3 000.
      expect(sendBlockers(pret({ selected: 200, total: 3000 }))).toContain('cap')
    })

  it('⚠️ sans essai reçu pour une langue servie, l\'envoi reste verrouillé', () => {
    const s = pret({ locales: ['en', 'fr'],
      content: { ...emptyContent(), subject_en: 'Hi', body_en: 'T',
        subject_fr: 'Salut', body_fr: 'T' },
      testedLocales: ['en'] })
    expect(untestedLocales(s)).toEqual(['fr'])
    expect(sendBlockers(s)).toContain('test')
  })

  it('⚠️ sans empreinte, on n\'affirme RIEN sur l\'essai — et surtout pas qu\'il tient',
    () => {
      // `fingerprint: null` = le texte a bougé depuis le dernier aperçu (ou il n'y en
      // a jamais eu). Même avec des langues « déjà essayées », le verrou retombe :
      // ces essais portaient sur un autre texte.
      const s = pret({ fingerprint: null, testedLocales: ['en', 'fr'] })
      expect(sendBlockers(s)).toContain('stale')
      expect(sendBlockers(s)).not.toContain('test')
    })

  it('chaque obstacle a une phrase qui dit QUOI FAIRE', () => {
    for (const b of sendBlockers(pret({ campaign: '', selected: 0, fingerprint: null }))) {
      expect(BLOCKER_MESSAGE[b].length).toBeGreaterThan(20)
    }
    // Elle dit le geste, pas la faute.
    expect(BLOCKER_MESSAGE.test).toContain('Envoie-toi l\'essai')
    expect(BLOCKER_MESSAGE.stale).toContain('invalide l\'essai')
  })
})
