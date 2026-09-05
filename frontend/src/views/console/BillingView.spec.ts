// Le cas qui a laissé le seul abonné payant dans une impasse huit jours durant :
// l'écran de facturation affichait « complétez l'identité de facturation » SANS
// aucun endroit où le faire. Le formulaire existait — mais monté dans le seul
// tunnel de souscription, qui disparaît dès qu'on est abonné.
//
// Ces tests couvrent donc le CÂBLAGE d'un écran d'ABONNÉ (le typecheck ne voit pas
// qu'une alerte n'a pas d'issue) :
//   1. l'alerte porte son propre levier, et le formulaire est réellement monté ;
//   2. l'enregistrement part vers le PUT et l'alerte tombe quand le serveur la lève ;
//   3. à qui ne peut pas écrire, on ne propose pas un bouton qui refusera au clic ;
//   4. un abonnement OFFERT n'affiche pas de fiche : rien n'y sera jamais prélevé.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n } from '@/lib/i18n'
import { ApiError } from '@/api'
import { usePrompt } from '@/composables/usePrompt'

const ACTIF = {
  subscribed: true, plan: 'standard', label: 'Standard', amount: 1900,
  currency: 'EUR', interval: 'month', status: 'active', method: 'card', comp: false,
  current_period_end: '2026-09-25', next_billing_at: '2026-09-25',
  grace_until: null, canceled_at: null,
}
// L'état d'Alexis au 2026-09-02 : abonné, actif, et pas de TTC calculable.
const BLOQUE = {
  ...ACTIF,
  vat_rate_bps: null, vat_amount: null, amount_ttc: null, vat_scheme: null,
  vat_blocked: 'billing_identity_required',
}
// Ce que le serveur rend une fois la fiche posée.
const DEBLOQUE = {
  ...ACTIF,
  vat_rate_bps: 2000, vat_amount: 380, amount_ttc: 2280, vat_scheme: 'fr_ttc',
  vat_blocked: null,
}

const FICHE_VIDE = {
  identity: null,
  missing: ['legal_name', 'country_code', 'address_line', 'postal_code', 'city'],
  vat_scheme: null, vat_rate_bps: null, vat_blocked: 'billing_identity_required',
}
const FICHE_PLEINE = {
  identity: {
    legal_name: 'ACME SAS', country_code: 'FR', vat_number: null,
    address_line: '1 rue du Test', address_line2: null, postal_code: '13001',
    city: 'Marseille', billing_email: null,
  },
  missing: [], vat_scheme: 'fr_ttc', vat_rate_bps: 2000, vat_blocked: null,
}

// `vi.hoisted` : la fabrique de `vi.mock` est remontée en tête de module, elle ne
// peut donc pas fermer sur des `const` déclarés plus bas.
const api = vi.hoisted(() => ({
  getBilling: vi.fn(),
  getBillingIdentity: vi.fn(),
  setBillingIdentity: vi.fn(),
  getBillingPayments: vi.fn(),
  // La carte « Factures » est montée par la vue et lit ce module : sans cette
  // entrée, le mock rendrait `undefined` et la carte partirait en erreur sous des
  // tests qui ne parlent pas d'elle.
  getBillingInvoices: vi.fn(),
  downloadBillingInvoicePdf: vi.fn(),
  confirmBilling: vi.fn(),
  cancelBilling: vi.fn(),
  // Les deux gestes de #845 : l'inverse de la résiliation, et le changement de carte
  // (ouverture, puis constat au retour — lu par `BillingMethodChange`).
  resumeBilling: vi.fn(),
  startBillingMethodChange: vi.fn(),
  confirmBillingMethodChange: vi.fn(),
}))
vi.mock('@/api/console', () => api)
const { getBilling, getBillingIdentity, setBillingIdentity, getBillingPayments,
  getBillingInvoices, resumeBilling, startBillingMethodChange, confirmBillingMethodChange } = api

const me = ref<{ org_role: string; role: string; active_org_name: string } | null>(null)
vi.mock('@/composables/useMe', () => ({
  useMe: () => ({ me }),
  isSuperAdmin: (m: { role?: string } | null) => m?.role === 'super_admin',
}))

async function mountView() {
  const View = (await import('./BillingView.vue')).default
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/org/billing', component: defineComponent({ render: () => h('div') }) }],
  })
  await router.push('/org/billing')
  await router.isReady()
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(View)
  app.use(router)
  app.use(i18n)
  app.mount(host)
  await settle()
  return { host, unmount: () => { app.unmount(); host.remove() } }
}

// `load()` puis `loadIdentity()` s'enchaînent : laisser les microtâches se vider.
async function settle() {
  for (let i = 0; i < 10; i++) await nextTick()
  await new Promise((r) => setTimeout(r, 20))
  for (let i = 0; i < 10; i++) await nextTick()
}

function boutonNomme(host: HTMLElement, texte: string): HTMLButtonElement | undefined {
  return [...host.querySelectorAll('button')]
    .find((b) => b.textContent?.includes(texte))
}

beforeEach(() => {
  vi.clearAllMocks()
  i18n.global.locale.value = 'fr'
  me.value = { org_role: 'org_admin', role: 'member', active_org_name: 'ACME' }
  getBillingPayments.mockResolvedValue({ payments: [] })
  getBillingInvoices.mockResolvedValue({ invoices: [] })
})

describe('BillingView — identité de facturation hors du tunnel', () => {
  it('un abonné dont l\'échéance est bloquée a le formulaire SOUS l\'alerte, et un lien qui y mène', async () => {
    getBilling.mockResolvedValue(BLOQUE)
    getBillingIdentity.mockResolvedValue(FICHE_VIDE)

    const { host, unmount } = await mountView()

    // L'écran est bien celui d'un abonné : aucun tunnel, aucun catalogue.
    expect(host.innerHTML).not.toContain('Choisir un abonnement')
    // L'alerte est là…
    expect(host.textContent).toContain('La prochaine échéance ne peut pas être calculée')
    // …ET elle porte un levier.
    expect(boutonNomme(host, 'Compléter l\'identité de facturation')).toBeTruthy()
    // …qui mène à un formulaire RÉELLEMENT monté sur cet écran.
    const carte = host.querySelector('#billing-identity')
    expect(carte, 'la carte d\'identité de facturation est absente').toBeTruthy()
    expect(carte!.textContent).toContain('Raison sociale')
    expect(carte!.querySelectorAll('input').length).toBeGreaterThan(4)
    expect(boutonNomme(host, 'Enregistrer')).toBeTruthy()
    // Le formulaire du tunnel, pas une copie : la lecture passe par la MÊME API.
    expect(getBillingIdentity).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('enregistrer depuis cet écran écrit par le PUT, et l\'alerte tombe quand le serveur la lève',
    async () => {
      getBilling.mockResolvedValueOnce(BLOQUE)
      getBillingIdentity.mockResolvedValue(FICHE_VIDE)
      setBillingIdentity.mockResolvedValue(FICHE_PLEINE)
      // Le second `getBilling` est celui d'après-enregistrement : le serveur ne
      // bloque plus, et c'est cette relecture qui doit faire tomber l'alerte.
      getBilling.mockResolvedValue(DEBLOQUE)

      const { host, unmount } = await mountView()
      expect(host.textContent).toContain('La prochaine échéance ne peut pas être calculée')

      const champs = [...host.querySelectorAll<HTMLInputElement>('#billing-identity input')]
      const raisonSociale = champs[0]!            // premier champ du formulaire
      raisonSociale.value = 'ACME SAS'
      raisonSociale.dispatchEvent(new Event('input'))
      await nextTick()

      boutonNomme(host, 'Enregistrer')!.click()
      await settle()

      expect(setBillingIdentity).toHaveBeenCalledTimes(1)
      expect(setBillingIdentity.mock.calls[0]![0]).toMatchObject({
        legal_name: 'ACME SAS', country_code: 'FR',
      })
      // L'écran s'est relu : plus d'alerte, et le TTC de l'échéance apparaît.
      expect(getBilling).toHaveBeenCalledTimes(2)
      expect(host.textContent).not.toContain('La prochaine échéance ne peut pas être calculée')
      expect(host.textContent).toContain('22,80')
      unmount()
    })

  it('à un membre qui ne peut pas écrire, on nomme qui le peut au lieu d\'un bouton qui refuserait',
    async () => {
      me.value = { org_role: 'member', role: 'member', active_org_name: 'ACME' }
      getBilling.mockResolvedValue(BLOQUE)
      getBillingIdentity.mockResolvedValue(FICHE_VIDE)

      const { host, unmount } = await mountView()

      expect(host.textContent).toContain('seul un administrateur de l\'organisation peut la corriger')
      expect(boutonNomme(host, 'Compléter l\'identité de facturation')).toBeUndefined()
      // La fiche reste LISIBLE (le TTC en dépend), mais en lecture seule.
      expect(host.querySelector('#billing-identity')).toBeTruthy()
      expect(boutonNomme(host, 'Enregistrer')).toBeUndefined()
      unmount()
    })

  it('un abonnement OFFERT n\'affiche pas de fiche de facturation : rien n\'y sera prélevé',
    async () => {
      getBilling.mockResolvedValue({ ...ACTIF, comp: true, method: 'comp', vat_blocked: null })
      getBillingIdentity.mockResolvedValue(FICHE_PLEINE)

      const { host, unmount } = await mountView()

      expect(host.textContent).toContain('offert par Otomata')
      expect(host.querySelector('#billing-identity')).toBeNull()
      expect(getBillingIdentity).not.toHaveBeenCalled()
      unmount()
    })

  it('si la fiche ne se lit pas, l\'écran de l\'abonné reste debout (et son alerte avec lui)',
    async () => {
      getBilling.mockResolvedValue(BLOQUE)
      getBillingIdentity.mockRejectedValue(new Error('upstream'))

      const { host, unmount } = await mountView()

      expect(host.textContent).toContain('La prochaine échéance ne peut pas être calculée')
      expect(host.querySelector('#billing-identity')).toBeTruthy()
      expect(boutonNomme(host, 'Réessayer')).toBeTruthy()
      unmount()
    })
})

// ── #845 : les deux alertes qui n'avaient pas de levier en ont un ──────────────
//
// « Résiliation programmée » n'offrait pas de revenir en arrière ; « paiement en
// échec » n'offrait pas de changer de carte. Les deux gestes existent côté serveur
// depuis oto-backend#845 ; ces tests couvrent leur CÂBLAGE ici : qui les voit, ce
// qu'ils appellent, et que les phrases du serveur (refus comme constats) arrivent
// à l'écran telles quelles.

const RESILIE = { ...ACTIF, canceled_at: '2026-09-03T10:00:00Z', next_billing_at: null }
const IMPAYE = { ...ACTIF, status: 'past_due', grace_until: '2026-10-09' }
const ATTENTE = 'Ton moyen de paiement actuel reste actif tant que le nouveau n\'est pas '
  + 'confirmé — rien n\'est coupé si tu abandonnes cette page.'

// `window.location` est remplacé par un objet nu : la vue lit `origin` et `href`
// pour bâtir ses URL de retour, et écrit `href` pour partir chez le prestataire —
// jsdom ne navigue pas, on lit ce qui a été écrit.
const ORIGIN = 'http://localhost:3000'
function fakeLocation(path = '/org/billing') {
  Object.defineProperty(window, 'location', {
    configurable: true, writable: true,
    value: { origin: ORIGIN, href: `${ORIGIN}${path}`, assign: vi.fn() },
  })
}
function boutonsNommes(host: HTMLElement, texte: string): HTMLButtonElement[] {
  return [...host.querySelectorAll('button')].filter((b) => b.textContent?.includes(texte))
}

describe('BillingView — annuler une résiliation (#845 ②)', () => {
  beforeEach(() => {
    fakeLocation()
    getBillingIdentity.mockResolvedValue(FICHE_PLEINE)
  })

  it('résilié, période en cours : l\'alerte porte « Annuler la résiliation », et « Résilier » a disparu',
    async () => {
      getBilling.mockResolvedValueOnce(RESILIE)
      getBilling.mockResolvedValue(ACTIF)
      resumeBilling.mockResolvedValue(ACTIF)

      const { host, unmount } = await mountView()

      expect(host.textContent).toContain('Résiliation programmée')
      expect(boutonNomme(host, 'Résilier l\'abonnement')).toBeUndefined()
      const lever = boutonNomme(host, 'Annuler la résiliation')
      expect(lever, 'l\'alerte doit porter son levier').toBeTruthy()

      lever!.click()
      await settle()

      expect(resumeBilling).toHaveBeenCalledTimes(1)
      // L'état rendu par `resume` est celui qu'on affiche : plus d'alerte, et le
      // geste inverse est de retour.
      expect(host.textContent).not.toContain('Résiliation programmée')
      expect(boutonNomme(host, 'Annuler la résiliation')).toBeUndefined()
      expect(boutonNomme(host, 'Résilier l\'abonnement')).toBeTruthy()
      unmount()
    })

  it('période échue entre l\'affichage et le clic : le refus du serveur s\'affiche tel quel',
    async () => {
      getBilling.mockResolvedValue(RESILIE)
      const refus = 'already_ended: la période est terminée et l\'abonnement est clos — '
        + 'reprends-le par une nouvelle souscription, pas par une reprise'
      resumeBilling.mockRejectedValue(new ApiError(400, 'already_ended', refus))

      const { host, unmount } = await mountView()
      boutonNomme(host, 'Annuler la résiliation')!.click()
      await settle()

      expect(host.textContent).toContain(refus)
      // Le refus dit de relire l'état : le levier est là.
      expect(boutonNomme(host, 'Actualiser')).toBeTruthy()
      unmount()
    })

  it('à un membre, l\'alerte nomme qui peut annuler, sans bouton qui refuserait', async () => {
    me.value = { org_role: 'member', role: 'member', active_org_name: 'ACME' }
    getBilling.mockResolvedValue(RESILIE)

    const { host, unmount } = await mountView()

    expect(host.textContent).toContain('seul un administrateur de l\'organisation peut l\'annuler')
    expect(boutonNomme(host, 'Annuler la résiliation')).toBeUndefined()
    expect(boutonNomme(host, 'Changer de carte')).toBeUndefined()
    unmount()
  })
})

describe('BillingView — changer de carte (#845 ①)', () => {
  beforeEach(() => {
    fakeLocation()
    getBillingIdentity.mockResolvedValue(FICHE_PLEINE)
  })

  it('actif : « Changer de carte » est offert à côté de « Résilier »', async () => {
    getBilling.mockResolvedValue(ACTIF)
    const { host, unmount } = await mountView()
    expect(boutonNomme(host, 'Changer de carte')).toBeTruthy()
    expect(boutonNomme(host, 'Résilier l\'abonnement')).toBeTruthy()
    unmount()
  })

  it('en impayé, c\'est l\'alerte qui porte « Changer de carte » — une seule fois', async () => {
    getBilling.mockResolvedValue(IMPAYE)
    const { host, unmount } = await mountView()
    expect(host.textContent).toContain('Paiement en échec')
    expect(boutonsNommes(host, 'Changer de carte')).toHaveLength(1)
    unmount()
  })

  it('ouvre le changement avec l\'URL de retour, montre la phrase du serveur AVANT de partir, puis envoie sur la page de paiement',
    async () => {
      getBilling.mockResolvedValue(ACTIF)
      startBillingMethodChange.mockResolvedValue({
        checkout_url: 'https://pay.invalid/x', payment_id: 'tr_neuf', notice: ATTENTE,
      })
      const { state, resolve } = usePrompt()

      const { host, unmount } = await mountView()
      boutonNomme(host, 'Changer de carte')!.click()
      await settle()

      expect(startBillingMethodChange).toHaveBeenCalledWith(`${ORIGIN}/org/billing?billing=method`)
      // Le dialogue du design system, avec la phrase servie mot pour mot.
      expect(state.value?.kind).toBe('confirm')
      expect(state.value?.kind === 'confirm' && state.value.config.message).toBe(ATTENTE)
      // Tant qu'on n'a pas continué, on n'est parti nulle part.
      expect(window.location.href).toBe(`${ORIGIN}/org/billing`)

      resolve(true)
      await settle()
      expect(window.location.href).toBe('https://pay.invalid/x')
      unmount()
    })

  it('un refus à l\'ouverture s\'affiche tel quel, et on ne part nulle part', async () => {
    getBilling.mockResolvedValue(ACTIF)
    const refus = 'no_customer: cet abonnement n\'a pas de client de paiement rattaché — '
      + 'il a été ouvert autrement (plan offert), il n\'y a pas de carte à changer'
    startBillingMethodChange.mockRejectedValue(new ApiError(400, 'no_customer', refus))

    const { host, unmount } = await mountView()
    boutonNomme(host, 'Changer de carte')!.click()
    await settle()

    expect(host.textContent).toContain(refus)
    expect(window.location.href).toBe(`${ORIGIN}/org/billing`)
    unmount()
  })

  it('au retour (`?billing=method&payment_ref=`), le constat sonde avec la référence et recopie la phrase servie',
    async () => {
      fakeLocation('/org/billing?billing=method&payment_ref=tr_neuf')
      getBilling.mockResolvedValue(ACTIF)
      confirmBillingMethodChange.mockResolvedValue({
        status: 'changed', notice: 'Ton nouveau moyen de paiement est actif.',
      })

      const { host, unmount } = await mountView()

      expect(confirmBillingMethodChange).toHaveBeenCalledWith('tr_neuf')
      expect(host.textContent).toContain('Ton nouveau moyen de paiement est actif.')
      // L'abonnement s'est relu après la bascule (le moyen affiché en dépend)…
      expect(getBilling).toHaveBeenCalledTimes(2)
      // …et le geste est de nouveau armé.
      expect(boutonNomme(host, 'Changer de carte')).toBeTruthy()
      unmount()
    })

  it('au retour, une carte refusée : la phrase servie, l\'abonnement inchangé, et de quoi réessayer',
    async () => {
      fakeLocation('/org/billing?billing=method&payment_ref=tr_neuf')
      getBilling.mockResolvedValue(ACTIF)
      confirmBillingMethodChange.mockResolvedValue({
        status: 'failed', payment_status: 'failed',
        notice: 'Ton moyen de paiement actuel n\'a pas changé.',
      })

      const { host, unmount } = await mountView()

      expect(host.textContent).toContain('Ton moyen de paiement actuel n\'a pas changé.')
      expect(host.textContent).toContain('Carte bancaire')
      expect(getBilling).toHaveBeenCalledTimes(1)
      expect(boutonsNommes(host, 'Changer de carte').length).toBeGreaterThan(0)
      unmount()
    })
})
