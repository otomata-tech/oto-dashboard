// Créer « à moi » depuis n'importe quelle org (Alexis, 29/09/2026) : sans propriétaire,
// l'objet m'appartient et se liste pour moi dans l'org où je l'ai créé — une org perso est
// une org comme une autre, le libellé est donc le même partout (il annonçait « visible dans
// mon espace perso » hors de l'org perso). « l'org » et « une équipe » envoient leur
// propriétaire EXPLICITEMENT.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref } from 'vue'
import { i18n } from '@/lib/i18n'

const me = ref<{ active_org_is_personal?: boolean } | null>(null)
vi.mock('@/composables/useMe', () => ({ useMe: () => ({ me }) }))

// Les primitives reka (portails, pointeurs) remplacées par un <select> natif : ce qu'on
// éprouve est le CHOIX proposé et ce qui part, pas l'animation du menu.
vi.mock('@/components/ui/select', async () => {
  const { defineComponent: dc, h: hh } = await import('vue')
  const passe = dc({ setup: (_, { slots }) => () => slots.default?.() })
  const rien = dc({ render: () => null })
  return {
    Select: dc({
      props: { modelValue: { type: String, default: '' } },
      emits: ['update:modelValue'],
      setup: (p, { slots, emit }) => () => hh('select', {
        'data-test': 'proprietaire', value: p.modelValue,
        onChange: (e: Event) => emit('update:modelValue', (e.target as HTMLSelectElement).value),
      }, slots.default?.()),
    }),
    SelectTrigger: rien, SelectValue: rien, SelectContent: passe,
    SelectItem: dc({
      props: { value: { type: String, required: true } },
      setup: (p, { slots }) => () => hh('option', { value: p.value }, slots.default?.()),
    }),
  }
})
vi.mock('@/components/ui/dialog', async () => {
  const { defineComponent: dc, h: hh } = await import('vue')
  const passe = dc({ setup: (_, { slots }) => () => slots.default?.() })
  return {
    Dialog: dc({ props: { open: Boolean }, setup: (p, { slots }) => () => (p.open ? hh('div', slots.default?.()) : null) }),
    DialogContent: passe, DialogHeader: passe, DialogTitle: passe, DialogDescription: passe, DialogFooter: passe,
  }
})

import ProjectCreateDialog from './ProjectCreateDialog.vue'

async function settle() {
  for (let i = 0; i < 6; i++) await nextTick()
  await new Promise((r) => setTimeout(r, 20))
  for (let i = 0; i < 6; i++) await nextTick()
}

async function monter(onConfirm = vi.fn(async () => {})) {
  const hote = document.createElement('div')
  document.body.appendChild(hote)
  const app = createApp(ProjectCreateDialog, {
    open: true, orgName: 'Otomata Admin', orgId: 42, groups: [{ id: 7, name: 'Ventes' }], onConfirm,
  })
  app.use(i18n)
  app.mount(hote)
  await settle()
  return { hote, onConfirm, app }
}
const choix = (hote: HTMLElement) =>
  [...hote.querySelectorAll('[data-test="proprietaire"] option')].map((o) => o.textContent!.trim())

async function creer(hote: HTMLElement, valeur: string) {
  const nom = hote.querySelector('input') as HTMLInputElement
  nom.value = 'Veille'
  nom.dispatchEvent(new Event('input'))
  const sel = hote.querySelector('[data-test="proprietaire"]') as HTMLSelectElement
  sel.value = valeur
  sel.dispatchEvent(new Event('change'))
  await settle()
  hote.querySelector('form')!.dispatchEvent(new Event('submit'))
  await settle()
}

beforeEach(() => {
  i18n.global.locale.value = 'fr'
  document.body.innerHTML = ''
})

describe('créer un projet dans une org non perso', () => {
  beforeEach(() => { me.value = { active_org_is_personal: false } })

  it('trois choix : moi, l’org, une équipe', async () => {
    const { hote } = await monter()
    expect(choix(hote)).toEqual(['moi (privé)', 'org (Otomata Admin)', 'équipe — Ventes'])
  })

  it('« l’org » envoie l’org EXPLICITEMENT', async () => {
    const { hote, onConfirm } = await monter()
    await creer(hote, 'org')
    expect(onConfirm).toHaveBeenCalledWith({ name: 'Veille', owner: { owner_type: 'org', owner_id: '42' } })
  })

  it('« une équipe » envoie l’équipe EXPLICITEMENT', async () => {
    const { hote, onConfirm } = await monter()
    await creer(hote, 'group:7')
    expect(onConfirm).toHaveBeenCalledWith({ name: 'Veille', owner: { owner_type: 'group', owner_id: '7' } })
  })

  it('« moi » n’envoie aucun propriétaire : le serveur le range chez moi', async () => {
    const { hote, onConfirm } = await monter()
    await creer(hote, 'me')
    expect(onConfirm).toHaveBeenCalledWith({ name: 'Veille', owner: undefined })
  })
})

describe('dans l’org perso', () => {
  it('« moi » garde son libellé simple', async () => {
    me.value = { active_org_is_personal: true }
    const { hote } = await monter()
    expect(choix(hote)[0]).toBe('moi (privé)')
  })
})
