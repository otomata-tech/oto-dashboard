// Ce que le typecheck ne voit pas : la COPIE, et les formes interdites.
//
// Ces deux blocs existent pour réparer un écran qui vendait à des bénéficiaires ce
// qu'ils possédaient déjà. Leurs règles ne portent donc pas sur des types mais sur
// ce qui s'affiche :
//   1. l'avantage est NOMMÉ, pas réduit à « offert par Otomata » ;
//   2. une échéance dit son JOUR, une absence d'échéance ne dit rien ;
//   3. un don échu se lit comme échu, jamais « expire aujourd'hui » ;
//   4. l'usage ne se divise pas — ni barre, ni jauge, ni pourcentage.
import { describe, expect, it } from 'vitest'
import { createApp, h } from 'vue'
import type { Component } from 'vue'
import BillingGranted from './BillingGranted.vue'
import BillingUsageCard from './BillingUsageCard.vue'
import type { BillingGrant, BillingUsage } from '@/types/api'

const UNIPILE: BillingGrant = {
  option: 'unipile',
  label: 'Messagerie hébergée (Unipile)',
  detail: 'Connectez LinkedIn et WhatsApp à vos agents.',
  scope: 'org',
  granted_at: '2026-08-01 00:00:00',
  expires_at: null,
  days_left: null,
  value_amount: 1900,
  currency: 'eur',
  interval: 'month',
}

function render(comp: Component, props: Record<string, unknown>) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(h(comp, props))
  app.mount(host)
  // `fr-FR` sépare les milliers par une espace insécable étroite (U+202F), dont la
  // forme exacte varie selon la version d'ICU. On normalise toutes les espaces
  // Unicode : figer le codepoint ferait un test vert ici et rouge ailleurs.
  const txt = (host.textContent ?? '').replace(/\p{Zs}/gu, ' ')
  return { host, txt, html: host.innerHTML,
    done: () => { app.unmount(); host.remove() } }
}

describe('BillingGranted — l\'avantage se nomme, et son échéance se date', () => {
  it('nomme l\'avantage, le chiffre en HT, et garde le badge « offert par Otomata »', () => {
    const v = render(BillingGranted, { grants: [UNIPILE] })
    // Le NOM d'abord : le jour où un second avantage s'offre, cette ligne dit lequel.
    expect(v.txt).toContain('Messagerie hébergée (Unipile)')
    expect(v.txt).toContain('offert par Otomata')
    expect(v.txt).toContain('Connectez LinkedIn et WhatsApp à vos agents.')
    // « Ce que ça vaut » : 1900 centimes HT → 19 €, hors taxes, par mois.
    expect(v.txt).toContain('19')
    expect(v.txt).toContain('HT par mois')
    expect(v.txt).toContain('pour toute l\'organisation')
    v.done()
  })

  it('sans terme : aucune échéance annoncée — et surtout pas « aucune échéance »', () => {
    const v = render(BillingGranted, { grants: [UNIPILE] })
    expect(v.txt).not.toContain('jusqu\'au')
    expect(v.txt).not.toContain('a pris fin')
    // La phrase de l'abonnement OFFERT ne doit pas déborder ici : ce bloc-ci peut
    // parfaitement porter une échéance.
    expect(v.txt).not.toContain('aucune échéance')
    v.done()
  })

  it('échéance lointaine : le JOUR est dit, pas seulement le mois', () => {
    const v = render(BillingGranted, {
      grants: [{ ...UNIPILE, expires_at: '2026-10-31 00:00:00', days_left: 59 }],
    })
    expect(v.txt).toContain('Offert jusqu\'au 31 octobre 2026')
    // `fmtDate` rendrait « Oct 2026 » : un mois seul ne dit pas s'il reste un jour.
    expect(v.txt).not.toContain('Oct 2026')
    v.done()
  })

  it('échéance proche : le ton monte et les jours restants sont comptés', () => {
    const v = render(BillingGranted, {
      grants: [{ ...UNIPILE, expires_at: '2026-09-14 00:00:00', days_left: 12 }],
    })
    expect(v.txt).toContain('il reste 12 jours')
    expect(v.host.querySelector('.notice.warn')).toBeTruthy()
    v.done()
  })

  it('don ÉCHU : il a pris fin, et on dit par où le rouvrir', () => {
    const v = render(BillingGranted, {
      grants: [{ ...UNIPILE, expires_at: '2026-08-20 00:00:00', days_left: -13 }],
    })
    expect(v.txt).toContain('Cette offre a pris fin le 20 août 2026')
    expect(v.txt).toContain('Choisir un abonnement ci-dessous rouvre l\'accès.')
    // Le piège que `days_left` négatif existe pour éviter.
    expect(v.txt).not.toContain('dernier jour')
    expect(v.txt).not.toContain('aujourd\'hui')
    expect(v.host.querySelector('.notice.warn')).toBeTruthy()
    v.done()
  })

  it('don posé sur le COMPTE : il suit la personne, pas l\'espace', () => {
    const v = render(BillingGranted, { grants: [{ ...UNIPILE, scope: 'user' }] })
    expect(v.txt).toContain('pour votre compte')
    expect(v.txt).toContain('toutes vos organisations')
    expect(v.txt).not.toContain('pour toute l\'organisation')
    v.done()
  })
})

const USAGE: BillingUsage = {
  calls: 25, included: 1000, period_start: '2026-09-01 00:00:00', over: false,
}

describe('BillingUsageCard — deux nombres côte à côte, jamais divisés', () => {
  it('affiche les appels et le plafond, et AUCUNE forme qui les divise', () => {
    const v = render(BillingUsageCard, { usage: USAGE })
    expect(v.txt).toContain('25')
    expect(v.txt).toContain('1 000')      // espace insécable fine du fr-FR
    // Le cœur de la règle : à 25 sur 1000, une barre vide ou un « 2,5 % » dirait
    // « gratuit et sans fin ». Aucun ratio n'est servi, aucun ne doit apparaître.
    expect(v.txt).not.toContain('%')
    expect(v.html).not.toContain('progress')
    expect(v.html).not.toContain('<meter')
    expect(v.host.querySelector('progress, meter')).toBeNull()
    // Et rien qui dessine une proportion en largeur.
    expect(v.html).not.toMatch(/width:\s*\d/)
    v.done()
  })

  it('dit la fenêtre — le mois en cours — sans comparer au mois dernier', () => {
    const v = render(BillingUsageCard, { usage: USAGE })
    expect(v.txt).toContain('mois en cours')
    // « 1 septembre » serait fautif, et `period_start` tombe toujours un 1er.
    expect(v.txt).toContain('1er septembre 2026')
    expect(v.txt).not.toContain('mois dernier')
    expect(v.txt).not.toContain('mois précédent')
    v.done()
  })

  it('dépassement : le ton change sur `over`, sans menacer de couper ni de facturer', () => {
    const v = render(BillingUsageCard, { usage: { ...USAGE, calls: 1420, over: true } })
    expect(v.host.querySelector('.notice.warn')).toBeTruthy()
    expect(v.txt).toContain('Rien n\'est coupé, rien n\'est facturé en plus.')
    v.done()
  })

  it('sous le plafond : pas d\'alerte du tout', () => {
    const v = render(BillingUsageCard, { usage: USAGE })
    expect(v.host.querySelector('.notice.warn')).toBeNull()
    v.done()
  })
})
