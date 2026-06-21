import { watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

// Lie un paramètre de query (`?key=value`) à une sélection de vue, dans le sens
// URL → état : un clic écrit l'URL (`set`), un watcher applique la sélection
// (`apply`). Conséquence : deep-link, bouton retour et refresh marchent par
// construction, sans dupliquer l'état entre l'URL et le composant.
//
// - `apply(value)` est rappelé à CHAQUE changement du param (navigation interne,
//   back/forward, lien direct) — PAS au montage : la valeur initiale se lit via
//   `read()` au bon moment (souvent après le chargement des données).
// - `set(value)` écrit le param en fusionnant les autres (replace par défaut pour
//   ne pas polluer l'historique ; `push` pour une vraie entrée d'historique).
//   `null`/`''` efface le param (URL propre).
export function useDeepLink<T = string>(
  key: string,
  apply: (value: T | null) => void,
  opts: { push?: boolean; parse?: (raw: string) => T } = {},
) {
  const route = useRoute()
  const router = useRouter()
  const parse = opts.parse ?? ((raw: string) => raw as unknown as T)

  function read(): T | null {
    const raw = route.query[key]
    return typeof raw === 'string' && raw !== '' ? parse(raw) : null
  }

  function set(value: T | null | undefined) {
    const query = { ...route.query }
    if (value == null || value === ('' as unknown as T)) delete query[key]
    else query[key] = String(value)
    void (opts.push ? router.push({ query }) : router.replace({ query }))
  }

  watch(() => route.query[key], () => apply(read()))

  return { read, set }
}
