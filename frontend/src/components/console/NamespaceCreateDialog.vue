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
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{
  open: boolean
  orgName?: string | null   // null/absent → pas d'org active : scope perso implicite
  onConfirm: (payload: { name: string; scope: 'user' | 'org' }) => Promise<void>
}>()
const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>()

const schema = toTypedSchema(
  z.object({
    name: z.string().trim().min(1, t('workUi.create.nameRequired')).max(60, t('workUi.create.tooLong', { n: 60 }))
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9 _-]*$/, t('workUi.create.nameChars')),
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
        <DialogTitle>{{ t('workUi.create.nsTitle') }}</DialogTitle>
        <DialogDescription>{{ t('workUi.create.nsDesc') }}</DialogDescription>
      </DialogHeader>

      <form class="grid gap-4" @submit.prevent="submit">
        <FormField v-slot="{ componentField }" name="name">
          <FormItem>
            <FormLabel>{{ t('workUi.create.name') }}</FormLabel>
            <FormControl>
              <Input type="text" :placeholder="t('workUi.create.nsPh')" autocomplete="off" v-bind="componentField" />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField v-if="orgName" v-slot="{ componentField }" name="scope">
          <FormItem>
            <FormLabel>{{ t('workUi.create.owner') }}</FormLabel>
            <Select v-bind="componentField">
              <FormControl>
                <SelectTrigger class="w-full">
                  <SelectValue :placeholder="t('workUi.create.scopePh')" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="user">{{ t('workUi.create.personal') }}</SelectItem>
                <SelectItem value="org">{{ t('workUi.create.orgBinder', { name: orgName }) }}</SelectItem>
              </SelectContent>
            </Select>
            <FormDescription>{{ t('workUi.create.nsHelp') }}</FormDescription>
            <FormMessage />
          </FormItem>
        </FormField>

        <DialogFooter>
          <Button type="button" variant="ghost" :disabled="isSubmitting" @click="emit('update:open', false)">{{ t('workUi.create.cancel') }}</Button>
          <Button type="submit" :disabled="isSubmitting">{{ isSubmitting ? t('workUi.create.creating') : t('workUi.create.create') }}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
