<script setup lang="ts">
// FormDialog — remplaçant shadcn VALIDÉ de promptForm. Champs déclaratifs
// (text/password/textarea/select), schéma zod construit dynamiquement (requis =
// trim + min 1). L'appel réseau est délégué via `onConfirm` ; le dialog reste
// ouvert en erreur. Piloté par useFormDialog (config par action).
import { computed, watch } from 'vue'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import * as z from 'zod'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import type { FormDialogField } from '@/composables/useFormDialog'

const props = withDefaults(defineProps<{
  open: boolean
  title: string
  description?: string
  fields: FormDialogField[]
  submitLabel?: string
  onConfirm: (values: Record<string, string>) => Promise<void>
  // `elevated` : HÉRITÉ — sans effet depuis l'échelle z unique (chantier α). Tous les
  // dialogs (maison + reka) partagent --z-modal ; un dialog reka est teleporté en fin
  // de <body> → à z égal il passe au-dessus d'une modale maison par l'ordre DOM (c'est
  // ce qui corrige « transférer » rendu derrière la modale de partage). Conservé pour
  // la compat d'API des appelants.
  elevated?: boolean
}>(), { description: '', submitLabel: 'valider', elevated: false })
const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>()

const schema = computed(() =>
  toTypedSchema(
    z.object(Object.fromEntries(
      props.fields.map((f) => {
        const base = z.string()
        return [f.key, f.required ? base.trim().min(1, 'requis') : base.optional().default('')]
      }),
    )),
  ),
)

const blank = () => Object.fromEntries(props.fields.map((f) => [f.key, f.initial ?? '']))
const { handleSubmit, isSubmitting, resetForm } = useForm({ validationSchema: schema, initialValues: blank() })
watch(() => props.open, (o) => { if (o) resetForm({ values: blank() }) })

const submit = handleSubmit(async (values) => {
  try {
    await props.onConfirm(values as Record<string, string>)
    emit('update:open', false)
  } catch {
    // Le parent affiche le toast d'erreur ; on garde le dialog ouvert pour corriger.
  }
})
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[440px]">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription v-if="description">{{ description }}</DialogDescription>
      </DialogHeader>

      <form class="grid gap-4" @submit.prevent="submit">
        <FormField v-for="f in fields" :key="f.key" v-slot="{ componentField }" :name="f.key">
          <FormItem>
            <FormLabel>{{ f.label }}</FormLabel>

            <template v-if="f.type === 'select'">
              <Select v-bind="componentField">
                <FormControl>
                  <SelectTrigger class="w-full">
                    <SelectValue :placeholder="f.placeholder || 'choisir…'" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem v-for="o in f.options ?? []" :key="o.value" :value="o.value">{{ o.label }}</SelectItem>
                </SelectContent>
              </Select>
            </template>

            <FormControl v-else-if="f.type === 'textarea'">
              <Textarea :placeholder="f.placeholder" rows="4" v-bind="componentField" />
            </FormControl>

            <FormControl v-else>
              <Input :type="f.type === 'password' ? 'password' : 'text'" :placeholder="f.placeholder" autocomplete="off" v-bind="componentField" />
            </FormControl>

            <FormDescription v-if="f.hint">{{ f.hint }}</FormDescription>
            <FormMessage />
          </FormItem>
        </FormField>

        <DialogFooter>
          <Button type="button" variant="ghost" :disabled="isSubmitting" @click="emit('update:open', false)">annuler</Button>
          <Button type="submit" :disabled="isSubmitting">{{ isSubmitting ? '…' : submitLabel }}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
