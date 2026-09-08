// Multi-compte (oto-dashboard#121) : quand on AJOUTE un compte à côté d'un existant,
// le dialog doit demander son nom et le remonter au parent SÉPARÉMENT des champs de
// credential — le serveur refuse une seconde pose anonyme, donc un nom perdu en route
// se solde par un refus incompréhensible. Et le nom ne doit jamais se retrouver mêlé
// aux champs du credential (il serait packé dans le secret).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import CredentialFieldsDialog from './CredentialFieldsDialog.vue'

const FIELDS = [
  { name: 'bot_token', label: 'Bot token', secret: true, required: false },
  { name: 'user_token', label: 'User token', secret: true, required: false },
]

function mountDialog(props: Record<string, unknown>) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(CredentialFieldsDialog, {
    open: true, label: 'Slack', fields: FIELDS, ...props,
  })
  app.mount(host)
  return {
    app,
    // Le contenu du Dialog est téléporté dans body — on cherche large.
    input: (name: string) =>
      document.querySelector<HTMLInputElement>(`input[name="${name}"]`),
    form: () => document.querySelector<HTMLFormElement>('form'),
    text: () => document.body.textContent ?? '',
    cleanup: () => { app.unmount(); host.remove() },
  }
}

async function type(el: HTMLInputElement | null, value: string) {
  if (!el) throw new Error('champ introuvable')
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  await nextTick()
}

async function submit(form: HTMLFormElement | null) {
  if (!form) throw new Error('formulaire introuvable')
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  // vee-validate valide de façon asynchrone, puis le handler (async) appelle
  // onConfirm : plusieurs tours de boucle avant que tout soit retombé.
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()
  }
}

describe('CredentialFieldsDialog — ajout d’un compte nommé', () => {
  // Le contenu du Dialog est TÉLÉPORTÉ dans body : sans remise à zéro, le dialog
  // d'un test précédent reste dans le document et les sélecteurs visent la mauvaise
  // instance (les assertions deviennent illisibles).
  beforeEach(() => { document.body.innerHTML = '' })

  it('remonte le nom du compte À PART des champs de credential', async () => {
    const onConfirm = vi.fn(async () => {})
    const d = mountDialog({
      accountMode: 'new', accountNoun: 'workspace', accountNames: ['otomata'], onConfirm,
    })
    await nextTick()
    await type(d.input('__account'), 'client-x')
    await type(d.input('bot_token'), 'xoxb-42')
    await submit(d.form())

    expect(onConfirm).toHaveBeenCalledTimes(1)
    const [values, account] = onConfirm.mock.calls[0] as unknown as [Record<string, string>, string]
    expect(account).toBe('client-x')
    expect(values).toEqual({ bot_token: 'xoxb-42', user_token: '' })
    expect(values).not.toHaveProperty('__account')
    d.cleanup()
  })

  it('refuse un nom déjà pris, sans aller jusqu’au serveur', async () => {
    const onConfirm = vi.fn(async () => {})
    const d = mountDialog({
      accountMode: 'new', accountNoun: 'workspace', accountNames: ['otomata'], onConfirm,
    })
    await nextTick()
    await type(d.input('__account'), 'otomata')
    await type(d.input('bot_token'), 'xoxb-42')
    await submit(d.form())

    expect(onConfirm).not.toHaveBeenCalled()
    expect(d.text()).toContain('ce workspace existe déjà')
    d.cleanup()
  })

  it('exige le nom : des identifiants seuls ne suffisent pas à ajouter un compte', async () => {
    const onConfirm = vi.fn(async () => {})
    const d = mountDialog({ accountMode: 'new', accountNoun: 'workspace', onConfirm })
    await nextTick()
    await type(d.input('bot_token'), 'xoxb-42')
    await submit(d.form())

    expect(onConfirm).not.toHaveBeenCalled()
    d.cleanup()
  })

  it('pose ORDINAIRE : aucun champ de nom, et le compte remonté est vide', async () => {
    const onConfirm = vi.fn(async () => {})
    const d = mountDialog({ onConfirm })
    await nextTick()
    expect(d.input('__account')).toBeNull()
    await type(d.input('bot_token'), 'xoxb-42')
    await submit(d.form())

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect((onConfirm.mock.calls[0] as unknown as [unknown, string])[1]).toBe('')
    d.cleanup()
  })

  it('REMPLACEMENT d’un compte nommé : le compte est transmis sans être redemandé', async () => {
    const onConfirm = vi.fn(async () => {})
    const d = mountDialog({ accountMode: 'fixed', account: 'client-x', accountNoun: 'workspace', onConfirm })
    await nextTick()
    expect(d.input('__account')).toBeNull()
    await type(d.input('bot_token'), 'xoxb-neuf')
    await submit(d.form())

    expect((onConfirm.mock.calls[0] as unknown as [unknown, string])[1]).toBe('client-x')
    d.cleanup()
  })
})

// Connecteur à DISCRIMINANT (`http`) : le mode d'auth commande les autres champs. Tant
// qu'il n'est pas choisi, seuls les champs communs se montrent — les douze champs d'un
// coup, c'est ce qui a rendu la modale illisible (08/09). Choisi, le formulaire ne
// montre que ce que ce mode rend pertinent, et l'aide vit SOUS chaque champ, jamais en
// placeholder (elle y arrivait tronquée).
const HTTP = [
  { name: 'base_url', label: 'URL de base', secret: false, help: 'racine de l’API (ex. https://api.acme.com)' },
  { name: 'auth_mode', label: 'Mode d’auth', secret: false, choices: ['bearer', 'header', 'basic', 'none'], help: 'ce que l’API attend' },
  { name: 'doc_path', label: 'Route de doc', secret: false, required: false, help: 'chemin relatif' },
  { name: 'token', label: 'Token', secret: true, when: ['bearer', 'header'], help: 'valeur du bearer' },
  { name: 'header_name', label: 'Nom du header', secret: false, when: ['header'], help: 'ex. x-api-key' },
  { name: 'username', label: 'Utilisateur', secret: false, when: ['basic'] },
  { name: 'password', label: 'Mot de passe', secret: true, when: ['basic'] },
]

describe('CredentialFieldsDialog — le discriminant révèle les champs', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('sans mode choisi : les champs communs seulement, et la consigne', async () => {
    const d = mountDialog({ label: 'HTTP', fields: HTTP, fieldDiscriminator: 'auth_mode', onConfirm: async () => {} })
    await nextTick()
    expect(d.input('base_url')).not.toBeNull()
    expect(d.input('doc_path')).not.toBeNull()
    expect(d.input('token')).toBeNull()
    expect(d.input('header_name')).toBeNull()
    expect(d.input('password')).toBeNull()
    expect(d.text()).toContain('choisis « mode d’auth »')
    d.cleanup()
  })

  it('mode stocké `header` : le token et le nom du header, pas le couple basic', async () => {
    const d = mountDialog({
      label: 'HTTP', fields: HTTP, fieldDiscriminator: 'auth_mode', existing: true,
      initialValues: { base_url: 'https://api.acme.com', auth_mode: 'header', header_name: 'x-api-key' },
      onConfirm: async () => {},
    })
    await nextTick()
    expect(d.input('token')).not.toBeNull()
    expect(d.input('header_name')?.value).toBe('x-api-key')
    expect(d.input('username')).toBeNull()
    expect(d.input('password')).toBeNull()
    expect(d.text()).not.toContain('choisis « mode d’auth »')
    d.cleanup()
  })

  it('l’aide vit sous le champ, pas en placeholder', async () => {
    const d = mountDialog({ label: 'HTTP', fields: HTTP, fieldDiscriminator: 'auth_mode', onConfirm: async () => {} })
    await nextTick()
    expect(d.input('base_url')?.placeholder).toBe('')
    expect(d.text()).toContain('racine de l’API (ex. https://api.acme.com)')
    d.cleanup()
  })
})
