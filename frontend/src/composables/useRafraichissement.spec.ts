// Le rafraîchissement de /automations (oto#205) : rien ne part onglet caché, et
// l'intervalle ne tourne qu'avec une campagne vivante. Avant, la file se relisait
// toutes les 30 s onglet caché compris — 89 % des appels de la route.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createApp, defineComponent, h, ref } from 'vue'
import { INTERVALLE_MS, fournirRafraichissement, inscrireRafraichissement } from './useRafraichissement'

let visibilite: DocumentVisibilityState = 'visible'

function monter(actif: () => boolean) {
  const chargeur = vi.fn(async () => {})
  const Enfant = defineComponent({
    setup() { inscrireRafraichissement(chargeur); return () => h('i') },
  })
  const Page = defineComponent({
    setup() {
      const r = fournirRafraichissement({ actif })
      return () => h('div', [h(Enfant), h('b', r.enCours.value ? 'occupé' : 'libre')])
    },
  })
  const hote = document.createElement('div')
  const app = createApp(Page)
  app.mount(hote)
  return { chargeur, demonter: () => app.unmount() }
}

beforeEach(() => {
  vi.useFakeTimers()
  visibilite = 'visible'
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibilite })
})
afterEach(() => { vi.useRealTimers() })

describe('rafraîchissement de /automations', () => {
  it('onglet CACHÉ : rien ne part, même avec une campagne vivante', async () => {
    const { chargeur, demonter } = monter(() => true)
    visibilite = 'hidden'
    await vi.advanceTimersByTimeAsync(INTERVALLE_MS * 3)
    expect(chargeur).not.toHaveBeenCalled()
    demonter()
  })

  it('onglet visible SANS campagne vivante : l’intervalle se tait', async () => {
    const { chargeur, demonter } = monter(() => false)
    await vi.advanceTimersByTimeAsync(INTERVALLE_MS * 3)
    expect(chargeur).not.toHaveBeenCalled()
    demonter()
  })

  it('onglet visible AVEC une campagne vivante : relit à chaque intervalle', async () => {
    const vivante = ref(true)
    const { chargeur, demonter } = monter(() => vivante.value)
    await vi.advanceTimersByTimeAsync(INTERVALLE_MS * 2)
    expect(chargeur).toHaveBeenCalledTimes(2)
    vivante.value = false
    await vi.advanceTimersByTimeAsync(INTERVALLE_MS * 2)
    expect(chargeur).toHaveBeenCalledTimes(2)
    demonter()
  })

  it('revenir sur l’onglet relit tout, une fois', async () => {
    const { chargeur, demonter } = monter(() => false)
    visibilite = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(chargeur).not.toHaveBeenCalled()
    visibilite = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(chargeur).toHaveBeenCalledTimes(1)
    demonter()
  })

  it('une section démontée se désinscrit', async () => {
    const { chargeur, demonter } = monter(() => true)
    demonter()
    await vi.advanceTimersByTimeAsync(INTERVALLE_MS * 2)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(chargeur).not.toHaveBeenCalled()
  })
})
