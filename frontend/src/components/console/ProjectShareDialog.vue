<script setup lang="ts">
// Partage d'un projet — form VALIDÉ (vee-validate + zod) dans un Dialog shadcn.
// Remplace le promptForm générique : email vérifié à la frappe (plus de saisie
// libre non validée). L'appel réseau est délégué au parent via `onConfirm`
// (async) ; le dialog garde l'ouverture + l'état d'envoi et se ferme au succès.
import { watch } from 'vue'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import * as z from 'zod'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'

const props = defineProps<{
  open: boolean
  projectName?: string
  onConfirm: (payload: { email: string; permission: 'read' | 'write' }) => Promise<void>
}>()
const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>()

const schema = toTypedSchema(
  z.object({
    email: z.string({ required_error: 'Email requis' }).min(1, 'Email requis').email('Email invalide'),
    permission: z.enum(['write', 'read']),
  }),
)

const { handleSubmit, isSubmitting, resetForm } = useForm({
  validationSchema: schema,
  initialValues: { email: '', permission: 'write' },
})

// Réinitialise à chaque ouverture (pas de valeurs traînantes d'un partage précédent).
watch(() => props.open, (o) => { if (o) resetForm({ values: { email: '', permission: 'write' } }) })

const submit = handleSubmit(async (values) => {
  try {
    await props.onConfirm({ email: values.email, permission: values.permission })
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
        <DialogTitle>Partager le projet</DialogTitle>
        <DialogDescription>
          Invite un utilisateur oto{{ projectName ? ` sur « ${projectName} »` : '' }} par son email.
        </DialogDescription>
      </DialogHeader>

      <form class="grid gap-4" @submit.prevent="submit">
        <FormField v-slot="{ componentField }" name="email">
          <FormItem>
            <FormLabel>Email</FormLabel>
            <FormControl>
              <Input type="email" placeholder="collègue@exemple.com" autocomplete="off" v-bind="componentField" />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField v-slot="{ componentField }" name="permission">
          <FormItem>
            <FormLabel>Droit</FormLabel>
            <Select v-bind="componentField">
              <FormControl>
                <SelectTrigger class="w-full">
                  <SelectValue placeholder="Choisir un droit" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="write">édition</SelectItem>
                <SelectItem value="read">lecture</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        </FormField>

        <DialogFooter>
          <Button type="button" variant="ghost" :disabled="isSubmitting" @click="emit('update:open', false)">
            annuler
          </Button>
          <Button type="submit" :disabled="isSubmitting">
            {{ isSubmitting ? 'partage…' : 'partager' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
