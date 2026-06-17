// Traduit les erreurs backend (api() lève `Error("<status> <code>")`, ex.
// "409 namespace_exists"; getAccessToken lève "stale_session") en messages
// lisibles. Code inconnu → on renvoie le message brut plutôt que de le masquer.

const MESSAGES: Record<string, string> = {
  namespace_exists: 'a namespace with that name already exists',
  duplicate_label: 'a key with that provider and label already exists',
  last_org_admin: "can't remove or demote the last admin of the org",
  google_not_connected: 'link a google account first (connectors)',
  invalid_provider: 'unknown provider',
  namespace_not_controlled: "that namespace isn't a controlled one",
  unknown_user: 'unknown user',
  unknown_org: 'unknown organization',
  unknown_key: 'unknown platform key',
  not_a_member: 'not a member of this org',
  missing_fields: 'fill in all required fields',
  empty_api_key: 'the api key is empty',
  missing_name: 'a name is required',
  invalid_role: 'invalid role',
  forbidden: "you don't have access to this",
  stale_session: 'your session expired — sign in again',
  invalid_api_token: 'invalid api token',
  invalid_token: 'invalid session token',
  missing_bearer: 'not authenticated',
  email_mismatch: 'this invitation was sent to a different email — sign in with the account that received it',
  invalid_or_expired: 'this invitation is invalid, expired, or already used',
}

export function humanize(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  const code = raw.includes(' ') ? raw.slice(raw.indexOf(' ') + 1) : raw
  return MESSAGES[code] ?? MESSAGES[raw] ?? raw
}
