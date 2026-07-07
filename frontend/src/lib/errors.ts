// Traduit les erreurs backend (api() lève `Error("<status> <code>")`, ex.
// "409 namespace_exists"; getAccessToken lève "stale_session") en messages
// lisibles, résolus par i18n (clés `errors.<code>` dans locales/*.json). Code
// inconnu → on renvoie le message brut plutôt que de le masquer.
import { i18n } from './i18n'

export function humanize(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  const code = raw.includes(' ') ? raw.slice(raw.indexOf(' ') + 1) : raw
  const { t, te } = i18n.global
  if (te(`errors.${code}`)) return t(`errors.${code}`)
  if (te(`errors.${raw}`)) return t(`errors.${raw}`)
  return raw
}
