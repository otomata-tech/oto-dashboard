// Traduit les erreurs backend (api() lève `ApiError`, dont le message reste
// `"<status> <code>"`, ex. "409 namespace_exists" ; getAccessToken lève
// "stale_session") en messages lisibles, résolus par i18n (clés `errors.<code>` dans
// locales/*.json). Code inconnu → on renvoie le message brut plutôt que de le masquer.
import { ApiError } from '@/api'
import { i18n } from './i18n'

export function humanize(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  const code = raw.includes(' ') ? raw.slice(raw.indexOf(' ') + 1) : raw
  const { t, te } = i18n.global
  if (te(`errors.${code}`)) return t(`errors.${code}`)
  if (te(`errors.${raw}`)) return t(`errors.${raw}`)
  return raw
}

// Le refus TEL QUE LE SERVEUR L'A ÉCRIT quand il en a rédigé un, sinon `humanize`.
//
// Certains refus sont rédigés côté serveur pour être affichés mot pour mot : ils
// nomment le champ fautif et la forme attendue (`vat_number_invalid` : « un numéro
// BE commence par "BE" »), ou disent quoi faire au lieu de quoi corriger
// (`payment_pending` : quel paiement occupe la place, son âge, et l'attendre plutôt
// que d'en ouvrir un second). Les remplacer par une phrase générique reviendrait à
// jeter la seule information utile — et, sur `payment_pending`, à laisser le payeur
// recliquer, ce qui l'a déjà débité deux fois (#127).
export function explain(e: unknown): string {
  const detail = e instanceof ApiError ? e.detail?.trim() : undefined
  return detail || humanize(e)
}
