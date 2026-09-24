// Une programmation telle que `triggers op=list|get` la sert : un horaire par défaut, tous les
// champs du contrat présents (`null` quand le serveur ne les sert pas). Partagée par le banc
// de l'espace et les specs des composants, pour qu'un champ neuf du contrat s'ajoute ici seul.
import type { RunnerTrigger } from '@/api/console'

export const programmation = (over: Partial<RunnerTrigger> = {}): RunnerTrigger => ({
  id: 3, org_id: 2, sub: 'u', procedure: 'veille', cron: '0 8 * * *', tz: 'Europe/Paris', tools: [],
  project_id: null, input: null, label: 'Veille du matin', enabled: true,
  next_due: '2026-09-14 06:00:00', last_enqueued_at: null, created_at: '2026-09-01 08:00:00',
  max_steps: null, model: null, expired_count: 0, expired_since: null, expired_last: null,
  kind: 'schedule', payload_mode: null, payload_fields: null, max_per_hour: null, fraicheur_s: null,
  hook_url: null, deliveries_24h: null, deliveries_refused_24h: null, last_delivery: null,
  tool_warnings: [], queue_pending: null, queue_held: null, ...over,
})

/** Une programmation webhook : ni horaire ni prochaine exécution, lue par ce qu'elle reçoit. */
export const webhook = (over: Partial<RunnerTrigger> = {}): RunnerTrigger => programmation({
  id: 5, label: 'Nouveau lead', procedure: 'qualifier-lead', kind: 'webhook', cron: null,
  next_due: null, payload_mode: 'inline', hook_url: 'https://mcp.oto.cx/api/hooks/5',
  deliveries_24h: 12, deliveries_refused_24h: 1, last_delivery: '2026-09-13 11:40:00',
  queue_pending: 2, queue_held: 0, ...over,
})
