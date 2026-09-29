// Ce que le typecheck ne voit pas : la COPIE, et les formes interdites.
//
// Ce bloc existe pour réparer un écran qui vendait à des bénéficiaires ce qu'ils
// possédaient déjà. Ses règles ne portent donc pas sur des types mais sur ce qui
// s'affiche, à partir de `GET /avantages` (oto-commerce) :
//   1. l'avantage est NOMMÉ (le droit, traduit), pas réduit à « offert par Otomata » ;
//   2. une échéance dit son JOUR, une absence d'échéance ne dit rien ;
//   3. un don échu se lit comme échu, jamais « expire aujourd'hui » — et ne renvoie vers
//      l'offre que si elle est affichée dessous ;
//   4. l'essai en cours se montre comme ce qu'il est.
import { i18n } from '@/lib/i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h } from 'vue'
import BillingGranted from './BillingGranted.vue'
import type { CommerceAvantages } from '@/types/api.commerce'

function render(avantages: CommerceAvantages, offerBelow = true) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(h(BillingGranted, { avantages, offerBelow }))
  i18n.global.locale.value = 'fr'
  app.use(i18n).mount(host)
  // `fr-FR` sépare par une espace insécable dont la forme varie selon ICU : on normalise.
  const txt = (host.textContent ?? '').replace(/\p{Zs}/gu, ' ')
  return { host, txt, done: () => { app.unmount(); host.remove() } }
}

// Une horloge figée : les échéances se comptent depuis « maintenant ».
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-28T12:00:00Z')) })
afterEach(() => { vi.useRealTimers() })

describe('BillingGranted — l\'avantage se nomme, et son échéance se date', () => {
  it('nomme le droit offert et garde le badge « offert par Otomata »', () => {
    const v = render({ essai: null, dons: [{ droit: 'unipile', fin: null }] })
    // Le NOM d'abord : le jour où un second avantage s'offre, cette ligne dit lequel.
    expect(v.txt).toContain('Messagerie LinkedIn & WhatsApp (Unipile)')
    expect(v.txt).toContain('offert par Otomata')
    expect(v.txt).toContain('pour toute l\'organisation')
    v.done()
  })

  it('un droit inconnu de cet écran se montre sous son code, il ne disparaît pas', () => {
    const v = render({ essai: null, dons: [{ droit: 'droit_futur', fin: null }] })
    expect(v.txt).toContain('droit_futur')
    v.done()
  })

  it('sans terme : aucune échéance annoncée — et surtout pas « aucune échéance »', () => {
    const v = render({ essai: null, dons: [{ droit: 'unipile', fin: null }] })
    expect(v.txt).not.toContain('Jusqu\'au')
    expect(v.txt).not.toContain('aucune échéance')
    v.done()
  })

  it('échéance lointaine : le JOUR est dit', () => {
    const v = render({ essai: null, dons: [{ droit: 'platform_unmetered', fin: '2027-03-15T00:00:00+00:00' }] })
    expect(v.txt).toContain('Jusqu\'au 15 mars 2027.')
    v.done()
  })

  it('échéance proche : les jours restants sont comptés', () => {
    const v = render({ essai: null, dons: [{ droit: 'unipile', fin: '2026-10-08T12:00:00+00:00' }] })
    expect(v.txt).toContain('il reste 10 jours')
    v.done()
  })

  it('don ÉCHU : il a pris fin, et on dit par où le rouvrir', () => {
    const v = render({ essai: null, dons: [{ droit: 'unipile', fin: '2026-09-01T00:00:00+00:00' }] })
    expect(v.txt).toContain('Cette offre a pris fin le 1er septembre 2026.')
    expect(v.txt).toContain('Choisir un abonnement ci-dessous rouvre l\'accès.')
    expect(v.txt).not.toContain('dernier jour')
    v.done()
  })

  it('don ÉCHU sans offre dessous (abonné, sous contrat) : échu, sans renvoyer vers une offre absente', () => {
    const v = render({ essai: null, dons: [{ droit: 'unipile', fin: '2026-09-01T00:00:00+00:00' }] }, false)
    expect(v.txt).toContain('Cette offre a pris fin le 1er septembre 2026.')
    expect(v.txt).not.toContain('ci-dessous')
    expect(v.txt).not.toContain('Choisir un abonnement')
    v.done()
  })

  it('l\'essai en cours vient en tête, avec sa date de fin', () => {
    const v = render({ essai: { fin: '2026-10-05T00:00:00+00:00' }, dons: [{ droit: 'unipile', fin: null }] })
    expect(v.txt).toContain('Essai gratuit')
    expect(v.txt.indexOf('Essai gratuit')).toBeLessThan(v.txt.indexOf('Messagerie LinkedIn'))
    expect(v.txt).toContain('il reste 6 jours')
    v.done()
  })
})
