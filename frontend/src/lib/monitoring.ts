import type { MonitoringDayStat } from '@/types/api'

// Convertit la série journalière du backend en paires [ok, err] pour <DayBars>,
// densifiée sur une fenêtre fixe de `windowDays` jours (le backend omet les
// jours sans appel → sans densification le chart serait clairsemé et le libellé
// « last N days » trompeur). Index 0 = il y a windowDays-1 jours, dernier = aujourd'hui.
export function toDayBars(byDay: MonitoringDayStat[], windowDays: number): [number, number][] {
  const slots: [number, number][] = Array.from({ length: windowDays }, () => [0, 0])
  const today = Math.floor(Date.now() / 86_400_000)
  for (const d of byDay) {
    const dayIdx = Math.floor(new Date(d.day + 'T00:00:00Z').getTime() / 86_400_000)
    const idx = windowDays - 1 - (today - dayIdx)
    if (idx >= 0 && idx < windowDays) slots[idx] = [Math.max(0, d.calls - d.errors), d.errors]
  }
  return slots
}

export function fmtMs(ms: number | null): string {
  if (ms == null) return '—'
  return ms >= 1000 ? (ms / 1000).toFixed(1) + 's' : Math.round(ms) + 'ms'
}
