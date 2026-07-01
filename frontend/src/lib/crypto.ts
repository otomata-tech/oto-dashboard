// Chiffrement E2E « zero-knowledge » pour le partage public de projet (ADR 0032 §3).
//
// Le snapshot d'un projet (brief + pages) est chiffré DANS LE NAVIGATEUR avec une clé
// AES-256-GCM aléatoire. Seul le ciphertext part au backend ; la clé est encodée dans
// le FRAGMENT de l'URL (`/p/p/<token>#<clé>`), qui n'est jamais envoyé au serveur.
// Résultat : la plateforme ne peut pas lire un projet partagé — « encrypted » au sens fort.
//
// Format du blob : base64( iv[12] ‖ ciphertext ) — l'IV voyage en clair avec le message
// (pratique standard GCM ; il ne doit jamais être réutilisé avec la même clé, garanti ici
// par la génération d'une clé neuve à chaque publication).

const IV_BYTES = 12

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

function base64ToBuf(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// base64url (RFC 4648 §5, sans padding) — sûr dans un fragment d'URL.
function toBase64Url(b64: string): string {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  return b64 + '='.repeat((4 - (b64.length % 4)) % 4)
}

async function exportKeyB64Url(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key)
  return toBase64Url(bufToBase64(raw))
}

async function importKeyB64Url(s: string): Promise<CryptoKey> {
  const raw = base64ToBuf(fromBase64Url(s))
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt'])
}

/**
 * Chiffre un objet JSON avec une clé AES-256-GCM NEUVE.
 * Renvoie le ciphertext (base64) à stocker côté serveur + la clé (base64url) à mettre
 * dans le fragment de l'URL. La clé n'existe que le temps de cet appel côté client.
 */
export async function encryptForShare(payload: unknown): Promise<{ ciphertext: string; keyFragment: string }> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const data = new TextEncoder().encode(JSON.stringify(payload))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data)
  const blob = new Uint8Array(IV_BYTES + ct.byteLength)
  blob.set(iv, 0)
  blob.set(new Uint8Array(ct), IV_BYTES)
  return { ciphertext: bufToBase64(blob.buffer), keyFragment: await exportKeyB64Url(key) }
}

/**
 * Déchiffre un ciphertext (base64) avec la clé du fragment (base64url).
 * Lève si la clé est fausse ou le blob altéré (GCM authentifie).
 */
export async function decryptShare<T = unknown>(ciphertext: string, keyFragment: string): Promise<T> {
  const key = await importKeyB64Url(keyFragment)
  const blob = base64ToBuf(ciphertext)
  const iv = blob.slice(0, IV_BYTES)
  const ct = blob.slice(IV_BYTES)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
  return JSON.parse(new TextDecoder().decode(plain)) as T
}
