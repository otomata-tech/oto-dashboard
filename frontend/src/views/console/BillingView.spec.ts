// L'écran de facturation, branché sur oto-commerce. Ce que le typecheck ne voit pas, et
// que ces tests fixent :
//   1. chaque geste part vers la BONNE route du commerce, l'org dans le chemin, avec le
//      bon corps (places, acceptations des documents d'achat, identité entière…) ;
//   2. une alerte porte son levier, et le formulaire qu'elle désigne est monté ;
//   3. tant qu'une souscription est en vol, aucun bouton « payer » n'est atteignable —
//      l'écran RELIT l'abonnement, il ne confirme rien lui-même (le webhook fait foi) ;
//   4. un membre ne voit que son propre statut ; en consultation, le commerce n'est pas
//      appelé du tout ;
//   5. une org sous contrat en cours voit son contrat À LA PLACE de l'offre ; un contrat
//      clos ne masque rien.
//
// Le transport (`apiCommerce`) est remplacé par un faux commerce ; `api/console` est le
// VRAI : c'est lui qui compose les routes que ces tests lisent.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n } from '@/lib/i18n'
import { usePrompt } from '@/composables/usePrompt'
import type {
  CommerceAbonnement, CommerceAvantages, CommerceContrat, CommerceIdentiteVue, CommerceMoi,
  CommercePaiement,
} from '@/types/api.commerce'

const commerce = vi.hoisted(() => ({ apiCommerce: vi.fn(), apiCommerceDownload: vi.fn() }))
vi.mock('@/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api')>()), ...commerce,
}))
import { ApiError } from '@/api'

const me = ref<{
  org_role: string | null; role: string; active_org: number | null; active_org_name: string
  active_org_readonly?: boolean; view_as_read_only?: boolean
} | null>(null)
// Les helpers de rôle sont les VRAIS (oto#210) : seul le profil est un bouchon.
vi.mock('@/composables/useMe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/composables/useMe')>()),
  useMe: () => ({ me }),
}))

// ── le faux commerce ─────────────────────────────────────────────────────────

const ACTIF: CommerceAbonnement = {
  tarif: 'par_membre', places: 3, places_a_l_echeance: null, payants: ['u1', 'u2', 'u3'],
  montant_ht: 7500, tva_bps: 2000, tva: 1500, montant_ttc: 9000, regime_tva: 'fr_ttc',
  tva_bloquee: null, statut: 'active', periode_fin: '2026-10-25T00:00:00+00:00',
  echeance: '2026-10-25T00:00:00+00:00', grace_fin: null, resilie_le: null,
  droits_jusqu_au: '2026-11-15T00:00:00+00:00', essai: null,
}
// L'état d'Alexis au 2026-09-02 : abonné, actif, et pas de TTC calculable.
const BLOQUE: CommerceAbonnement = {
  ...ACTIF, tva_bps: null, tva: null, montant_ttc: null, regime_tva: null,
  tva_bloquee: 'billing_identity_required',
}
const RESILIE: CommerceAbonnement = { ...ACTIF, resilie_le: '2026-09-20T10:00:00+00:00', echeance: null }
const IMPAYE: CommerceAbonnement = { ...ACTIF, statut: 'past_due', grace_fin: '2026-11-09T00:00:00+00:00' }
const OUVERT: CommerceAbonnement = { ...ACTIF, statut: 'incomplete', periode_fin: null, echeance: null }

const FICHE_VIDE: CommerceIdentiteVue = {
  identite: null, manquants: ['legal_name', 'country_code', 'address_line', 'postal_code', 'city', 'email'],
}
const FICHE_PLEINE: CommerceIdentiteVue = {
  identite: { legal_name: 'ACME SAS', country_code: 'FR', vat_number: null,
    address_line: '1 rue du Test', postal_code: '13001', city: 'Marseille', email: 'compta@acme.test' },
  manquants: [],
}
const CGV = { documents: {
  cgv: { version: '2.1', label: 'CGV', url: 'https://oto.cx/cgv' },
  dpa: { version: '2.1', label: 'DPA', url: 'https://oto.cx/dpa' },
} }
let idPaiement = 0
const paiement = (nature: string, statut: string): CommercePaiement => ({
  id: ++idPaiement, created_at: '2026-09-28T10:00:00+00:00', nature, statut, places: 3, montant_ht: 7500,
  tva_bps: 2000, tva: 1500, montant_ttc: 9000, regime_tva: 'fr_ttc', periode_fin: null,
})

// Un abonnement réglé hors plateforme, posé par l'admin plateforme.
const CONTRAT: CommerceContrat = {
  licences: 12, droits: ['unipile', 'platform_unmetered'], debut: '2026-01-01T00:00:00+00:00',
  fin: '2999-12-31T12:00:00+00:00', reference: 'BC-2026-007',
}

const srv: {
  abonnement: CommerceAbonnement | null
  contrat: CommerceContrat | null
  avantages: CommerceAvantages
  paiements: CommercePaiement[]
  identite: CommerceIdentiteVue
  moi: CommerceMoi
  // Un refus à rendre pour « VERBE chemin ».
  refus: Record<string, ApiError>
  // Ce qu'un geste change dans le monde, une fois accepté.
  apres: Record<string, () => void>
} = { abonnement: null, contrat: null, avantages: { essai: null, dons: [] }, paiements: [], identite: FICHE_PLEINE,
  moi: { payant: false, jusqu_au: null }, refus: {}, apres: {} }
const appels: { geste: string; corps: unknown }[] = []

function servir() {
  commerce.apiCommerce.mockImplementation(async (path: string, init: RequestInit = {}) => {
    const geste = `${init.method ?? 'GET'} ${path}`
    appels.push({ geste, corps: init.body ? JSON.parse(String(init.body)) : undefined })
    const refus = srv.refus[geste]
    if (refus) throw refus
    srv.apres[geste]?.()
    const o = '/api/orgs/42'
    switch (geste) {
      case 'GET /api/tarif': return { prix_ht_par_place: 2500, devise: 'eur', intervalle: 'month' }
      case 'GET /api/cgv': return CGV
      case `GET ${o}/moi`: return srv.moi
      case `GET ${o}/avantages`: return srv.avantages
      case `GET ${o}/abonnement`:
        if (!srv.abonnement) throw new ApiError(404, 'no_subscription', 'l\'org #42 n\'a pas d\'abonnement')
        return srv.abonnement
      case `GET ${o}/contrat`:
        if (!srv.contrat) throw new ApiError(404, 'no_contract', 'l\'org #42 n\'a pas de contrat')
        return srv.contrat
      case `GET ${o}/paiements`: return { paiements: srv.paiements }
      case `GET ${o}/identite`: return srv.identite
      case `PUT ${o}/identite`: return srv.identite
      case `GET ${o}/factures`: return { factures: [] }
      case `POST ${o}/abonnement`: return { checkout_url: 'https://pay.invalid/souscription' }
      case `POST ${o}/moyen-de-paiement`: return { checkout_url: 'https://pay.invalid/carte' }
      case `PATCH ${o}/abonnement`:
      case `POST ${o}/abonnement/resiliation`:
      case `DELETE ${o}/abonnement/resiliation`: return { ok: true }
    }
    throw new Error(`route inattendue : ${geste}`)
  })
}
const gestes = () => appels.map((a) => a.geste)
const corpsDe = (geste: string) => appels.find((a) => a.geste === geste)?.corps

// ── le montage ───────────────────────────────────────────────────────────────

// `window.location` est remplacé par un objet nu : la vue écrit `href` pour partir chez
// le prestataire — jsdom ne navigue pas, on lit ce qui a été écrit.
const ORIGIN = 'http://localhost:3000'
function fakeLocation() {
  Object.defineProperty(window, 'location', {
    configurable: true, writable: true,
    value: { origin: ORIGIN, href: `${ORIGIN}/org/billing`, assign: vi.fn() },
  })
}

async function mountView() {
  const View = (await import('./BillingView.vue')).default
  const Vide = defineComponent({ render: () => h('div') })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/org/billing', component: Vide },
      { path: '/platform/orgs/:id', component: Vide },
    ],
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

// Les lectures s'enchaînent : laisser les microtâches se vider (horloge réelle ou figée).
async function settle() {
  for (let i = 0; i < 10; i++) await nextTick()
  if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(20)
  else await new Promise((r) => setTimeout(r, 20))
  for (let i = 0; i < 10; i++) await nextTick()
}

const texte = (host: HTMLElement) => (host.textContent ?? '').replace(/\p{Zs}/gu, ' ')
function boutonNomme(host: HTMLElement, t: string): HTMLButtonElement | undefined {
  return [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(t))
}
function boutonsNommes(host: HTMLElement, t: string): HTMLButtonElement[] {
  return [...host.querySelectorAll('button')].filter((b) => b.textContent?.includes(t))
}
async function saisir(input: HTMLInputElement, valeur: string) {
  input.value = valeur
  input.dispatchEvent(new Event('input'))
  await nextTick()
}

beforeEach(() => {
  vi.clearAllMocks()
  i18n.global.locale.value = 'fr'
  me.value = { org_role: 'org_admin', role: 'member', active_org: 42, active_org_name: 'ACME' }
  appels.length = 0
  Object.assign(srv, { abonnement: null, contrat: null, avantages: { essai: null, dons: [] }, paiements: [],
    identite: FICHE_PLEINE, moi: { payant: false, jusqu_au: null }, refus: {}, apres: {} })
  servir()
  fakeLocation()
})
afterEach(() => { vi.useRealTimers() })

// ── souscrire ────────────────────────────────────────────────────────────────

describe('BillingView — souscrire un nombre de membres', () => {
  it('sans abonnement (404 no_subscription), l\'offre dit le prix d\'une place — plus aucun palier',
    async () => {
      const { host, unmount } = await mountView()
      const txt = texte(host)
      expect(txt).toContain('Choisir un abonnement')
      expect(txt).toContain('25 €')
      expect(txt).toContain('HT par membre et par mois')
      expect(txt).not.toContain('sur devis')
      // L'org est dans le chemin de chaque lecture.
      expect(gestes()).toEqual(expect.arrayContaining([
        'GET /api/orgs/42/abonnement', 'GET /api/orgs/42/contrat', 'GET /api/orgs/42/avantages',
        'GET /api/orgs/42/paiements', 'GET /api/tarif']))
      // Sans contrat (404 no_contract) : aucune carte de contrat.
      expect(txt).not.toContain('Votre contrat')
      unmount()
    })

  it('le tunnel annonce le TTC de N places, puis souscrit avec les places et les versions acceptées',
    async () => {
      const { host, unmount } = await mountView()
      await saisir(host.querySelector<HTMLInputElement>('input[type=number]')!, '3')
      expect(texte(host)).toContain('Soit 75 € HT par mois.')
      boutonNomme(host, 'Continuer')!.click()
      await settle()

      // Montant AVANT le consentement : 3 × 25 € HT, TVA française 20 % → 90 € TTC.
      const txt = texte(host)
      expect(txt).toContain('Abonnement pour 3 membres')
      expect(txt).toContain('90')
      expect(txt).toContain('version 2.1')
      const payer = boutonNomme(host, 'Payer')!
      expect(payer.disabled).toBe(true)

      const caseCgv = host.querySelector<HTMLInputElement>('input[type=checkbox]')!
      caseCgv.checked = true
      caseCgv.dispatchEvent(new Event('change'))
      await nextTick()
      boutonNomme(host, 'Payer')!.click()
      await settle()

      expect(corpsDe('POST /api/orgs/42/abonnement')).toEqual({
        places: 3, methode: 'card', acceptations: { cgv: '2.1', dpa: '2.1' },
      })
      // Plus d'acceptation à part au cœur : elle est DANS la souscription.
      expect(gestes().some((g) => g.includes('/legal'))).toBe(false)
      expect(window.location.href).toBe('https://pay.invalid/souscription')
      unmount()
    })

  it('un document qui change entre l\'affichage et le clic : on repeint, on ne part pas',
    async () => {
      srv.refus['POST /api/orgs/42/abonnement'] = new ApiError(400, 'purchase_documents_required',
        'à accepter, à leur version en vigueur : cgv 2.2')
      const { host, unmount } = await mountView()
      boutonNomme(host, 'Continuer')!.click()
      await settle()
      const caseCgv = host.querySelector<HTMLInputElement>('input[type=checkbox]')!
      caseCgv.checked = true
      caseCgv.dispatchEvent(new Event('change'))
      await nextTick()
      boutonNomme(host, 'Payer')!.click()
      await settle()

      expect(texte(host)).toContain('Ces documents ont changé à l\'instant')
      // La case se recoche en connaissance de cause, et les documents se relisent.
      expect(host.querySelector<HTMLInputElement>('input[type=checkbox]')!.checked).toBe(false)
      expect(gestes().filter((g) => g === 'GET /api/cgv')).toHaveLength(2)
      expect(window.location.href).toBe(`${ORIGIN}/org/billing`)
      unmount()
    })

  it('un premier paiement déjà ouvert (409 payment_pending) : le refus tel quel, et plus de « Payer »',
    async () => {
      const refus = 'un premier paiement de l\'org #42 est en cours chez Mollie'
      srv.refus['POST /api/orgs/42/abonnement'] = new ApiError(409, 'payment_pending', refus)
      const { host, unmount } = await mountView()
      boutonNomme(host, 'Continuer')!.click()
      await settle()
      const caseCgv = host.querySelector<HTMLInputElement>('input[type=checkbox]')!
      caseCgv.checked = true
      caseCgv.dispatchEvent(new Event('change'))
      await nextTick()
      boutonNomme(host, 'Payer')!.click()
      await settle()

      expect(texte(host)).toContain(refus)
      expect(boutonNomme(host, 'Payer')).toBeUndefined()
      expect(boutonNomme(host, 'Actualiser')).toBeTruthy()
      expect(window.location.href).toBe(`${ORIGIN}/org/billing`)
      unmount()
    })

  it('ce qui est offert (essai, dons) se dit AU-DESSUS de l\'offre, qui reste ouverte', async () => {
    srv.avantages = { essai: { fin: '2999-01-01T00:00:00+00:00' }, dons: [{ droit: 'unipile', fin: null }] }
    const { host, unmount } = await mountView()
    const txt = texte(host)
    expect(txt).toContain('Essai gratuit')
    expect(txt).toContain('Messagerie LinkedIn & WhatsApp (Unipile)')
    expect(txt.indexOf('Ce qui vous est offert')).toBeLessThan(txt.indexOf('Choisir un abonnement'))
    expect(boutonNomme(host, 'Continuer')).toBeTruthy()
    unmount()
  })
})

// ── sous contrat ─────────────────────────────────────────────────────────────

// Un abonnement réglé hors plateforme : l'org a payé. Lui proposer l'offre, c'était
// l'inviter à payer deux fois — le commerce le refuse (409 under_contract).
describe('BillingView — une org sous contrat', () => {
  it('contrat en cours : la carte du contrat, et ni l\'offre ni le tarif', async () => {
    srv.contrat = CONTRAT
    const { host, unmount } = await mountView()
    const txt = texte(host)
    expect(txt).toContain('Votre contrat')
    expect(txt).toContain('12')
    expect(txt).toContain('Messagerie LinkedIn & WhatsApp (Unipile)')
    expect(txt).toContain('Connecteurs de données sans quota d\'appel')
    expect(txt).toContain('Référence : BC-2026-007')
    expect(txt).toContain('depuis le')
    expect(txt).toContain('31 décembre 2999')
    expect(txt).not.toContain('Choisir un abonnement')
    expect(boutonNomme(host, 'Continuer')).toBeUndefined()
    expect(gestes()).not.toContain('GET /api/tarif')
    unmount()
  })

  it('contrat sans échéance (reconduction tacite) : « sans échéance », jamais une date inventée',
    async () => {
      srv.contrat = { ...CONTRAT, fin: null, debut: null, licences: null, reference: null }
      const { host, unmount } = await mountView()
      const txt = texte(host)
      expect(txt).toContain('Votre contrat')
      expect(txt).toContain('sans échéance')
      expect(txt).not.toContain('depuis le')
      expect(txt).not.toContain('Référence')
      expect(txt).not.toContain('Choisir un abonnement')
      unmount()
    })

  it('sous contrat, un don ÉCHU ne renvoie pas vers une offre absente', async () => {
    srv.contrat = CONTRAT
    srv.avantages = { essai: null, dons: [{ droit: 'unipile', fin: '2020-01-01T00:00:00+00:00' }] }
    const { host, unmount } = await mountView()
    const txt = texte(host)
    expect(txt).toContain('Cette offre a pris fin le')
    expect(txt).not.toContain('ci-dessous')
    expect(txt).not.toContain('Choisir un abonnement')
    unmount()
  })

  it('contrat CLOS : il ne masque rien, l\'offre revient', async () => {
    srv.contrat = { ...CONTRAT, fin: '2020-01-01T00:00:00+00:00' }
    const { host, unmount } = await mountView()
    const txt = texte(host)
    expect(txt).not.toContain('Votre contrat')
    expect(txt).toContain('Choisir un abonnement')
    expect(boutonNomme(host, 'Continuer')).toBeTruthy()
    unmount()
  })

  it('un contrat posé entre la lecture et le clic (409 under_contract) : le message traduit, plus de « Payer »',
    async () => {
      srv.refus['POST /api/orgs/42/abonnement'] = new ApiError(409, 'under_contract',
        'l\'org #42 est sous contrat')
      const { host, unmount } = await mountView()
      boutonNomme(host, 'Continuer')!.click()
      await settle()
      const caseCgv = host.querySelector<HTMLInputElement>('input[type=checkbox]')!
      caseCgv.checked = true
      caseCgv.dispatchEvent(new Event('change'))
      await nextTick()
      boutonNomme(host, 'Payer')!.click()
      await settle()

      expect(texte(host)).toContain('l\'organisation est sous contrat')
      expect(boutonNomme(host, 'Payer')).toBeUndefined()
      expect(window.location.href).toBe(`${ORIGIN}/org/billing`)

      // « Actualiser » relit l'état : le contrat est là, à la place de l'offre.
      srv.contrat = CONTRAT
      boutonNomme(host, 'Actualiser')!.click()
      await settle()
      expect(texte(host)).toContain('Votre contrat')
      expect(texte(host)).not.toContain('Choisir un abonnement')
      unmount()
    })
})

// ── l'attente d'ouverture ────────────────────────────────────────────────────

describe('BillingView — après la page de paiement, on relit (le webhook fait foi)', () => {
  it('souscription en vol : aucun « payer » atteignable, et l\'écran s\'ouvre quand le commerce active',
    async () => {
      vi.useFakeTimers()
      srv.abonnement = OUVERT
      srv.paiements = [paiement('initial', 'open')]

      const { host, unmount } = await mountView()
      expect(texte(host)).toContain('Souscription en cours')
      expect(boutonNomme(host, 'Continuer')).toBeUndefined()
      expect(boutonNomme(host, 'Payer')).toBeUndefined()

      // Le webhook a ouvert l'abonnement : la relecture suivante le constate.
      srv.abonnement = ACTIF
      srv.paiements = [paiement('initial', 'paid')]
      await vi.advanceTimersByTimeAsync(5000)
      await settle()

      expect(texte(host)).not.toContain('Souscription en cours')
      expect(boutonNomme(host, 'Résilier l\'abonnement')).toBeTruthy()
      // Aucune confirmation côté client : rien d'autre que des relectures.
      expect(gestes().every((g) => g.startsWith('GET '))).toBe(true)
      unmount()
    })

  it('paiement reçu, ouverture en cours : une ATTENTE, jamais un échec', async () => {
    srv.abonnement = OUVERT
    srv.paiements = [paiement('initial', 'paid')]
    const { host, unmount } = await mountView()
    const txt = texte(host)
    expect(txt).toContain('Votre paiement a bien été reçu.')
    expect(txt).not.toContain('échec')
    expect(boutonNomme(host, 'Payer')).toBeUndefined()
    unmount()
  })

  it('le dernier paiement a échoué : rien n\'est en vol, l\'offre se rouvre et le dit', async () => {
    srv.abonnement = OUVERT
    srv.paiements = [paiement('initial', 'failed')]
    const { host, unmount } = await mountView()
    expect(texte(host)).toContain('Le dernier paiement n\'a pas abouti')
    expect(boutonNomme(host, 'Continuer')).toBeTruthy()
    unmount()
  })
})

// ── l'abonné ─────────────────────────────────────────────────────────────────

describe('BillingView — l\'abonné', () => {
  it('montre le TTC de l\'échéance, les places, et ses trois gestes', async () => {
    srv.abonnement = ACTIF
    const { host, unmount } = await mountView()
    const txt = texte(host)
    expect(txt).toContain('90 €')
    expect(txt).toContain('par mois, TTC')
    expect(txt).toContain('membres payants')
    expect(boutonNomme(host, 'Changer le nombre de membres')).toBeTruthy()
    expect(boutonNomme(host, 'Changer de carte')).toBeTruthy()
    expect(boutonNomme(host, 'Résilier l\'abonnement')).toBeTruthy()
    // La carte « usage inclus » a disparu (décision d'Alexis).
    expect(txt).not.toContain('appels ce mois-ci')
    unmount()
  })

  it('changer le nombre de membres part en PATCH, et une baisse se dit à l\'échéance', async () => {
    srv.abonnement = ACTIF
    srv.apres['PATCH /api/orgs/42/abonnement'] = () => {
      srv.abonnement = { ...ACTIF, places_a_l_echeance: 2 }
    }
    const { host, unmount } = await mountView()
    boutonNomme(host, 'Changer le nombre de membres')!.click()
    await nextTick()
    expect(texte(host)).toContain('une baisse prend effet à l\'échéance')
    await saisir(host.querySelector<HTMLInputElement>('input[type=number]')!, '2')
    boutonNomme(host, 'Enregistrer')!.click()
    await settle()

    expect(corpsDe('PATCH /api/orgs/42/abonnement')).toEqual({ places: 2 })
    expect(texte(host)).toContain('Baisse programmée : 2 membres payants à partir du')
    unmount()
  })

  it('un abonné au FORFAIT n\'a pas de places à choisir', async () => {
    srv.abonnement = { ...ACTIF, tarif: 'forfait' }
    const { host, unmount } = await mountView()
    expect(texte(host)).toContain('tarif conservé')
    expect(boutonNomme(host, 'Changer le nombre de membres')).toBeUndefined()
    unmount()
  })

  it('échéance incalculable : l\'alerte porte son levier, et le formulaire est monté dessous',
    async () => {
      srv.abonnement = BLOQUE
      srv.identite = FICHE_VIDE
      const { host, unmount } = await mountView()
      expect(texte(host)).toContain('La prochaine échéance ne peut pas être calculée')
      expect(boutonNomme(host, 'Compléter l\'identité de facturation')).toBeTruthy()
      const carte = host.querySelector('#billing-identity')
      expect(carte, 'la carte d\'identité de facturation est absente').toBeTruthy()
      expect(carte!.textContent).toContain('Raison sociale')
      unmount()
    })

  it('enregistrer l\'identité l\'écrit ENTIÈRE (adresse d\'envoi comprise), et l\'alerte tombe à la relecture',
    async () => {
      srv.abonnement = BLOQUE
      srv.identite = FICHE_VIDE
      srv.apres['PUT /api/orgs/42/identite'] = () => {
        srv.identite = FICHE_PLEINE
        srv.abonnement = ACTIF
      }
      const { host, unmount } = await mountView()
      const champs = [...host.querySelectorAll<HTMLInputElement>('#billing-identity input')]
      await saisir(champs[0]!, 'ACME SAS')
      await saisir(host.querySelector<HTMLInputElement>('#billing-identity input[type=email]')!, 'compta@acme.test')
      boutonNomme(host, 'Enregistrer')!.click()
      await settle()

      expect(corpsDe('PUT /api/orgs/42/identite')).toMatchObject({
        legal_name: 'ACME SAS', country_code: 'FR', email: 'compta@acme.test',
      })
      expect(texte(host)).not.toContain('La prochaine échéance ne peut pas être calculée')
      unmount()
    })

  it('résiliation programmée : l\'alerte offre de l\'annuler (DELETE), « Résilier » a disparu',
    async () => {
      srv.abonnement = RESILIE
      srv.apres['DELETE /api/orgs/42/abonnement/resiliation'] = () => { srv.abonnement = ACTIF }
      const { host, unmount } = await mountView()
      expect(texte(host)).toContain('Résiliation programmée')
      expect(boutonNomme(host, 'Résilier l\'abonnement')).toBeUndefined()
      boutonNomme(host, 'Annuler la résiliation')!.click()
      await settle()
      expect(gestes()).toContain('DELETE /api/orgs/42/abonnement/resiliation')
      expect(texte(host)).not.toContain('Résiliation programmée')
      unmount()
    })

  it('un refus du commerce s\'affiche tel quel, avec de quoi relire l\'état', async () => {
    srv.abonnement = RESILIE
    const refus = 'l\'org #42 n\'a pas de résiliation à annuler'
    srv.refus['DELETE /api/orgs/42/abonnement/resiliation'] = new ApiError(400, 'not_canceled', refus)
    const { host, unmount } = await mountView()
    boutonNomme(host, 'Annuler la résiliation')!.click()
    await settle()
    expect(texte(host)).toContain(refus)
    expect(boutonNomme(host, 'Actualiser')).toBeTruthy()
    unmount()
  })

  it('résilier passe par un dialogue, puis POST /abonnement/resiliation', async () => {
    srv.abonnement = ACTIF
    const { state, resolve } = usePrompt()
    const { host, unmount } = await mountView()
    boutonNomme(host, 'Résilier l\'abonnement')!.click()
    await settle()
    expect(state.value?.kind).toBe('confirm')
    resolve(true)
    await settle()
    expect(gestes()).toContain('POST /api/orgs/42/abonnement/resiliation')
    unmount()
  })
})

describe('BillingView — changer de carte', () => {
  it('la phrase s\'affiche AVANT de partir, puis POST /moyen-de-paiement envoie chez le prestataire',
    async () => {
      srv.abonnement = ACTIF
      const { state, resolve } = usePrompt()
      const { host, unmount } = await mountView()
      boutonNomme(host, 'Changer de carte')!.click()
      await settle()

      expect(state.value?.kind === 'confirm' && state.value.config.message)
        .toContain('L\'ancien reste actif tant que le nouveau n\'est pas confirmé')
      // Tant qu'on n'a pas continué, rien n'est ouvert et on n'est parti nulle part.
      expect(gestes()).not.toContain('POST /api/orgs/42/moyen-de-paiement')
      expect(window.location.href).toBe(`${ORIGIN}/org/billing`)

      resolve(true)
      await settle()
      // Carte seulement, sans corps.
      expect(gestes()).toContain('POST /api/orgs/42/moyen-de-paiement')
      expect(corpsDe('POST /api/orgs/42/moyen-de-paiement')).toBeUndefined()
      expect(window.location.href).toBe('https://pay.invalid/carte')
      unmount()
    })

  it('en impayé, c\'est l\'alerte qui porte « Changer de carte » — une seule fois', async () => {
    srv.abonnement = IMPAYE
    const { host, unmount } = await mountView()
    expect(texte(host)).toContain('Paiement en échec')
    expect(boutonsNommes(host, 'Changer de carte')).toHaveLength(1)
    unmount()
  })

  it('un changement déjà en validation se dit, et n\'en arme pas un second', async () => {
    srv.abonnement = ACTIF
    // Du plus récent au plus ancien, comme le commerce le sert.
    srv.paiements = [paiement('method_change', 'open'), paiement('initial', 'paid')]
    const { host, unmount } = await mountView()
    expect(texte(host)).toContain('Un nouveau moyen de paiement est en cours de validation')
    expect(boutonNomme(host, 'Changer de carte')).toBeUndefined()
    unmount()
  })
})

// ── qui voit quoi ────────────────────────────────────────────────────────────

describe('BillingView — un membre ne voit que son propre statut', () => {
  it('lit GET /moi, et rien d\'autre', async () => {
    me.value = { org_role: 'member', role: 'member', active_org: 42, active_org_name: 'ACME' }
    srv.moi = { payant: true, jusqu_au: '2026-11-15T00:00:00+00:00' }
    const { host, unmount } = await mountView()
    expect(texte(host)).toContain('Vous faites partie des membres payants')
    expect(texte(host)).toContain('réservés aux administrateurs')
    expect(gestes()).toEqual(['GET /api/orgs/42/moi'])
    expect(boutonNomme(host, 'Résilier')).toBeUndefined()
    unmount()
  })
})

// En consultation (oto#211) ou « vu en tant que » (oto#212), le jeton reste celui de
// l'opérateur, qui n'est pas membre : le commerce refuserait tout. L'écran ne l'appelle
// pas, et renvoie à la fiche d'org de la plateforme.
describe('BillingView — en consultation, le commerce n\'est pas appelé', () => {
  it.each([
    ['consultation', { active_org_readonly: true }],
    ['voir en tant que', { view_as_read_only: true }],
  ])('%s : aucune lecture, aucun geste, et le renvoi vers la fiche d\'org', async (_nom, over) => {
    me.value = { org_role: 'org_admin', role: 'super_admin', active_org: 42, active_org_name: 'ACME', ...over }
    srv.abonnement = ACTIF
    const { host, unmount } = await mountView()
    expect(commerce.apiCommerce).not.toHaveBeenCalled()
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/platform/orgs/42')
    for (const g of ['Continuer', 'Changer de carte', 'Résilier l\'abonnement', 'Enregistrer']) {
      expect(boutonNomme(host, g), g).toBeUndefined()
    }
    unmount()
  })
})
