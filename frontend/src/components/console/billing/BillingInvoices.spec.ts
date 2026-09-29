// Ce que le typecheck ne voit pas : une PROMESSE CONTRACTUELLE tenue ou non.
//
// Les CGV publiées engagent Otomata mot pour mot — « Chaque encaissement donne lieu
// à une facture […] téléchargeable depuis manage.oto.cx », et elle « reste
// téléchargeable au format PDF ». La liste et le PDF sont servis par oto-commerce.
//
// Ces tests portent donc sur la tenue de la promesse, pas sur des formes :
//   1. la facture est là, avec son numéro et son montant AU CENTIME ;
//   2. la liste et le PDF partent vers le commerce, pour l'org DU CHEMIN ;
//   3. elle reste atteignable APRÈS résiliation — « reste téléchargeable » ;
//   4. un document en cours d'émission ne se lit jamais comme un paiement perdu ;
//   5. un avoir se dit avoir, et son montant reste négatif ;
//   6. aucun lien mort : `pdf: false` ⟹ pas de bouton.
import { i18n } from '@/lib/i18n'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import type { CommerceFacture } from '@/types/api.commerce'

// Le transport vers oto-commerce est bouchonné ; `api/console` est le VRAI : c'est lui
// qui compose les routes.
const commerce = vi.hoisted(() => ({ apiCommerce: vi.fn(), apiCommerceDownload: vi.fn() }))
vi.mock('@/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api')>()), ...commerce,
}))
const toast = vi.hoisted(() => vi.fn())
vi.mock('@/composables/useToast', () => ({ useToast: () => ({ toast }) }))

import { ApiError } from '@/api'
import BillingInvoices from './BillingInvoices.vue'

// Une facture émise : le cas nominal, celui que le contrat promet.
const EMISE: CommerceFacture = {
  id: 12, nature: 'invoice', statut: 'issued', numero: 'F-2026-0007',
  montant_ht: 1900, tva_bps: 2000, tva: 380, montant_ttc: 2280, regime_tva: 'fr_ttc',
  periode_debut: '2026-08-25T00:00:00+00:00', periode_fin: '2026-09-25T00:00:00+00:00',
  emise_le: '2026-08-25T10:12:00+00:00', pdf_nom: 'F-2026-0007.pdf', pdf: true,
}

function factures(list: CommerceFacture[]) {
  commerce.apiCommerce.mockImplementation(async (path: string) => {
    if (path === '/api/orgs/42/factures') return { factures: list }
    throw new Error(`route inattendue : ${path}`)
  })
}

async function render(props: Record<string, unknown> = {}) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(h(BillingInvoices, { orgId: 42, ...props }))
  i18n.global.locale.value = 'fr'
  app.use(i18n).mount(host)
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
  factures([])
  commerce.apiCommerceDownload.mockResolvedValue(undefined)
})

describe('BillingInvoices — la facture que les CGV promettent', () => {
  it('affiche le numéro, la période et le montant AU CENTIME', async () => {
    factures([EMISE])
    const v = await render({ paying: true })
    expect(v.txt).toContain('F-2026-0007')
    // 2280 centimes = 22,80 € — surtout pas « 22,8 € » : un montant d'argent n'a
    // jamais UN seul chiffre après la virgule, et celui-ci est opposable.
    expect(v.txt).toContain('22,80')
    expect(v.txt).not.toContain('22,8 ')
    expect(v.txt).toContain('25 août 2026')
    v.done()
  })

  it('télécharge le PDF chez le commerce, par l\'org du chemin et l\'id de la facture',
    async () => {
      factures([EMISE])
      const v = await render({ paying: true })
      boutonPdf(v.host)!.click()
      await nextTick()
      expect(commerce.apiCommerceDownload).toHaveBeenCalledWith(
        '/api/orgs/42/factures/12/pdf', 'F-2026-0007.pdf')
      v.done()
    })

  it('reste atteignable APRÈS résiliation : « reste téléchargeable » ne s\'éteint pas',
    async () => {
      factures([EMISE])
      // `paying: false` = plus d'abonnement en cours. La facture d'hier doit rester là —
      // c'est exactement celle qu'on réclame ensuite à son comptable.
      const v = await render({ paying: false })
      expect(v.txt).toContain('F-2026-0007')
      expect(boutonPdf(v.host)).toBeTruthy()
      v.done()
    })

  it('un document en cours d\'émission se montre, et ne se lit pas comme un paiement perdu',
    async () => {
      factures([{ ...EMISE, id: 13, statut: 'pending', numero: null, pdf_nom: null, pdf: false, emise_le: null }])
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
    factures([{ ...EMISE, id: 14, nature: 'credit_note', numero: 'A-2026-0002', montant_ttc: -2280 }])
    const v = await render({ paying: true })
    expect(v.txt).toContain('avoir')
    // Afficher « 22,80 € » pour un remboursement le ferait passer pour un débit.
    expect(v.txt).toContain('-22,80')
    v.done()
  })

  it('émise mais sans PDF (`pdf: false`) : on le dit, on n\'offre pas de lien mort', async () => {
    // Le nom seul ne suffit pas : c'est `pdf` qui dit qu'un fichier existe.
    factures([{ ...EMISE, pdf: false }])
    const v = await render({ paying: true })
    expect(boutonPdf(v.host)).toBeFalsy()
    expect(v.txt).toContain('PDF en préparation')
    v.done()
  })

  it('le refus du serveur s\'affiche MOT POUR MOT — il dit quoi attendre', async () => {
    factures([EMISE])
    commerce.apiCommerceDownload.mockRejectedValue(new ApiError(
      404, 'no_invoice_pdf', 'Pas de PDF pour la facture #12.'))
    const v = await render({ paying: true })
    boutonPdf(v.host)!.click()
    for (let i = 0; i < 5; i++) await nextTick()
    expect(toast).toHaveBeenCalledWith('Pas de PDF pour la facture #12.')
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

  it('org d\'un tenant tiers (404 unknown_org) : la carte se tait au lieu d\'alarmer', async () => {
    commerce.apiCommerce.mockRejectedValue(new ApiError(404, 'unknown_org'))
    const v = await render({ paying: true })
    expect(v.txt.trim()).toBe('')
    v.done()
  })

  it('une panne de lecture se dit, et se rejoue — elle ne fait pas croire à zéro facture',
    async () => {
      commerce.apiCommerce.mockRejectedValue(new ApiError(500, 'internal_error'))
      const v = await render({ paying: true })
      expect(v.txt).not.toContain('Aucune facture')
      expect([...v.host.querySelectorAll('button')]
        .some((b) => b.textContent?.includes('Réessayer'))).toBe(true)
      v.done()
    })
})
