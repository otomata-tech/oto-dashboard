// Le retour d'un changement de carte (#845 ①) — ce que le composant DIT à chaque
// branche de `confirm`, et surtout ce qu'il ne dit jamais : un échec pendant une
// attente, ou une coupure. Les phrases attendues sont celles que le SERVEUR sert
// (`oto_mcp/billing_method.py`) : le composant les recopie, il ne les réécrit pas.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createApp, nextTick } from 'vue'
import { ApiError } from '@/api'

const api = vi.hoisted(() => ({ confirmBillingMethodChange: vi.fn() }))
vi.mock('@/api/console', () => api)
const { confirmBillingMethodChange } = api

// Les phrases servies, mot pour mot.
const ATTENTE = 'Ton moyen de paiement actuel reste actif tant que le nouveau n\'est pas '
  + 'confirmé — rien n\'est coupé si tu abandonnes cette page.'
const ACTIF = 'Ton nouveau moyen de paiement est actif.'
const INCHANGE = 'Ton moyen de paiement actuel n\'a pas changé.'

async function mount(paymentRef: string | null = 'tr_x') {
  const Comp = (await import('./BillingMethodChange.vue')).default
  const host = document.createElement('div')
  document.body.appendChild(host)
  const settled = vi.fn()
  const retry = vi.fn()
  const app = createApp(Comp, { paymentRef, onSettled: settled, onRetry: retry })
  app.mount(host)
  await flush()
  return { host, settled, retry, unmount: () => { app.unmount(); host.remove() } }
}

// Vider les microtâches sans toucher aux timers (qui sont FAUX dans ces tests).
async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve()
  for (let i = 0; i < 10; i++) await nextTick()
}

function boutonNomme(host: HTMLElement, texte: string): HTMLButtonElement | undefined {
  return [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(texte))
}

beforeEach(() => {
  // `reset`, pas `clear` : une réponse `Once` laissée par un test qui a chuté ne doit
  // pas fuir dans le suivant.
  vi.resetAllMocks()
  vi.useFakeTimers()
})
afterEach(() => { vi.useRealTimers() })

describe('BillingMethodChange — le constat au retour de la page de paiement', () => {
  it('sonde avec la référence du navigateur, et recopie la phrase du serveur quand c\'est fait',
    async () => {
      confirmBillingMethodChange.mockResolvedValue({ status: 'changed', notice: ACTIF,
        mandate_id: 'mdt_neuf', previous_mandate_id: 'mdt_ancien', previous_revoked: true })

      const { host, settled, unmount } = await mount('tr_x')

      expect(confirmBillingMethodChange).toHaveBeenCalledWith('tr_x')
      expect(host.textContent).toContain(ACTIF)
      expect(settled).toHaveBeenCalledWith(expect.objectContaining({ status: 'changed' }))
      // Rien à changer : aucun levier proposé sur un succès.
      expect(boutonNomme(host, 'Changer de carte')).toBeUndefined()
      unmount()
    })

  it('une attente est une ATTENTE : la phrase servie, un spinner, aucun échec, aucun levier — puis la re-sonde conclut',
    async () => {
      confirmBillingMethodChange
        .mockResolvedValueOnce({ status: 'pending', payment_status: 'open', notice: ATTENTE })
        .mockResolvedValueOnce({ status: 'pending_mandate', payment_status: 'paid', notice: ATTENTE })
        .mockResolvedValue({ status: 'changed', notice: ACTIF })

      const { host, settled, unmount } = await mount()

      expect(host.textContent).toContain(ATTENTE)
      expect(host.textContent).toContain('vérification du paiement')
      expect(host.textContent).not.toMatch(/échec|erreur|refus/i)
      expect(boutonNomme(host, 'Changer de carte')).toBeUndefined()
      expect(settled).not.toHaveBeenCalled()

      // Deuxième sonde : encaissé, mandat pas encore visible — toujours une attente.
      await vi.advanceTimersByTimeAsync(5_000)
      await flush()
      expect(host.textContent).toContain('votre moyen de paiement est en cours de validation')
      expect(host.textContent).toContain(ATTENTE)
      expect(settled).not.toHaveBeenCalled()

      // Troisième : la bascule est faite.
      await vi.advanceTimersByTimeAsync(5_000)
      await flush()
      expect(confirmBillingMethodChange).toHaveBeenCalledTimes(3)
      expect(host.textContent).toContain(ACTIF)
      expect(settled).toHaveBeenCalledTimes(1)
      unmount()
    })

  it('une carte qui refuse laisse tout en place : la phrase servie, et de quoi réessayer',
    async () => {
      confirmBillingMethodChange.mockResolvedValue({ status: 'failed', payment_status: 'failed',
        notice: INCHANGE })

      const { host, settled, retry, unmount } = await mount()

      expect(host.textContent).toContain(INCHANGE)
      expect(settled).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }))
      const bouton = boutonNomme(host, 'Changer de carte')
      expect(bouton, 'un échec sans levier serait une alerte sans issue').toBeTruthy()
      bouton!.click()
      expect(retry).toHaveBeenCalledTimes(1)
      unmount()
    })

  it('un refus de l\'appel s\'affiche tel que le serveur l\'a écrit, avec le levier',
    async () => {
      confirmBillingMethodChange.mockRejectedValue(new ApiError(400, 'unknown_payment',
        'unknown_payment: tr_x n\'est pas un changement de moyen en cours pour cette org'))

      const { host, settled, unmount } = await mount()

      expect(host.textContent).toContain(
        'unknown_payment: tr_x n\'est pas un changement de moyen en cours pour cette org')
      expect(boutonNomme(host, 'Changer de carte')).toBeTruthy()
      expect(settled).toHaveBeenCalledWith(null)
      unmount()
    })

  it('passé la fenêtre de reprise, on cesse de sonder SANS annoncer d\'échec, et on offre de revérifier',
    async () => {
      vi.setSystemTime(new Date('2026-09-05T10:00:00Z'))
      confirmBillingMethodChange.mockResolvedValue({ status: 'pending_mandate',
        payment_status: 'paid', notice: ATTENTE })

      const { host, settled, unmount } = await mount()
      expect(settled).not.toHaveBeenCalled()

      // 31 minutes plus tard, l'horloge a dépassé la fenêtre : la prochaine sonde rend la main.
      vi.setSystemTime(new Date('2026-09-05T10:31:00Z'))
      await vi.advanceTimersByTimeAsync(5_000)
      await flush()

      expect(host.textContent).toContain(ATTENTE)
      expect(host.textContent).not.toMatch(/échec|erreur|refus/i)
      expect(boutonNomme(host, 'Vérifier à nouveau')).toBeTruthy()
      expect(settled).toHaveBeenCalledTimes(1)
      const appels = confirmBillingMethodChange.mock.calls.length

      // Plus aucune sonde d'elle-même…
      await vi.advanceTimersByTimeAsync(60_000)
      expect(confirmBillingMethodChange).toHaveBeenCalledTimes(appels)

      // …sauf à la demande.
      confirmBillingMethodChange.mockResolvedValue({ status: 'changed', notice: ACTIF })
      boutonNomme(host, 'Vérifier à nouveau')!.click()
      await flush()
      expect(host.textContent).toContain(ACTIF)
      unmount()
    })

  it('un statut inconnu de cet écran montre ce que le serveur a écrit, au lieu de tourner sans fin',
    async () => {
      confirmBillingMethodChange.mockResolvedValue({ status: 'archived', notice: '' })
      const { host, unmount } = await mount()
      expect(host.textContent).toContain('archived')
      expect(host.textContent).not.toContain('vérification du paiement')
      unmount()
    })
})
