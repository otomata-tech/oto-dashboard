// Contrats REST oto-backend (mcp.oto.ninja) consommés par le dashboard.

export interface ConnectorMeta {
  name: string
  label: string
  help: string
  href: string | null
  availability: 'self_serve' | 'platform_granted'
  auth_modes: string[]
  personal_session: boolean
  secret_kind: 'api_key' | 'cookie' | 'oauth' | 'refresh_token' | 'none'
  namespaces: string[]
}

// Miroir de access.py::status_for (cascade user > org > platform).
export interface ProviderStatus {
  mode: 'user' | 'org' | 'platform' | 'forbidden' | 'over_quota'
  user_key_configured: boolean
  org_secret_configured: boolean
  platform_key_label: string | null
  quota_used_today: number
  quota_daily: number | null
}

export interface Me {
  sub: string
  email: string | null
  name: string | null
  role: string
  active_org: number | null
  active_org_name: string | null
  org_role: string | null
  linkedin: { configured: boolean }
  crunchbase: { configured: boolean }
  providers: Record<string, ProviderStatus | undefined>
}
