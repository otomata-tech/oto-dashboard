// Le thème de l'écran : clair, sombre, ou celui du système (le défaut). C'est une
// préférence de l'ÉCRAN, gardée par le navigateur (localStorage), pas du compte : un
// même compte peut vouloir du sombre le soir sur un poste et du clair ailleurs.
//
// Le thème effectif se pose sur <html> : `data-theme` (les tokens de `console.css`) et la
// classe `dark` (les variantes `dark:` des primitives shadcn). ⚠️ `index.html` rejoue la
// même résolution AVANT le premier rendu, pour qu'un écran sombre ne clignote pas en
// clair : toute évolution de la clé ou des valeurs se fait des deux côtés.
import { ref } from 'vue'

export type ThemePref = 'system' | 'light' | 'dark'
export type Theme = 'light' | 'dark'

export const THEMES: readonly ThemePref[] = ['system', 'light', 'dark']
export const CLE_THEME = 'oto.theme'

function lire(): ThemePref {
  try {
    const v = localStorage.getItem(CLE_THEME)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export const themePref = ref<ThemePref>(lire())

const requeteSombre = (): MediaQueryList | null =>
  (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)') : null)

/** Le thème affiché : la préférence, ou celui du système quand elle le suit. */
export function themeEffectif(pref: ThemePref, systemeSombre: boolean): Theme {
  if (pref === 'system') return systemeSombre ? 'dark' : 'light'
  return pref
}

function appliquer(): void {
  const t = themeEffectif(themePref.value, !!requeteSombre()?.matches)
  const el = document.documentElement
  el.dataset.theme = t
  el.classList.toggle('dark', t === 'dark')
  el.style.colorScheme = t
}

export function setTheme(pref: ThemePref): void {
  themePref.value = pref
  try {
    if (pref === 'system') localStorage.removeItem(CLE_THEME)
    else localStorage.setItem(CLE_THEME, pref)
  } catch {
    // Stockage refusé (navigation privée) : le choix vaut pour cette page.
  }
  appliquer()
}

/** Au démarrage : applique, puis suit le système tant que la préférence le suit. */
export function initTheme(): void {
  appliquer()
  requeteSombre()?.addEventListener('change', () => {
    if (themePref.value === 'system') appliquer()
  })
}
