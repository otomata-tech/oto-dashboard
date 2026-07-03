<script setup lang="ts">
// Saisie d'un credential keyé (ADR 0011) — form VALIDÉ à champs DYNAMIQUES
// (vee-validate + zod construit depuis credential_fields). Remplace le promptForm :
// chaque champ requis est vérifié, les champs `secret` sont masqués (password).
// L'appel réseau (setCredential) est délégué au parent via `onConfirm`.
import { computed, watch } from 'vue'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import * as z from 'zod'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface Field { name: string; label: string; secret?: boolean; required?: boolean }

const props = defineProps<{
  open: boolean
  label: string
  fields: Field[]
  single?: boolean
  onConfirm: (values: Record<string, string>) => Promise<void>
}>()
const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>()

// Un champ `required:false` (connecteur « ET/OU » type slack) peut rester vide,
// mais il faut au moins un champ renseigné au total — même règle que le backend.
const schema = computed(() =>
  toTypedSchema(
    z.object(Object.fromEntries(
      props.fields.map((f) => [
        f.name,
        f.required === false ? z.string().trim() : z.string().trim().min(1, 'requis'),
      ]),
    )).refine(
      (v) => Object.values(v).some((s) => s.length > 0),
      { message: 'renseigne au moins un champ', path: [props.fields[0]?.name ?? ''] },
    ),
  ),
)

const { handleSubmit, isSubmitting, resetForm } = useForm({ validationSchema: schema })

const blank = () => Object.fromEntries(props.fields.map((f) => [f.name, '']))
watch(() => props.open, (o) => { if (o) resetForm({ values: blank() }) })

const title = computed(() => (props.single ? `clé api ${props.label}` : `connecter ${props.label}`))
const description = computed(() => (props.single
  ? `ta clé ${props.label} — stockée chiffrée, scopée à l'org courante ; elle y prime sur la clé d'org et de plateforme.`
  : `tes identifiants ${props.label} — stockés chiffrés, scopés à l'org courante, utilisés pour agir en ton nom.`))

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
        <DialogDescription>{{ description }}</DialogDescription>
      </DialogHeader>

      <form class="grid gap-4" @submit.prevent="submit">
        <FormField v-for="f in fields" :key="f.name" v-slot="{ componentField }" :name="f.name">
          <FormItem>
            <FormLabel>{{ f.label.toLowerCase() }}<span v-if="f.required === false" class="dim"> · optionnel</span></FormLabel>
            <FormControl>
              <Input
                :type="f.secret ? 'password' : 'text'"
                autocomplete="off"
                :placeholder="single ? `colle ta clé ${label}` : ''"
                v-bind="componentField"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <DialogFooter>
          <Button type="button" variant="ghost" :disabled="isSubmitting" @click="emit('update:open', false)">annuler</Button>
          <Button type="submit" :disabled="isSubmitting">
            {{ isSubmitting ? '…' : (single ? 'enregistrer' : 'connecter') }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
