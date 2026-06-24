// Constantes partagées pour l'écran email & envoi de l'org (ADR 0009).
import type { QuietHours } from '@/types/api'

// Défaut serveur (oto_mcp/scheduler.DEFAULT_QUIET_HOURS) — répliqué pour amorcer
// le formulaire quand l'org active la fenêtre calme sans en avoir posé une.
export const DEFAULT_QUIET_HOURS: QuietHours = { tz: 'Europe/Paris', start: 20, end: 8 }

// Liste de fuseaux pour le select. On préfère la liste native du runtime
// (Intl.supportedValuesOf, large + à jour) ; repli maison sinon, garantissant
// toujours Europe/Paris (défaut serveur).
const FALLBACK_TZ = [
  'Europe/Paris', 'Europe/London', 'Europe/Madrid', 'Europe/Berlin', 'Europe/Lisbon',
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Sao_Paulo', 'Africa/Casablanca', 'Asia/Dubai', 'Asia/Kolkata',
  'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney',
]

function supportedTimeZones(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }
  try {
    const list = intl.supportedValuesOf?.('timeZone')
    if (list && list.length) return list
  } catch { /* runtime sans supportedValuesOf */ }
  return FALLBACK_TZ
}

export const TIMEZONES: string[] = supportedTimeZones()
