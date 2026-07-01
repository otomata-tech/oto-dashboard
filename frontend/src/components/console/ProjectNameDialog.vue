<script setup lang="ts">
// Dialog de nom VALIDÉ (vee-validate + zod) — réutilisable pour « nouveau projet »
// et « utiliser un modèle ». Remplace le promptForm générique : nom requis, trimmé,
// borné. L'appel réseau est délégué au parent (`onConfirm` async) ; le dialog garde
// l'ouverture + l'état d'envoi et se ferme au succès.
import { watch } from 'vue'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import * as z from 'zod'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

const props = withDefaults(defineProps<{
  open: boolean
  title: string
  description?: string
  label?: string
  placeholder?: string
  initial?: string
  submitLabel?: string
  onConfirm: (name: string) => Promise<void>
}>(), { description: '', label: 'Nom', placeholder: '', initial: '', submitLabel: 'Créer' })
const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>()

const schema = toTypedSchema(
  z.object({
    name: z.string().trim().min(1, 'Nom requis').max(120, 'Trop long (max 120 caractères)'),
  }),
)

const { handleSubmit, isSubmitting, resetForm } = useForm({
  validationSchema: schema,
  initialValues: { name: props.initial },
})

watch(() => props.open, (o) => { if (o) resetForm({ values: { name: props.initial } }) })

const submit = handleSubmit(async (values) => {
  try {
    await props.onConfirm(values.name.trim())
    emit('update:open', false)
  } catch {
    // Le parent affiche le toast d'erreur ; on garde le dialog ouvert pour corriger.
  }
})
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[420px]">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription v-if="description">{{ description }}</DialogDescription>
      </DialogHeader>

      <form class="grid gap-4" @submit.prevent="submit">
        <FormField v-slot="{ componentField }" name="name">
          <FormItem>
            <FormLabel>{{ label }}</FormLabel>
            <FormControl>
              <Input type="text" :placeholder="placeholder" autocomplete="off" v-bind="componentField" />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <DialogFooter>
          <Button type="button" variant="ghost" :disabled="isSubmitting" @click="emit('update:open', false)">
            annuler
          </Button>
          <Button type="submit" :disabled="isSubmitting">
            {{ isSubmitting ? '…' : submitLabel }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
