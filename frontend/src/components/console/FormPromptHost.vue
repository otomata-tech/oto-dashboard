<script setup lang="ts">
// Hôte global du FormDialog impératif (promptFormDialog). Monté une fois dans
// ConsoleLayout, à côté de PromptDialog. Résout la promesse au submit (valeurs) via
// onConfirm, ou à l'annulation/fermeture (null) via update:open=false.
import FormDialog from './FormDialog.vue'
import { useFormPrompt } from '@/composables/useFormPrompt'

const { config, open, settle } = useFormPrompt()

async function onConfirm(values: Record<string, string>) { settle(values) }
function onOpenChange(v: boolean) { if (!v) settle(null) }
</script>

<template>
  <FormDialog
    v-if="config"
    :open="open"
    :title="config.title"
    :description="config.description"
    :fields="config.fields"
    :submit-label="config.submitLabel"
    :on-confirm="onConfirm"
    elevated
    @update:open="onOpenChange"
  />
</template>
