import { ref } from 'vue'

// Modale de saisie partagée pour la console — remplace window.prompt/confirm.
// Même pattern singleton que useToast : état module-level + <PromptDialog/> monté
// une fois dans ConsoleLayout. Les verbes renvoient une promesse résolue à la
// soumission (valeurs / true) ou à l'annulation (null / false).

export interface PromptField {
  key: string
  label: string
  type?: 'text' | 'password' | 'textarea' | 'select'
  placeholder?: string
  value?: string
  options?: { value: string; label: string }[]
  required?: boolean
  hint?: string
}
export interface FormConfig {
  title: string
  description?: string
  fields: PromptField[]
  submitLabel?: string
}
export interface ConfirmConfig {
  title: string
  message?: string
  confirmLabel?: string
  danger?: boolean
}
type DialogState =
  | { kind: 'form'; config: FormConfig }
  | { kind: 'confirm'; config: ConfirmConfig }
  | null

const state = ref<DialogState>(null)
let resolver: ((value: unknown) => void) | null = null

function open<T>(s: Exclude<DialogState, null>): Promise<T> {
  // Une seule modale à la fois : si une demande traîne, on l'annule proprement.
  resolver?.(null)
  return new Promise<T>((resolve) => {
    resolver = resolve as (value: unknown) => void
    state.value = s
  })
}

export function usePrompt() {
  function promptForm(config: FormConfig) {
    return open<Record<string, string> | null>({ kind: 'form', config })
  }
  // Raccourci mono-champ.
  function promptText(title: string, field: Omit<PromptField, 'key'> & { key?: string } = { label: '' }) {
    return open<Record<string, string> | null>({
      kind: 'form',
      config: { title, fields: [{ key: 'value', ...field }] },
    }).then((r) => (r ? r.value ?? null : null))
  }
  function confirmAction(config: ConfirmConfig) {
    return open<boolean>({ kind: 'confirm', config })
  }
  function resolve(value: unknown) {
    state.value = null
    const r = resolver
    resolver = null
    r?.(value)
  }
  return { state, promptForm, promptText, confirmAction, resolve }
}
