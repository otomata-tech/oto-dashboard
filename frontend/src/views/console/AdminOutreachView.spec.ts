// Ce que le typecheck ne voit pas : qu'un écran ne SAUTE aucun verrou.
//
// Cette surface fait partir des mails sous notre marque. Un écran qui « simplifierait »
// en sautant l'essai ou la confirmation ne contournerait rien — le serveur refuserait —
// mais il aurait menti sur l'état du garde. Ces tests fixent les quatre choses qu'aucun
// type ne protège :
//   1. retoucher le texte après un aperçu RE-VERROUILLE l'envoi ;
//   2. le nombre confirmé est EXACTEMENT celui qui a été annoncé ;
//   3. rien ne part sans que l'opérateur ait confirmé ;
//   4. qui n'a pas le droit d'envoyer ne voit pas les boutons — il ne les découvre
//      pas grisés, et surtout pas au clic.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import { i18n } from '@/lib/i18n'

const api = vi.hoisted(() => ({
  getOutreachAudience: vi.fn(),
  getOutreachPreview: vi.fn(),
  sendOutreachTest: vi.fn(),
  sendOutreach: vi.fn(),
  getOutreachJournal: vi.fn(),
  getOutreachOptouts: vi.fn(),
  clearOutreachOptout: vi.fn(),
}))
vi.mock('@/api/console', () => api)

const confirmAction = vi.hoisted(() => vi.fn())
vi.mock('@/composables/usePrompt', () => ({ usePrompt: () => ({ confirmAction }) }))
vi.mock('@/composables/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }))

const me = ref<{ role: string } | null>(null)
vi.mock('@/composables/useMe', () => ({
  useMe: () => ({ me }),
  isSuperAdmin: (m: { role?: string } | null) => m?.role === 'super_admin',
  isPlatformOperator: (m: { role?: string } | null) =>
    m?.role === 'admin' || m?.role === 'super_admin',
}))

const DESTINATAIRES = [
  { sub: 'a', email: 'a@x.com', name: null, created_at: '2026-08-01 00:00:00',
    calls: 0, last_seen_at: null, previous_outreach: 0, locale: null,
    served_locale: 'en', locale_source: 'default', email_domain: 'x.com',
    sent: null, reason: null },
  { sub: 'b', email: 'b@y.fr', name: null, created_at: '2026-08-02 00:00:00',
    calls: 0, last_seen_at: null, previous_outreach: 0, locale: 'fr',
    served_locale: 'fr', locale_source: 'declared', email_domain: 'y.fr',
    sent: null, reason: null },
]
const BASE = {
  op: 'audience', campaign: 'c', recipients: DESTINATAIRES, total: 2, selected: 2,
  truncated: false, with_declared_locale: 1, with_default_locale: 1, sent: 0,
  cleared: false, preview_html: {}, fingerprint: null, tested_locales: [],
  log: [], optouts: [],
}
// L'aperçu rend l'empreinte ; l'essai a été reçu dans les DEUX langues servies.
const APERCU_ESSAYE = {
  ...BASE, op: 'preview', preview_html: { en: '<html>en</html>', fr: '<html>fr</html>' },
  fingerprint: 'sha-1', tested_locales: ['en', 'fr'],
}

async function settle() {
  for (let i = 0; i < 12; i++) await nextTick()
  await new Promise((r) => setTimeout(r, 10))
  for (let i = 0; i < 12; i++) await nextTick()
}

async function monte() {
  const View = (await import('./AdminOutreachView.vue')).default
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(h(View))
  app.use(i18n)
  app.mount(host)
  await settle()
  return { host, done: () => { app.unmount(); host.remove() } }
}

function bouton(host: HTMLElement, texte: string): HTMLButtonElement | undefined {
  return [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(texte))
}
function saisir(host: HTMLElement, placeholder: string, valeur: string) {
  const el = [...host.querySelectorAll('input')]
    .find((i) => i.placeholder?.includes(placeholder)) as HTMLInputElement
  el.value = valeur
  el.dispatchEvent(new Event('input'))
}
/** Le bloc de rédaction d'une langue servie (un par langue). */
function blocsLangue(host: HTMLElement): HTMLElement[] {
  return [...host.querySelectorAll<HTMLElement>('.lang')]
}
function ecrire(bloc: HTMLElement, sujet: string, corps = 'Corps du message.') {
  const s = bloc.querySelector('input') as HTMLInputElement
  s.value = sujet
  s.dispatchEvent(new Event('input'))
  const c = bloc.querySelector('textarea') as HTMLTextAreaElement
  c.value = corps
  c.dispatchEvent(new Event('input'))
}

/** Amène l'écran à l'état « prêt à envoyer » : audience lue, message rédigé dans
 *  CHAQUE langue servie, aperçu obtenu, essai reçu. */
async function jusquAuPret(host: HTMLElement) {
  saisir(host, 'onboarding', 'onboarding-2026-09')
  await settle()
  bouton(host, 'Voir l\'audience')!.click()
  await settle()
  for (const bloc of blocsLangue(host)) ecrire(bloc, 'Un sujet')
  await settle()
  bouton(host, 'Aperçu')!.click()
  await settle()
}

beforeEach(() => {
  vi.clearAllMocks()
  i18n.global.locale.value = 'fr'
  me.value = { role: 'super_admin' }
  api.getOutreachAudience.mockResolvedValue(BASE)
  api.getOutreachPreview.mockResolvedValue(APERCU_ESSAYE)
  api.sendOutreach.mockResolvedValue({ ...BASE, op: 'send', sent: 2 })
  api.sendOutreachTest.mockResolvedValue(APERCU_ESSAYE)
  api.getOutreachJournal.mockResolvedValue({ ...BASE, log: [] })
  api.getOutreachOptouts.mockResolvedValue({ ...BASE, optouts: [] })
  confirmAction.mockResolvedValue(true)
})

describe('AdminOutreachView — l\'écran ne saute aucun verrou', () => {
  it('essai reçu dans les deux langues : l\'envoi s\'arme et annonce le nombre', async () => {
    const v = await monte()
    await jusquAuPret(v.host)
    expect(v.host.textContent).toContain('Essai reçu pour ce texte')
    const envoyer = bouton(v.host, 'Envoyer à')!
    expect(envoyer.disabled).toBe(false)
    expect(envoyer.textContent).toContain('2')
    v.done()
  })

  it('⚠️ retoucher le texte après l\'aperçu RE-VERROUILLE l\'envoi', async () => {
    const v = await monte()
    await jusquAuPret(v.host)
    expect(bouton(v.host, 'Envoyer à')!.disabled).toBe(false)

    // Une virgule de plus dans le sujet, et l'essai ne vaut plus : il portait sur un
    // autre texte. C'est le cœur du verrou n°3.
    ecrire(blocsLangue(v.host)[0]!, 'Un sujet retouché')
    await settle()

    expect(bouton(v.host, 'Envoyer à')!.disabled).toBe(true)
    expect(v.host.textContent).toContain('invalide l\'essai')
    expect(v.host.textContent).not.toContain('Essai reçu pour ce texte')
    v.done()
  })

  it('⚠️ le nombre CONFIRMÉ est exactement celui qui a été annoncé', async () => {
    const v = await monte()
    await jusquAuPret(v.host)
    bouton(v.host, 'Envoyer à')!.click()
    await settle()
    // La confirmation dit N…
    expect(confirmAction).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('2 personnes') }))
    // …et c'est ce même N qui part.
    expect(api.sendOutreach).toHaveBeenCalledWith(expect.objectContaining({ confirm: 2 }))
    v.done()
  })

  it('⚠️ confirmation refusée : RIEN ne part', async () => {
    confirmAction.mockResolvedValue(false)
    const v = await monte()
    await jusquAuPret(v.host)
    bouton(v.host, 'Envoyer à')!.click()
    await settle()
    expect(api.sendOutreach).not.toHaveBeenCalled()
    v.done()
  })

  it('⚠️ l\'essai part vers l\'opérateur, et seulement après confirmation', async () => {
    confirmAction.mockResolvedValue(false)
    const v = await monte()
    await jusquAuPret(v.host)
    bouton(v.host, 'M\'envoyer l\'essai')!.click()
    await settle()
    expect(api.sendOutreachTest).not.toHaveBeenCalled()
    v.done()
  })

  it('⚠️ un opérateur qui n\'a pas le droit d\'envoyer ne voit PAS les boutons', async () => {
    me.value = { role: 'admin' }   // platform_admin : lecture seulement
    const v = await monte()
    await jusquAuPret(v.host)
    // Omis, jamais grisés : un levier inerte se découvre au clic.
    expect(bouton(v.host, 'Envoyer à')).toBeUndefined()
    expect(bouton(v.host, 'M\'envoyer l\'essai')).toBeUndefined()
    expect(v.host.textContent).toContain('réservé à un administrateur de plateforme')
    v.done()
  })

  it('les deux segments se mesurent ensemble : un seul message peut couvrir les deux',
    async () => {
      api.getOutreachAudience
        .mockResolvedValueOnce({ ...BASE, total: 23, selected: 23 })
        .mockResolvedValueOnce({ ...BASE, total: 16, selected: 16 })
      const v = await monte()
      saisir(v.host, 'onboarding', 'onboarding-2026-09')
      await settle()
      bouton(v.host, 'Voir l\'audience')!.click()
      await settle()
      expect(v.host.textContent).toContain('23 jamais entrés')
      expect(v.host.textContent).toContain('16 venus puis repartis')
      v.done()
    })

  it('l\'aperçu est cloisonné et dit qu\'il n\'a pas de lien de désinscription', async () => {
    const v = await monte()
    await jusquAuPret(v.host)
    const cadres = [...v.host.querySelectorAll('iframe')]
    expect(cadres).toHaveLength(2)               // une par langue servie
    expect(cadres[0]!.getAttribute('sandbox')).toBe('')
    expect(v.host.textContent).toContain('sans lien de désinscription')
    v.done()
  })
})
