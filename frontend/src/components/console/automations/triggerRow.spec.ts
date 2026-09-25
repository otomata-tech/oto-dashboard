// /automations, lot 2 d'oto#205 : RÉGLER un déclencheur — tout ce que le backend sert
// (interrupteur, horaire, fuseau, modèle, suppression). Montés dans la carte, parce que
// c'est elle qui relit la liste après un réglage et retire une ligne supprimée.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { ApiError } from '@/api'
import type { RunnerTrigger } from '@/api/console'
import { i18n } from '@/lib/i18n'
import type { RunnerModel } from '@/types/api'
import { programmation, webhook } from '@/views/console/automations/__tests__/programmation'

const api = vi.hoisted(() => ({
  listRunnerTriggers: vi.fn(), updateRunnerTrigger: vi.fn(), deleteRunnerTrigger: vi.fn(),
}))
vi.mock('@/api/console', () => api)
const me = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }))
// Les helpers de rôle sont les VRAIS (oto#210) : seul le profil est un bouchon.
vi.mock('@/composables/useMe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/composables/useMe')>()),
  useMe: () => ({ me }),
}))

const BASE: RunnerTrigger = programmation({
  id: 1, next_due: '2026-09-14T06:00:00Z',
})
const CATALOGUE: RunnerModel[] = [
  { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', family: 'anthropic', served: true, default: true },
  { id: 'mistral-large', label: 'Mistral Large', family: 'mistral', served: false, default: false },
]
const RUNNER = { armed: true, workers: 1, last_seen: '2026-09-13 11:59:00', families: ['anthropic'], models: CATALOGUE }

const vider = async () => {
  for (let i = 0; i < 10; i++) { await new Promise((r) => setTimeout(r, 0)); await nextTick() }
}

async function monter(triggers: RunnerTrigger[]) {
  api.listRunnerTriggers.mockResolvedValue({ triggers, runner: RUNNER })
  const Card = (await import('../RunnerTriggersCard.vue')).default
  const hote = document.createElement('div')
  document.body.appendChild(hote)
  const app = createApp(Card)
  app.use(i18n)
  // Le nom d'une ligne mène à la page de la programmation (oto#214).
  app.component('RouterLink', { props: ['to'], template: '<a :href="to"><slot /></a>' })
  app.mount(hote)
  await vider()
  return hote
}
const cliquer = async (el: Element | null | undefined) => { (el as HTMLElement).click(); await vider() }
async function saisir(hote: HTMLElement, sel: string, valeur: string) {
  const champ = hote.querySelector(sel) as HTMLInputElement
  champ.value = valeur
  champ.dispatchEvent(new Event('input'))
  await vider()
}
const sel = (hote: HTMLElement, test: string) => hote.querySelector(`[data-test="${test}"]`)

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset()
  i18n.global.locale.value = 'fr'
  me.value = { sub: 'm', role: 'member', org_role: 'org_member' }
  document.body.replaceChildren()
})

describe('régler un déclencheur', () => {
  it('« Régler » ouvre le formulaire en ligne ; seuls les champs modifiés partent', async () => {
    const hote = await monter([{ ...BASE, model: 'claude-sonnet-4-5' }])
    await cliquer(sel(hote, 'regler'))
    expect(sel(hote, 'reglage')).not.toBeNull()
    await saisir(hote, '[data-test="cron"]', ' 0 9 * * * ')
    expect(sel(hote, 'reglage')!.textContent).toContain('tous les jours à 9 h')
    api.updateRunnerTrigger.mockResolvedValue({ trigger: { ...BASE, model: 'claude-sonnet-4-5', cron: '0 9 * * *' } })
    api.listRunnerTriggers.mockReturnValue(new Promise(() => {}))
    await cliquer(sel(hote, 'enregistrer'))
    expect(api.updateRunnerTrigger).toHaveBeenCalledTimes(1)
    expect(api.updateRunnerTrigger).toHaveBeenCalledWith(1, { cron: '0 9 * * *' })
  })

  it('une ligne webhook dit son genre et ce qu’elle a reçu, jamais un cron', async () => {
    const hote = await monter([webhook({ id: 1, deliveries_24h: 3, deliveries_refused_24h: 1 })])
    expect(sel(hote, 'genre')!.textContent!.trim()).toBe('webhook')
    expect(sel(hote, 'recues')!.textContent).toContain('3 livraisons sur 24 h, dont 1 refusée')
    expect(hote.textContent).not.toContain('Europe/Paris')
  })

  it('un webhook ne propose ni horaire ni fuseau : seul son modèle se règle', async () => {
    const hote = await monter([webhook({ id: 1 })])
    await cliquer(sel(hote, 'regler'))
    expect(sel(hote, 'reglage')).not.toBeNull()
    expect(sel(hote, 'champ-horaire')).toBeNull()
    expect(sel(hote, 'champ-modele')).not.toBeNull()
  })

  it('rien de modifié : « Enregistrer » ne part pas', async () => {
    const hote = await monter([BASE])
    await cliquer(sel(hote, 'regler'))
    const bouton = sel(hote, 'enregistrer') as HTMLButtonElement
    expect(bouton.disabled).toBe(true)
    // Des espaces de bord ne modifient pas un horaire.
    await saisir(hote, '[data-test="cron"]', '0 8 * * * ')
    expect(bouton.disabled).toBe(true)
    await cliquer(bouton)
    expect(api.updateRunnerTrigger).not.toHaveBeenCalled()
  })

  it('le modèle ne se présélectionne jamais sur le défaut du catalogue, et il est OBLIGATOIRE', async () => {
    const hote = await monter([{ ...BASE, model: null }])
    await cliquer(sel(hote, 'regler'))
    const champ = sel(hote, 'champ-modele')!.textContent!
    expect(champ).toContain('choisir un modèle')
    expect(champ).not.toContain('Claude Sonnet 4.5')
    expect(champ).not.toContain('modèle du worker')
    // Sans modèle, rien ne part : le formulaire le dit.
    expect(sel(hote, 'modele-requis')!.textContent).toContain('ne tourne plus')
    await saisir(hote, '[data-test="cron"]', '0 9 * * *')
    const bouton = sel(hote, 'enregistrer') as HTMLButtonElement
    expect(bouton.disabled).toBe(true)
    await cliquer(bouton)
    expect(api.updateRunnerTrigger).not.toHaveBeenCalled()
  })

  it('sans modèle déclaré, la ligne dit qu’elle ne tourne plus, sans marque « non servi »', async () => {
    const ligne = (await monter([{ ...BASE, model: null }])).querySelector('li')!.textContent!
    expect(ligne).toContain('aucun modèle — ne tourne plus')
    expect(ligne).not.toContain('non servi')
  })

  it('un modèle courant non servi reste affiché et marqué, sur la ligne et dans le formulaire', async () => {
    const hote = await monter([{ ...BASE, model: 'mistral-large' }])
    const ligne = hote.querySelector('li')!.textContent!
    expect(ligne).toContain('Mistral Large')
    expect(ligne).toContain('non servi')
    await cliquer(sel(hote, 'regler'))
    expect(sel(hote, 'champ-modele')!.textContent).toContain('Mistral Large · non servi')
  })

  it('`invalid_schedule` s’affiche sous l’horaire, avec le détail du serveur ; la saisie reste', async () => {
    const hote = await monter([BASE])
    await cliquer(sel(hote, 'regler'))
    await saisir(hote, '[data-test="cron"]', '0 25 * * *')
    const detail = 'heure hors bornes dans `0 25 * * *` : 25 (attendu 0-23)'
    api.updateRunnerTrigger.mockRejectedValue(new ApiError(400, 'invalid_schedule', detail))
    await cliquer(sel(hote, 'enregistrer'))
    const alerte = sel(hote, 'champ-horaire')!.querySelector('[role="alert"]')!.textContent!
    expect(alerte).toContain(`Refusé : ${detail}`)
    expect(api.listRunnerTriggers).toHaveBeenCalledTimes(1)
    expect((sel(hote, 'cron') as HTMLInputElement).value).toBe('0 25 * * *')
  })

  it('un autre refus s’affiche sous le formulaire, tel quel', async () => {
    const hote = await monter([BASE])
    await cliquer(sel(hote, 'regler'))
    await saisir(hote, '[data-test="cron"]', '0 9 * * *')
    const detail = "aucun worker ne sert les modèles `mistral` en ce moment (ceux qui sondent la file servent : anthropic)."
    api.updateRunnerTrigger.mockRejectedValue(new ApiError(400, 'model_not_served', detail))
    await cliquer(sel(hote, 'enregistrer'))
    expect(sel(hote, 'champ-horaire')!.querySelector('[role="alert"]')).toBeNull()
    const alerte = sel(hote, 'reglage')!.querySelector(':scope > [role="alert"]')!.textContent!
    expect(alerte).toContain(`Refusé : ${detail}`)
    expect(alerte).toContain('model_not_served')
  })

  it('après succès : le `next_due` de la réponse fait foi, `expired_count` survit, puis la liste est relue', async () => {
    const perdu = { ...BASE, expired_count: 41, expired_since: '2026-08-20T06:00:00Z', expired_last: '2026-09-02T06:00:00Z' }
    const hote = await monter([perdu])
    await cliquer(sel(hote, 'regler'))
    await saisir(hote, '[data-test="cron"]', '0 9 * * *')
    // La ligne BRUTE : `expired_*` n'y est pas calculé.
    api.updateRunnerTrigger.mockResolvedValue({ trigger: {
      ...BASE, cron: '0 9 * * *', next_due: '2026-09-14T07:00:00Z',
      expired_count: null, expired_since: null, expired_last: null,
    } })
    api.listRunnerTriggers.mockReturnValue(new Promise(() => {}))
    await cliquer(sel(hote, 'enregistrer'))
    const texte = hote.textContent!
    expect(texte).toContain('prochaine exécution : 2026-09-14 07:00')
    expect(texte).toContain('tous les jours à 9 h')
    expect(texte).toContain('41 occurrences non prises')
    expect(api.listRunnerTriggers).toHaveBeenCalledTimes(2)
    expect(sel(hote, 'reglage')).toBeNull()
  })
})

describe('supprimer un déclencheur', () => {
  it('confirmation sur place ; la ligne n’est retirée que sur `ok: true`', async () => {
    const autre: RunnerTrigger = { ...BASE, id: 2, label: 'Relance du soir' }
    const hote = await monter([BASE, autre])
    await cliquer(hote.querySelectorAll('[data-test="supprimer"]')[0])
    expect(hote.textContent).toContain('Supprimer cette programmation ? Ses occurrences en attente ne partiront jamais.')
    expect(api.deleteRunnerTrigger).not.toHaveBeenCalled()

    api.deleteRunnerTrigger.mockResolvedValueOnce({})
    await cliquer(sel(hote, 'confirmer'))
    expect(api.deleteRunnerTrigger).toHaveBeenCalledWith(1)
    expect(hote.querySelectorAll('li.rt-item')).toHaveLength(2)
    expect(hote.querySelector('[role="alert"]')!.textContent).toContain('suppression non confirmée par le serveur')

    api.deleteRunnerTrigger.mockResolvedValueOnce({ ok: true })
    await cliquer(hote.querySelectorAll('[data-test="supprimer"]')[0])
    await cliquer(sel(hote, 'confirmer'))
    const lignes = [...hote.querySelectorAll('li.rt-item')]
    expect(lignes).toHaveLength(1)
    expect(lignes[0]!.textContent).toContain('Relance du soir')
  })

  it('404 `trigger_not_found` : dit tel quel, la ligne reste', async () => {
    const hote = await monter([BASE])
    api.deleteRunnerTrigger.mockRejectedValue(new ApiError(404, 'trigger_not_found', 'déclencheur inconnu'))
    await cliquer(sel(hote, 'supprimer'))
    await cliquer(sel(hote, 'confirmer'))
    expect(hote.querySelector('[role="alert"]')!.textContent).toContain('Refusé : déclencheur inconnu')
    expect(hote.querySelectorAll('li.rt-item')).toHaveLength(1)
  })

  it('Annuler : rien ne part', async () => {
    const hote = await monter([BASE])
    await cliquer(sel(hote, 'supprimer'))
    await cliquer(sel(hote, 'annuler'))
    expect(api.deleteRunnerTrigger).not.toHaveBeenCalled()
    expect(sel(hote, 'supprimer')).not.toBeNull()
  })
})

describe('qui règle un déclencheur', () => {
  it('un membre simple coupe, règle et supprime : le serveur l’ouvre à tout membre', async () => {
    const hote = await monter([BASE])
    for (const geste of ['interrupteur', 'regler', 'supprimer']) expect(sel(hote, geste), geste).not.toBeNull()
  })

  it('consultation en lecture seule : ni interrupteur, ni Régler, ni Supprimer', async () => {
    me.value = { sub: 'sa', role: 'super_admin', org_role: null, active_org_readonly: true }
    const hote = await monter([BASE])
    for (const geste of ['interrupteur', 'regler', 'supprimer']) expect(sel(hote, geste), geste).toBeNull()
    expect(hote.textContent).toContain('Veille du matin')
  })

  it('l’interrupteur n’envoie que `enabled`, puis relit la liste', async () => {
    const hote = await monter([BASE])
    api.updateRunnerTrigger.mockResolvedValue({ trigger: { ...BASE, enabled: false } })
    await cliquer(sel(hote, 'interrupteur'))
    expect(api.updateRunnerTrigger).toHaveBeenCalledWith(1, { enabled: false })
    expect(api.listRunnerTriggers).toHaveBeenCalledTimes(2)
  })
})
