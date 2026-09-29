// Le bloc commerce de la fiche d'org (admin plateforme), branché sur l'API
// d'administration d'oto-commerce. Ce qui se fixe ici : il lit l'état ENTIER de l'org
// chez le commerce, ses gestes partent vers les bonnes routes, et un refus — `before_switch`
// en tête, tant que la facturation est au cœur — s'affiche tel que le commerce l'a écrit.
// L'émission d'une facture en attente (`held`, oto-commerce#3) dit ses refus par leur code
// traduit, et remplace la liste par celle que le commerce rend.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { i18n } from '@/lib/i18n'
import { usePrompt } from '@/composables/usePrompt'
import type { CommerceEtatAdmin, CommerceFacture } from '@/types/api.commerce'

const commerce = vi.hoisted(() => ({ apiCommerce: vi.fn(), apiCommerceDownload: vi.fn() }))
vi.mock('@/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api')>()), ...commerce,
}))
const toast = vi.hoisted(() => vi.fn())
vi.mock('@/composables/useToast', () => ({ useToast: () => ({ toast }) }))

import { ApiError } from '@/api'
import AdminOrgCommerce from './AdminOrgCommerce.vue'

const ETAT: CommerceEtatAdmin = {
  abonnement: { places: 3, statut: 'active', tarif: 'par_membre', forfait_ht: null,
    places_suivantes: null, periode_fin: '2026-10-25T00:00:00+00:00', echeance: null,
    grace_fin: null, resilie_le: null },
  contrat: null,
  dons: [{ droit: 'unipile', source: 'offered', fin: null, pose_par: 'admin' }],
  identite: { legal_name: 'ACME SAS', country_code: 'FR', vat_number: null, address_line: '1 rue',
    postal_code: '13001', city: 'Marseille', email: 'compta@acme.test', compta_client_id: '4242' },
  factures: [{ id: 9, nature: 'invoice', statut: 'issued', numero: 'F-2026-0009', montant_ht: 1900,
    tva_bps: 2000, tva: 380, montant_ttc: 2280, regime_tva: 'fr_ttc', periode_debut: null,
    periode_fin: null, emise_le: '2026-09-25T10:00:00+00:00', pdf_nom: 'F-2026-0009.pdf', pdf: true }],
  bascule_faite: false,
}
// Un encaissement qui attend son émission : montants et période, ni numéro ni PDF.
const EN_ATTENTE: CommerceFacture = { id: 10, nature: 'invoice', statut: 'held', numero: null,
  montant_ht: 2500, tva_bps: 2000, tva: 500, montant_ttc: 3000, regime_tva: 'fr_ttc',
  periode_debut: '2026-09-29T00:00:00+00:00', periode_fin: '2026-10-29T00:00:00+00:00',
  emise_le: null, pdf_nom: null, pdf: false }
const EMISE: CommerceFacture = { ...EN_ATTENTE, statut: 'issued', numero: 'F-2026-0010',
  emise_le: '2026-09-29T00:00:00+00:00', pdf_nom: 'F-2026-0010.pdf', pdf: true }

// L'état servi, et ce que rend (ou refuse) l'émission.
let etat: CommerceEtatAdmin = ETAT
let emission: () => unknown = () => ({ factures: [EMISE, ...ETAT.factures] })

async function render(isOperator = true) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(h(AdminOrgCommerce, { orgId: 7, orgName: 'ACME', isOperator }))
  i18n.global.locale.value = 'fr'
  app.use(i18n).mount(host)
  await settle()
  return { host, done: () => { app.unmount(); host.remove() } }
}
async function settle() {
  for (let i = 0; i < 10; i++) await nextTick()
  await new Promise((r) => setTimeout(r, 10))
  for (let i = 0; i < 10; i++) await nextTick()
}

beforeEach(() => {
  vi.clearAllMocks()
  etat = ETAT
  emission = () => ({ factures: [EMISE, ...ETAT.factures] })
  commerce.apiCommerce.mockImplementation(async (path: string, init: RequestInit = {}) => {
    const geste = `${init.method ?? 'GET'} ${path}`
    if (geste === 'GET /api/admin/orgs/7/commerce') return etat
    if (geste === 'PUT /api/admin/orgs/7/factures/10') return emission()
    if (geste === 'DELETE /api/admin/orgs/7/dons/unipile') {
      throw new ApiError(409, 'before_switch', 'la facturation est encore au cœur : ce geste s\'y fait')
    }
    throw new Error(`route inattendue : ${geste}`)
  })
})

describe('AdminOrgCommerce — l\'état de l\'org chez le commerce', () => {
  it('lit GET /api/admin/orgs/{id}/commerce et montre abonnement, dons et client comptable', async () => {
    const v = await render()
    const txt = v.host.textContent ?? ''
    expect(commerce.apiCommerce).toHaveBeenCalledWith('/api/admin/orgs/7/commerce')
    expect(txt).toContain('3 places')
    expect(txt).toContain('unipile')
    expect(txt).toContain('client comptable #4242')
    // Avant la bascule, l'écran prévient que les gestes seront refusés.
    expect(txt).toContain('la facturation est encore tenue par le cœur')
    // Plus de « forcer un plan » : on offre un droit.
    const boutons = [...v.host.querySelectorAll('button')].map((b) => b.textContent ?? '')
    expect(boutons.some((b) => b.includes('forcer un plan'))).toBe(false)
    expect(boutons.some((b) => b.includes('offrir un droit'))).toBe(true)
    v.done()
  })

  it('un refus before_switch s\'affiche TEL QUEL', async () => {
    const { resolve } = usePrompt()
    const v = await render()
    const retirer = [...v.host.querySelectorAll('button')].find((b) => b.textContent?.includes('Retirer'))!
    retirer.click()
    await settle()
    resolve(true)
    await settle()
    expect(commerce.apiCommerce).toHaveBeenCalledWith('/api/admin/orgs/7/dons/unipile', { method: 'DELETE' })
    expect(toast).toHaveBeenCalledWith('la facturation est encore au cœur : ce geste s\'y fait')
    v.done()
  })

  it('télécharge le PDF d\'une facture par la route d\'administration', async () => {
    commerce.apiCommerceDownload.mockResolvedValue(undefined)
    const v = await render()
    const pdf = [...v.host.querySelectorAll('button')].find((b) => b.textContent?.includes('PDF'))!
    pdf.click()
    await settle()
    expect(commerce.apiCommerceDownload).toHaveBeenCalledWith(
      '/api/admin/orgs/7/factures/9/pdf', 'F-2026-0009.pdf')
    v.done()
  })

  it('hors opérateur plateforme : rien n\'est lu, rien n\'est montré', async () => {
    const v = await render(false)
    expect(commerce.apiCommerce).not.toHaveBeenCalled()
    expect((v.host.textContent ?? '').trim()).toBe('')
    v.done()
  })
})

describe('AdminOrgCommerce — émettre une facture en attente (oto-commerce#3)', () => {
  // Remplit le formulaire d'une facture `held` : numéro, et un PDF choisi dans l'input file.
  async function remplir(host: HTMLElement, numero: string) {
    const num = host.querySelector<HTMLInputElement>('input[type=text]')!
    num.value = numero
    num.dispatchEvent(new Event('input'))
    const file = host.querySelector<HTMLInputElement>('input[type=file]')!
    const pdf = new File(['%PDF-1.4 facture'], 'F-2026-0010.pdf', { type: 'application/pdf' })
    Object.defineProperty(file, 'files', { configurable: true, value: [pdf] })
    file.dispatchEvent(new Event('change'))
    await settle()
  }
  // Le bouton du formulaire, quelle que soit la langue (« Émettre » / « Issue »).
  const emettre = (host: HTMLElement) => host.querySelector<HTMLButtonElement>('form button')!

  it('une facture ÉMISE n\'a pas de formulaire d\'émission', async () => {
    const v = await render()
    expect(v.host.querySelector('input[type=file]')).toBeNull()
    expect(v.host.textContent).not.toContain('en attente d\'émission')
    v.done()
  })

  it('une facture EN ATTENTE se dit, et s\'émet : PUT avec numéro, date du jour et PDF en base64, puis la liste rendue',
    async () => {
      etat = { ...ETAT, factures: [EN_ATTENTE, ...ETAT.factures] }
      const v = await render()
      expect(v.host.textContent).toContain('en attente d\'émission')
      // Rien ne part tant que le numéro et le PDF manquent.
      expect(emettre(v.host).textContent).toContain('Émettre')
      expect(emettre(v.host).disabled).toBe(true)
      const date = v.host.querySelector<HTMLInputElement>('input[type=date]')!
      expect(date.value).toMatch(/^\d{4}-\d{2}-\d{2}$/)

      await remplir(v.host, ' F-2026-0010 ')
      expect(emettre(v.host).disabled).toBe(false)
      emettre(v.host).click()
      await settle()

      const appel = commerce.apiCommerce.mock.calls.find(([p, i]) =>
        p === '/api/admin/orgs/7/factures/10' && (i as RequestInit | undefined)?.method === 'PUT')!
      expect(JSON.parse(String((appel[1] as RequestInit).body))).toEqual({
        numero: 'F-2026-0010', emise_le: date.value, pdf_base64: btoa('%PDF-1.4 facture'),
        pdf_nom: 'F-2026-0010.pdf',
      })
      expect(toast).toHaveBeenCalledWith('facture émise')
      // La liste est celle que le commerce a rendue : émise, sans formulaire, sans relire l'état.
      expect(v.host.textContent).toContain('F-2026-0010')
      expect(v.host.textContent).not.toContain('en attente d\'émission')
      expect(v.host.querySelector('input[type=file]')).toBeNull()
      expect(commerce.apiCommerce.mock.calls.filter(([p]) => p === '/api/admin/orgs/7/commerce')).toHaveLength(1)
      v.done()
    })

  it('un refus se dit par son code TRADUIT, et le formulaire reste', async () => {
    etat = { ...ETAT, factures: [EN_ATTENTE, ...ETAT.factures] }
    emission = () => { throw new ApiError(400, 'invalid_pdf', '`pdf_base64` : un document PDF') }
    const v = await render()
    await remplir(v.host, 'F-2026-0010')
    emettre(v.host).click()
    await settle()
    expect(toast).toHaveBeenCalledWith('le fichier n\'est pas un PDF')
    expect(v.host.querySelector('input[type=file]')).not.toBeNull()
    expect(v.host.querySelector<HTMLInputElement>('input[type=text]')!.value).toBe('F-2026-0010')

    i18n.global.locale.value = 'en'
    await settle()
    emettre(v.host).click()
    await settle()
    expect(toast).toHaveBeenLastCalledWith('the file is not a PDF')
    v.done()
  })
})
