// Comptes nommés d'un connecteur à clé (oto-dashboard#121) — ce que l'écran doit
// tenir APRÈS le geste, pas seulement au montage.
//
// Deux pannes que ces tests figent, toutes deux invisibles à l'œil du développeur qui
// vient de poser son premier compte :
//
// 1. **La liste ne suivait pas l'ajout.** Le bloc charge la liste servie au montage ;
//    le dialogue d'ajout, lui, est hébergé par `ConnectorScopeView`, à côté du panneau.
//    Poser un second workspace ne démonte donc rien : le toast disait « ajouté » et la
//    liste continuait d'afficher un seul compte, sous une phrase invitant à en ajouter
//    un second. Le geste que tout ce lot devait débloquer restait sans effet visible.
//
// 2. **Aucun compte par défaut n'est posé automatiquement.** Le serveur ne marque rien
//    à la deuxième pose (`_keyed_select` est le SEUL à écrire `is_default`) et la
//    résolution d'appel refuse alors de choisir : « plusieurs comptes configurés, aucun
//    marqué par défaut — précise lequel ». L'écran affichait deux lignes sans dire que,
//    dans cet état, l'agent ne résout plus rien.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import ConnectorKeyAccounts from './ConnectorKeyAccounts.vue'
import { useMe } from '@/composables/useMe'
import type { ConnectionLever } from './connector-scope/adapter'
import type { ConnectorIdentity, Me, MyConnector } from '@/types/api'

const identities = vi.fn()
vi.mock('@/api/console', () => ({
  getConnectorIdentities: (...a: unknown[]) => identities(...a),
  setConnectorIdentity: vi.fn(async () => ({})),
  deleteApiKey: vi.fn(async () => ({})),
  getMe: vi.fn(async () => null),
}))
vi.mock('@/composables/usePrompt', () => ({
  usePrompt: () => ({ confirmAction: async () => true }),
}))

const CONNECTOR = {
  name: 'slack', label: 'Slack',
  auth: { method: 'secret', cardinality: 'multi_account', account_noun: 'workspace', fields: [] },
} as unknown as MyConnector

function account(id: string, is_default = false): ConnectorIdentity {
  return { id, label: id || '(défaut)', status: 'ok', is_default, channel: null } as ConnectorIdentity
}

function served(...list: ConnectorIdentity[]) {
  identities.mockResolvedValue({ connector: 'slack', supported: true, identities: list })
}

function mount(lever: Partial<ConnectionLever<MyConnector>> = {}) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(ConnectorKeyAccounts, {
    connector: CONNECTOR,
    lever: { configureKey: () => {}, removeKey: () => {}, ...lever },
  })
  app.mount(host)
  return {
    host,
    text: () => host.textContent ?? '',
    buttons: () => Array.from(host.querySelectorAll('button')),
    click: (label: string) => {
      const b = Array.from(host.querySelectorAll('button'))
        .find((el) => (el.textContent ?? '').trim().toLowerCase().includes(label.toLowerCase()))
      if (!b) throw new Error(`bouton « ${label} » introuvable — vu : ${host.textContent}`)
      b.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    },
    cleanup: () => { app.unmount(); host.remove() },
  }
}

// Le chargement est asynchrone (onMounted → await) : plusieurs tours de boucle avant
// que la liste soit rendue.
async function settle() {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()
  }
}

describe('ConnectorKeyAccounts — la liste servie, après le geste', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    identities.mockReset()
    useMe().me.value = null
  })

  it('nomme les comptes servis et marque celui qui sert par défaut', async () => {
    served(account('principal', true), account('client-x'))
    const c = mount()
    await settle()

    expect(c.text()).toContain('principal')
    expect(c.text()).toContain('client-x')
    expect(c.text()).toContain('par défaut')
    // Le mot vient du registre, jamais de l'écran.
    expect(c.text()).toContain('workspace')
    c.cleanup()
  })

  it('recharge la liste quand le profil est rechargé — le compte ajouté apparaît', async () => {
    served(account(''))
    const c = mount({ addAccount: () => {} })
    await settle()
    expect(identities).toHaveBeenCalledTimes(1)
    expect(c.text()).not.toContain('client-x')

    // Ce que fait réellement le geste d'ajout : le dialogue pose le credential, puis
    // l'adaptateur recharge `me` (`useUserAdapter.addAccount.onConfirm`). Le serveur a
    // migré la ligne anonyme vers « principal » et écrit le compte nommé.
    served(account('principal'), account('client-x'))
    useMe().me.value = { sub: 'u' } as unknown as Me
    await settle()

    expect(identities).toHaveBeenCalledTimes(2)
    expect(c.text()).toContain('client-x')
    c.cleanup()
  })

  it('dit que rien ne résout tant qu’aucun compte n’est marqué par défaut', async () => {
    served(account('principal'), account('client-x'))
    const c = mount()
    await settle()

    // Personne n'a is_default : la cascade refuse de choisir à la place de l'user.
    expect(c.text()).toContain('aucun workspace par défaut')
    c.cleanup()
  })

  it('garde le geste d’ajout atteignable quand la liste ne se lit pas', async () => {
    identities.mockRejectedValue(new Error('502'))
    const c = mount({ addAccount: () => {} })
    await settle()

    expect(c.buttons().some((b) => (b.textContent ?? '').includes('Ajouter un workspace')))
      .toBe(true)
    c.cleanup()
  })
})
