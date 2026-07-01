<script setup lang="ts">
// Création d'un namespace datastore — form VALIDÉ (vee-validate + zod). Remplace le
// promptForm : nom requis/trimmé/borné + scope (perso ou classeur d'org active,
// proposé seulement s'il y a une org active). L'appel réseau est délégué au parent.
import { watch } from 'vue'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import * as z from 'zod'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Button } from '@/components/ui/button'

const props = defineProps<{
  open: boolean
  orgName?: string | null   // null/absent → pas d'org active : scope perso implicite
  onConfirm: (payload: { name: string; scope: 'user' | 'org' }) => Promise<void>
}>()
const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>()

const schema = toTypedSchema(
  z.object({
    name: z.string().trim().min(1, 'Nom requis').max(60, 'Trop long (max 60 caractères)')
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9 _-]*$/, 'Lettres, chiffres, espaces, - et _ seulement'),
    scope: z.enum(['user', 'org']),
  }),
)

const { handleSubmit, isSubmitting, resetForm } = useForm({
  validationSchema: schema,
  initialValues: { name: '', scope: 'user' as const },
})

watch(() => props.open, (o) => { if (o) resetForm({ values: { name: '', scope: 'user' } }) })

const submit = handleSubmit(async (values) => {
  try {
    await props.onConfirm({ name: values.name.trim(), scope: values.scope })
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
        <DialogTitle>nouveau namespace</DialogTitle>
        <DialogDescription>stockage tabulaire lu &amp; écrit par tes agents via les outils data_*.</DialogDescription>
      </DialogHeader>

      <form class="grid gap-4" @submit.prevent="submit">
        <FormField v-slot="{ componentField }" name="name">
          <FormItem>
            <FormLabel>nom</FormLabel>
            <FormControl>
              <Input type="text" placeholder="e.g. prospects-q3" autocomplete="off" v-bind="componentField" />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField v-if="orgName" v-slot="{ componentField }" name="scope">
          <FormItem>
            <FormLabel>propriétaire</FormLabel>
            <Select v-bind="componentField">
              <FormControl>
                <SelectTrigger class="w-full">
                  <SelectValue placeholder="Choisir un scope" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="user">personnel (moi seul)</SelectItem>
                <SelectItem value="org">classeur d'org ({{ orgName }})</SelectItem>
              </SelectContent>
            </Select>
            <FormDescription>un classeur d'org est partagé avec l'équipe active.</FormDescription>
            <FormMessage />
          </FormItem>
        </FormField>

        <DialogFooter>
          <Button type="button" variant="ghost" :disabled="isSubmitting" @click="emit('update:open', false)">annuler</Button>
          <Button type="submit" :disabled="isSubmitting">{{ isSubmitting ? 'création…' : 'créer' }}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
