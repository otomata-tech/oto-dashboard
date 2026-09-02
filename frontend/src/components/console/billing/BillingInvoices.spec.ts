// Ce que le typecheck ne voit pas : une PROMESSE CONTRACTUELLE tenue ou non.
//
// Les CGV publiées engagent Otomata mot pour mot — « Chaque encaissement donne lieu
// à une facture […] téléchargeable depuis manage.oto.cx », et elle « reste
// téléchargeable au format PDF ». La liste et le PDF étaient servis en production ;
// aucun écran ne les demandait. Aucun type n'aurait signalé ce manque.
//
// Ces tests portent donc sur la tenue de la promesse, pas sur des formes :
//   1. la facture est là, avec son numéro et son montant AU CENTIME ;
//   2. le PDF part par la route SERVIE avec elle, jamais un chemin recomposé ;
//   3. elle reste atteignable APRÈS résiliation — « reste téléchargeable » ;
//   4. un document en cours d'émission ne se lit jamais comme un paiement perdu ;
//   5. un avoir se dit avoir, et son montant reste négatif ;
//   6. aucun lien mort : pas de `pdf_path` ⟹ pas de bouton.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import type { BillingInvoice } from '@/types/api'

const api = vi.hoisted(() => ({
  getBillingInvoices: vi.fn(),
  downloadBillingInvoicePdf: vi.fn(),
}))
vi.mock('@/api/console', () => api)
const toast = vi.hoisted(() => vi.fn())
vi.mock('@/composables/useToast', () => ({ useToast: () => ({ toast }) }))

import { ApiError } from '@/api'
import BillingInvoices from './BillingInvoices.vue'

// Une facture émise : le cas nominal, celui que le contrat promet.
const EMISE: BillingInvoice = {
  id: 12, kind: 'invoice', status: 'issued', number: 'F-2026-0007',
  currency: 'eur', amount_ht: 1900, vat_rate_bps: 2000, vat_amount: 380,
  amount_ttc: 2280, vat_scheme: 'fr_ttc',
  period_start: '2026-08-25 00:00:00', period_end: '2026-09-25 00:00:00',
  issued_at: '2026-08-25 10:12:00', has_pdf: true,
  pdf_path: '/api/me/billing/invoices/12/pdf',
  emailed_at: '2026-08-25 10:13:00', created_at: '2026-08-25 10:12:00',
}

async function render(props: Record<string, unknown> = {}) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(h(BillingInvoices, props))
  app.mount(host)
  for (let i = 0; i < 10; i++) await nextTick()
  await new Promise((r) => setTimeout(r, 5))
  for (let i = 0; i < 10; i++) await nextTick()
  // `fr-FR` sépare par une espace insécable étroite dont la forme varie selon ICU :
  // on normalise toutes les espaces Unicode plutôt que de figer un codepoint.
  const txt = (host.textContent ?? '').replace(/\p{Zs}/gu, ' ')
  return { host, txt, done: () => { app.unmount(); host.remove() } }
}

function boutonPdf(host: HTMLElement): HTMLButtonElement | undefined {
  return [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('PDF'))
}

beforeEach(() => {
  vi.clearAllMocks()
  api.getBillingInvoices.mockResolvedValue({ invoices: [] })
  api.downloadBillingInvoicePdf.mockResolvedValue(undefined)
})

describe('BillingInvoices — la facture que les CGV promettent', () => {
  it('affiche le numéro, la période et le montant AU CENTIME', async () => {
    api.getBillingInvoices.mockResolvedValue({ invoices: [EMISE] })
    const v = await render({ paying: true })
    expect(v.txt).toContain('F-2026-0007')
    // 2280 centimes = 22,80 € — surtout pas « 22,8 € » : un montant d'argent n'a
    // jamais UN seul chiffre après la virgule, et celui-ci est opposable.
    expect(v.txt).toContain('22,80')
    expect(v.txt).not.toContain('22,8 ')
    expect(v.txt).toContain('25 août 2026')
    v.done()
  })

  it('télécharge par le chemin SERVI avec la facture, pas par un chemin recomposé',
    async () => {
      api.getBillingInvoices.mockResolvedValue({ invoices: [EMISE] })
      const v = await render({ paying: true })
      boutonPdf(v.host)!.click()
      await nextTick()
      expect(api.downloadBillingInvoicePdf).toHaveBeenCalledWith(
        '/api/me/billing/invoices/12/pdf', 'facture-F-2026-0007.pdf')
      v.done()
    })

  it('reste atteignable APRÈS résiliation : « reste téléchargeable » ne s\'éteint pas',
    async () => {
      api.getBillingInvoices.mockResolvedValue({ invoices: [EMISE] })
      // `paying: false` = plus d'abonnement payant en cours. La facture d'hier doit
      // rester là — c'est exactement celle qu'on réclame ensuite à son comptable.
      const v = await render({ paying: false })
      expect(v.txt).toContain('F-2026-0007')
      expect(boutonPdf(v.host)).toBeTruthy()
      v.done()
    })

  it('un document en cours d\'émission se montre, et ne se lit pas comme un paiement perdu',
    async () => {
      const enCours: BillingInvoice = {
        ...EMISE, id: 13, status: 'pending', number: null,
        has_pdf: false, pdf_path: null, issued_at: null,
      }
      api.getBillingInvoices.mockResolvedValue({ invoices: [enCours] })
      const v = await render({ paying: true })
      // La ligne EXISTE et porte son montant : l'encaissement a bien eu lieu.
      expect(v.txt).toContain('22,80')
      expect(v.txt).toContain('en cours d\'émission')
      // Aucun vocabulaire d'échec, et aucun bouton qui refuserait au clic.
      expect(v.txt).not.toContain('échec')
      expect(v.txt).not.toContain('erreur')
      expect(boutonPdf(v.host)).toBeFalsy()
      v.done()
    })

  it('un avoir se dit avoir, et son montant reste NÉGATIF', async () => {
    const avoir: BillingInvoice = {
      ...EMISE, id: 14, kind: 'credit_note', number: 'A-2026-0002',
      amount_ttc: -2280, pdf_path: '/api/me/billing/invoices/14/pdf',
    }
    api.getBillingInvoices.mockResolvedValue({ invoices: [avoir] })
    const v = await render({ paying: true })
    expect(v.txt).toContain('avoir')
    // Afficher « 22,80 € » pour un remboursement le ferait passer pour un débit.
    expect(v.txt).toContain('-22,80')
    v.done()
  })

  it('émise mais PDF pas encore récupéré : on le dit, on n\'offre pas de lien mort',
    async () => {
      api.getBillingInvoices.mockResolvedValue({
        invoices: [{ ...EMISE, has_pdf: false, pdf_path: null }] })
      const v = await render({ paying: true })
      expect(boutonPdf(v.host)).toBeFalsy()
      expect(v.txt).toContain('PDF en préparation')
      v.done()
    })

  it('le refus du serveur s\'affiche MOT POUR MOT — il dit quoi attendre', async () => {
    api.getBillingInvoices.mockResolvedValue({ invoices: [EMISE] })
    api.downloadBillingInvoicePdf.mockRejectedValue(new ApiError(
      409, 'pdf_not_available',
      'Le PDF de ce document n\'a pas encore été récupéré auprès du fournisseur — '
      + 'il le sera automatiquement.'))
    const v = await render({ paying: true })
    boutonPdf(v.host)!.click()
    for (let i = 0; i < 5; i++) await nextTick()
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('pas encore été récupéré'))
    v.done()
  })

  it('un abonné sans facture est rassuré ; un compte qui n\'a rien réglé ne voit rien',
    async () => {
      const abonne = await render({ paying: true })
      expect(abonne.txt).toContain('Aucune facture pour l\'instant')
      abonne.done()
      const gratuit = await render({ paying: false })
      expect(gratuit.txt.trim()).toBe('')
      gratuit.done()
    })

  it('billing dormant (404) : la carte se tait au lieu d\'alarmer', async () => {
    api.getBillingInvoices.mockRejectedValue(new ApiError(404, 'not_found'))
    const v = await render({ paying: true })
    expect(v.txt.trim()).toBe('')
    v.done()
  })

  it('une panne de lecture se dit, et se rejoue — elle ne fait pas croire à zéro facture',
    async () => {
      api.getBillingInvoices.mockRejectedValue(new ApiError(500, 'internal_error'))
      const v = await render({ paying: true })
      expect(v.txt).not.toContain('Aucune facture')
      expect([...v.host.querySelectorAll('button')]
        .some((b) => b.textContent?.includes('Réessayer'))).toBe(true)
      v.done()
    })
})
