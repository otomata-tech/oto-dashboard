import { ref } from 'vue'
import type { FormDialogField } from './useFormDialog'

// Version IMPÉRATIVE (promesse) de FormDialog — pour les appelants qui ont besoin
// d'une valeur de retour (ex. useTransferOwnership), à la manière de promptForm mais
// rendu par le FormDialog shadcn validé. Singleton module-level ; un <FormPromptHost>
// est monté une fois dans ConsoleLayout. La promesse résout aux valeurs (submit) ou
// à null (annulation / fermeture).

export interface FormPromptConfig {
  title: string
  description?: string
  fields: FormDialogField[]
  submitLabel?: string
}

const config = ref<FormPromptConfig | null>(null)
const open = ref(false)
let resolver: ((v: Record<string, string> | null) => void) | null = null

export function useFormPrompt() {
  function promptFormDialog(cfg: FormPromptConfig): Promise<Record<string, string> | null> {
    resolver?.(null) // une seule demande à la fois : annule proprement la précédente
    config.value = cfg
    open.value = true
    return new Promise((resolve) => { resolver = resolve })
  }

  // Résout la promesse (submit = valeurs, annulation = null) et ferme le dialog.
  function settle(v: Record<string, string> | null) {
    open.value = false
    const r = resolver
    resolver = null
    r?.(v)
  }

  return { config, open, promptFormDialog, settle }
}
