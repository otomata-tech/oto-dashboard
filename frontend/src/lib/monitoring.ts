import type { MonitoringDayStat } from '@/types/api'

// Convertit la série journalière du backend en paires [ok, err] pour <DayBars>.
export function toDayBars(byDay: MonitoringDayStat[]): [number, number][] {
  return byDay.map((d) => [Math.max(0, d.calls - d.errors), d.errors])
}

export function fmtMs(ms: number | null): string {
  if (ms == null) return '—'
  return ms >= 1000 ? (ms / 1000).toFixed(1) + 's' : Math.round(ms) + 'ms'
}
