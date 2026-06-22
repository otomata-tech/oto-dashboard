import { useAuth } from '@/composables/useAuth'

// Account API Logto (self-service du compte) — gestion des facteurs MFA depuis le
// dashboard. La base est l'ENDPOINT Logto (auth.oto.ninja), pas oto-mcp, et le bearer
// est le token OPAQUE OP (getAccountToken), pas le token d'API oto-mcp. Requiert le
// scope `identities` + l'Account Center activé côté tenant (champ mfa = Edit).
const base = (import.meta.env.VITE_LOGTO_ENDPOINT as string).replace(/\/$/, '')

export type MfaFactorType =
  | 'Totp'
  | 'WebAuthn'
  | 'BackupCode'
  | 'EmailVerificationCode'
  | 'PhoneVerificationCode'

export type MfaFactor = {
  id: string
  type: MfaFactorType
  createdAt: string
  lastUsedAt?: string
  name?: string
  agent?: string
  remainCodes?: number
}

// Erreur typée : permet à l'UI de distinguer le 403 « scope identities manquant »
// (l'user doit se reconnecter une fois) des autres erreurs.
export class AccountApiError extends Error {
  constructor(public status: number, public code: string | undefined, message: string) {
    super(message)
  }
}

async function accountApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { getAccountToken } = useAuth()
  const token = await getAccountToken()
  const resp = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })
  if (!resp.ok) {
    const body = (await resp.json().catch(() => ({}))) as { message?: string; code?: string }
    throw new AccountApiError(resp.status, body.code, body.message || `Erreur ${resp.status}`)
  }
  if (resp.status === 204) return undefined as T
  return (await resp.json().catch(() => undefined)) as T
}

export const listMfaFactors = () => accountApi<MfaFactor[]>('/api/my-account/mfa-verifications')

export const generateTotpSecret = () =>
  accountApi<{ secret: string; secretQrCode?: string }>(
    '/api/my-account/mfa-verifications/totp-secret/generate',
    { method: 'POST' },
  )

export const bindTotp = (secret: string, code: string) =>
  accountApi<void>('/api/my-account/mfa-verifications/totp', {
    method: 'PUT',
    body: JSON.stringify({ secret, code }),
  })

export const generateBackupCodes = () =>
  accountApi<{ codes: string[] }>('/api/my-account/mfa-verifications/backup-codes/generate', {
    method: 'POST',
  })

export const renameFactor = (id: string, name: string) =>
  accountApi<void>(`/api/my-account/mfa-verifications/${id}/name`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  })

export const deleteFactor = (id: string) =>
  accountApi<void>(`/api/my-account/mfa-verifications/${id}`, { method: 'DELETE' })
