// Raccourci clavier global (lot 3 Ship 2) — ⌘K / Ctrl+K ouvre la recherche.
// Posé/retiré au montage du composant hôte ; ignore les frappes dans un champ
// SEULEMENT si le raccourci n'a pas de modificateur (⌘K passe partout).
import { onBeforeUnmount, onMounted } from 'vue'

export function useHotkey(key: string, handler: () => void, { meta = true } = {}) {
  function onKey(e: KeyboardEvent) {
    if (e.key.toLowerCase() !== key.toLowerCase()) return
    if (meta && !(e.metaKey || e.ctrlKey)) return
    e.preventDefault()
    handler()
  }
  onMounted(() => window.addEventListener('keydown', onKey))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
}
