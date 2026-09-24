// Le thème : la préférence de l'écran, posée sur <html> (`data-theme` pour les tokens,
// `.dark` pour les variantes shadcn), et le système suivi tant qu'on ne choisit pas.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let sombre = false
const ecouteurs: Array<() => void> = []
beforeEach(() => {
  sombre = false
  ecouteurs.length = 0
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.classList.remove('dark')
  vi.stubGlobal('matchMedia', () => ({
    get matches() { return sombre },
    addEventListener: (_: string, f: () => void) => ecouteurs.push(f),
  }))
  vi.resetModules()
})
afterEach(() => { vi.unstubAllGlobals() })

const charger = () => import('./theme')
const html = () => document.documentElement

describe('thème', () => {
  it('par défaut, suit le système, et le suit quand il change', async () => {
    const { initTheme, themePref } = await charger()
    expect(themePref.value).toBe('system')
    initTheme()
    expect(html().dataset.theme).toBe('light')
    sombre = true
    ecouteurs.forEach((f) => f())
    expect(html().dataset.theme).toBe('dark')
    expect(html().classList.contains('dark')).toBe(true)
  })

  it('un choix explicite l’emporte sur le système et se garde', async () => {
    sombre = true
    const { initTheme, setTheme } = await charger()
    initTheme()
    setTheme('light')
    expect(html().dataset.theme).toBe('light')
    expect(html().classList.contains('dark')).toBe(false)
    expect(localStorage.getItem('oto.theme')).toBe('light')
    ecouteurs.forEach((f) => f())
    expect(html().dataset.theme).toBe('light')
  })

  it('revenir au système efface la préférence gardée', async () => {
    localStorage.setItem('oto.theme', 'dark')
    const { setTheme, themePref } = await charger()
    expect(themePref.value).toBe('dark')
    setTheme('system')
    expect(localStorage.getItem('oto.theme')).toBeNull()
    expect(html().dataset.theme).toBe('light')
  })

  it('une valeur gardée inconnue retombe sur le système', async () => {
    localStorage.setItem('oto.theme', 'violet')
    const { themePref } = await charger()
    expect(themePref.value).toBe('system')
  })
})
