import { createI18n } from 'vue-i18n'
import { ref } from 'vue'
import type { Locale } from '@/types/api'
import en from '@/locales/en.json'
import fr from '@/locales/fr.json'

// i18n du dashboard (EN/FR). Décalqué sur `lib/analytics.ts` : un `ref` seedé depuis
// localStorage à l'import (anti-flash au boot) + setters qui persistent. La préférence
// FAIT AUTORITÉ côté compte (`me.locale`) une fois `/api/me` chargé (applyMeLocale) ;
// le cache localStorage ne sert qu'à rendre la première frame dans la bonne langue
// avant l'arrivée de `me`.
const LOCALE_KEY = 'oto-locale'
const SUPPORTED: Locale[] = ['en', 'fr']

function detectBrowserLocale(): Locale {
  return navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en'
}

function initialLocale(): Locale {
  const cached = localStorage.getItem(LOCALE_KEY) as Locale | null
  return cached && SUPPORTED.includes(cached) ? cached : detectBrowserLocale()
}

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: initialLocale(),
  fallbackLocale: 'en',
  messages: { en, fr },
})

// Miroir réactif de la locale active — pratique pour un v-model (LocaleSwitch) sans
// passer par useI18n, à la manière de `consent` dans analytics.ts.
export const locale = ref<Locale>(i18n.global.locale.value as Locale)

function apply(l: Locale): void {
  i18n.global.locale.value = l
  locale.value = l
  document.documentElement.lang = l
}

// Bascule explicite par l'utilisateur : applique + persiste (localStorage immédiat +
// compte en best-effort). Le PUT est importé paresseusement pour éviter le cycle
// api/console ↔ i18n, et son échec n'annule pas la bascule (persistance secondaire,
// pas un fallback de logique métier). Ne PUT que si authentifié.
export function setLocale(l: Locale): void {
  if (!SUPPORTED.includes(l)) return
  apply(l)
  localStorage.setItem(LOCALE_KEY, l)
  void (async () => {
    try {
      const { putLocale } = await import('@/api/console')
      await putLocale(l)
    } catch {
      // best-effort : la préférence reste appliquée localement même si le PUT échoue.
    }
  })()
}

// Appelé après getMe : la préférence compte fait autorité (écrase le cache), sans
// re-PUT (la source est le serveur). No-op si le compte n'a pas encore de préférence.
export function applyMeLocale(l?: Locale | null): void {
  if (!l || !SUPPORTED.includes(l)) return
  apply(l)
  localStorage.setItem(LOCALE_KEY, l)
}
