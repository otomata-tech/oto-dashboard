import { ref } from 'vue'

// Toast minimal partagé pour la console.
// Un toast peut porter UNE action facultative — typiquement « annuler » juste après
// un geste : le rattrapage vit dans la confirmation elle-même, à l'endroit et au
// moment où l'on comprend ce qui vient de se passer (jamais dans un dialog natif).
// L'appel historique `toast(msg)` est inchangé : sans action, rien ne bouge.

export interface ToastAction {
  label: string
  run: () => void | Promise<void>
}
export interface ToastOptions {
  action?: ToastAction
  /** Durée d'affichage en ms — par défaut plus longue quand il y a une action
   * (le temps de lire le message ET de décider). */
  duration?: number
}

const PLAIN_MS = 2200
const ACTION_MS = 9000

const message = ref<string | null>(null)
const action = ref<ToastAction | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined

function dismiss() {
  clearTimeout(timer)
  message.value = null
  action.value = null
}

export function useToast() {
  function toast(msg: string, opts: ToastOptions = {}) {
    message.value = msg
    action.value = opts.action ?? null
    clearTimeout(timer)
    timer = setTimeout(dismiss, opts.duration ?? (opts.action ? ACTION_MS : PLAIN_MS))
  }
  /** Déclenche l'action du toast courant et le referme aussitôt (pas de double clic). */
  async function runToastAction() {
    const a = action.value
    if (!a) return
    dismiss()
    await a.run()
  }
  return { message, action, toast, dismissToast: dismiss, runToastAction }
}
