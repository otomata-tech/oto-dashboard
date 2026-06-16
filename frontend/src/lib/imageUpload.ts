// Validation client des images d'avatar / logo — miroir du backend
// (media_store.py : png/jpeg/webp, ≤ 2 Mo). Lève une Error lisible si KO.
export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024 // 2 Mo
export const IMAGE_ACCEPT_ATTR = ACCEPTED_IMAGE_TYPES.join(',')

export function validateImage(file: File): void {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    throw new Error('format accepté : png, jpeg ou webp')
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('image trop lourde (max 2 Mo)')
  }
}
