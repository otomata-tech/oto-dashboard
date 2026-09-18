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
import type { ConnectorIdentity, Me, MyConnector } from '@/types/api'

const identities = vi.fn()
const setDefault = vi.fn(async (..._a: unknown[]) => ({}))
const removeKey = vi.fn(async (..._a: unknown[]) => ({}))
// Le profil que `reload()` relit après une écriture : le rendre vide retirerait tous
// les gestes de l'écran, et le test lirait un défaut qu'il a lui-même fabriqué.
const profile = vi.fn(async (): Promise<unknown> => null)
vi.mock('@/api/console', () => ({
  getConnectorIdentities: (...a: unknown[]) => identities(...a),
  setConnectorIdentity: (...a: unknown[]) => setDefault(...a),
  deleteApiKey: (...a: unknown[]) => removeKey(...a),
  getMe: () => profile(),
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

// Le bloc ne reçoit plus un levier entier mais le SEUL geste dont il a besoin (`add`) et
// le palier qu'il sert (`scope`) : c'est ce qui lui permet de servir aussi le panneau
// « clé partagée d'org », dont le levier n'a pas la forme de celui du membre.
type Props = {
  connector?: MyConnector
  scope?: 'member' | 'org'
  add?: (existing: string[]) => void
  verify?: (account: string) => Promise<unknown>
  onNamed?: (n: number) => void
  onChanged?: () => void
}
function mount(props: Props = {}) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(ConnectorKeyAccounts, { connector: CONNECTOR, ...props })
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
    const c = mount({ add: () => {} })
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
    // Le geste suit la règle d'écriture d'org (oto#212) : un profil chargé, hors consultation.
    useMe().me.value = { sub: 'u' } as unknown as Me
    const c = mount({ add: () => {} })
    await settle()

    expect(c.buttons().some((b) => (b.textContent ?? '').includes('Ajouter un workspace')))
      .toBe(true)
    c.cleanup()
  })
})

// Le palier ORG (une clé PayFit par société d'un groupe) : le même bloc, monté dans le
// panneau « clé partagée d'org ». Avant ce lot, l'org ne pouvait poser qu'UNE clé : le
// bloc n'était monté qu'au palier membre, et l'adaptateur d'org n'avait pas de geste
// d'ajout. Ce qui change ici n'est pas le rendu mais QUI lit, QUI écrit, et les mots.
const PAYFIT = {
  name: 'payfit', label: 'PayFit',
  auth: { method: 'secret', cardinality: 'multi_account', account_noun: 'société', fields: [] },
} as unknown as MyConnector
const ADMIN = { sub: 'u', role: 'member', org_role: 'org_admin', active_org: 42 } as unknown as Me

function servedAt(...list: ConnectorIdentity[]) {
  identities.mockResolvedValue({ connector: 'payfit', supported: true, identities: list })
}

describe('ConnectorKeyAccounts — au palier org', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    identities.mockReset(); setDefault.mockClear(); removeKey.mockClear()
    profile.mockResolvedValue(ADMIN)
    useMe().me.value = ADMIN
  })

  it('lit les comptes DE L’ORG, pas ceux du membre', async () => {
    servedAt(account('Société A', true), account('Société B'))
    const c = mount({ connector: PAYFIT, scope: 'org', add: () => {} })
    await settle()

    expect(identities).toHaveBeenCalledWith('payfit', 'org')
    expect(c.text()).toContain('Société A')
    expect(c.text()).toContain("sociétés PayFit de l'org")
    c.cleanup()
  })

  it('accorde le mot du registre : « une société », jamais « un société »', async () => {
    servedAt(account(''))
    const c = mount({ connector: PAYFIT, scope: 'org', add: () => {} })
    await settle()

    const labels = c.buttons().map((b) => (b.textContent ?? '').trim())
    expect(labels).toContain('Ajouter une société')
    expect(c.text()).toContain('une seconde société vit à côté de la première')
    c.cleanup()
  })

  it('liste une société NOMMÉE même seule : sinon elle n’aurait plus de geste de retrait', async () => {
    // Au palier membre, un compte seul ne se liste pas (la pile de provenance le dit
    // déjà). À l'org rien au-dessus ne nomme le compte, et le panneau retire ses gestes
    // « clé unique » dès qu'un compte nommé existe (`named`).
    servedAt(account('Société A', true))
    const named = vi.fn()
    const c = mount({ connector: PAYFIT, scope: 'org', add: () => {}, onNamed: named })
    await settle()

    expect(c.text()).toContain('Société A')
    expect(named).toHaveBeenLastCalledWith(1)
    c.cleanup()
  })

  it('passe le nom des sociétés déjà posées au geste d’ajout', async () => {
    servedAt(account('Société A', true), account('Société B'))
    const add = vi.fn()
    const c = mount({ connector: PAYFIT, scope: 'org', add })
    await settle()
    c.click('Ajouter une société')

    expect(add).toHaveBeenCalledWith(['Société A', 'Société B'])
    c.cleanup()
  })

  it('choisit le défaut et retire AU PALIER ORG, et prévient le panneau', async () => {
    servedAt(account('Société A', true), account('Société B'))
    const changed = vi.fn()
    const c = mount({ connector: PAYFIT, scope: 'org', add: () => {}, onChanged: changed })
    await settle()

    c.click('Par défaut')
    await settle()
    expect(setDefault).toHaveBeenCalledWith('payfit', 'Société B', 'org')

    c.click('Retirer')
    await settle()
    expect(removeKey).toHaveBeenCalledWith('payfit', 'org', expect.any(String))
    expect(changed).toHaveBeenCalledTimes(2)
    c.cleanup()
  })

  it('sonde UNE société, et pose son verdict sous sa ligne', async () => {
    servedAt(account('Société A', true), account('Société B'))
    const verify = vi.fn(async (id: string) => (id === 'Société B'
      ? { ok: false, provider: 'payfit', error: 'clé refusée' }
      : { ok: true, provider: 'payfit' }))
    const c = mount({ connector: PAYFIT, scope: 'org', add: () => {}, verify: verify as never })
    await settle()

    const testers = c.buttons().filter((b) => (b.textContent ?? '').trim() === 'tester')
    expect(testers).toHaveLength(2)
    testers[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await settle()

    expect(verify).toHaveBeenCalledWith('Société B')
    expect(c.text()).toContain('✗ Société B : clé refusée')
    expect(c.text()).not.toContain('Société A : connexion OK')
    c.cleanup()
  })

  it('sans sonde fournie, aucun « tester » — le palier membre n’en a pas par compte', async () => {
    servedAt(account('Société A', true), account('Société B'))
    const c = mount({ connector: PAYFIT, scope: 'org', add: () => {} })
    await settle()
    expect(c.buttons().some((b) => (b.textContent ?? '').trim() === 'tester')).toBe(false)
    c.cleanup()
  })

  it('un membre sans le rôle d’admin d’org lit la liste, sans aucun geste', async () => {
    useMe().me.value = { ...ADMIN, org_role: 'org_member' } as unknown as Me
    servedAt(account('Société A', true), account('Société B'))
    const c = mount({ connector: PAYFIT, scope: 'org', add: () => {} })
    await settle()

    expect(c.text()).toContain('Société B')
    expect(c.buttons()).toHaveLength(0)
    c.cleanup()
  })

  it('en consultation, l’admin d’org n’a aucun geste non plus', async () => {
    useMe().me.value = { ...ADMIN, active_org_readonly: true } as unknown as Me
    servedAt(account('Société A', true), account('Société B'))
    const c = mount({ connector: PAYFIT, scope: 'org', add: () => {} })
    await settle()

    expect(c.buttons()).toHaveLength(0)
    c.cleanup()
  })
})
