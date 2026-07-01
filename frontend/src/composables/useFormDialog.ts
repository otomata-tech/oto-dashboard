import { ref } from 'vue'

// Remplaçant shadcn de promptForm : un <FormDialog> validé (vee-validate + zod)
// piloté par une config posée à l'ouverture. Un seul <FormDialog> par vue, config
// échangée par action. Voir components/console/FormDialog.vue.

export interface FormDialogField {
  key: string
  label: string
  type?: 'text' | 'password' | 'textarea' | 'select'
  placeholder?: string
  required?: boolean
  initial?: string
  options?: { value: string; label: string }[]
  hint?: string
}

export interface FormDialogConfig {
  title: string
  description?: string
  fields: FormDialogField[]
  submitLabel?: string
  // Résout au succès (dialog fermé). Lève pour garder le dialog ouvert (le parent toast).
  onConfirm: (values: Record<string, string>) => Promise<void>
}

export function useFormDialog() {
  const config = ref<FormDialogConfig | null>(null)
  const open = ref(false)

  function openForm(c: FormDialogConfig) {
    config.value = c
    open.value = true
  }

  return { formDialog: config, formDialogOpen: open, openForm }
}
