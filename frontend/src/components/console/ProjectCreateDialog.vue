<script setup lang="ts">
// Création d'un projet — form VALIDÉ (vee-validate + zod), miroir de
// NamespaceCreateDialog. ADR 0049 : le projet est possédé par un SCOPE — org active
// (défaut), une équipe/pôle (cloisonne aux membres + admins d'org), ou la
// bibliothèque plateforme (admins plateforme seulement). L'appel réseau est délégué
// au parent ; les équipes proposées sont celles que le parent juge utilisables.
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

export interface ProjectOwnerPayload {
  name: string
  owner?: { owner_type: 'group' | 'platform'; owner_id?: string }
}

const props = defineProps<{
  open: boolean
  orgName?: string | null
  groups?: { id: number; name: string }[]   // équipes proposables dans l'org active
  canPlatform?: boolean                      // opérateur plateforme : projet bibliothèque
  onConfirm: (payload: ProjectOwnerPayload) => Promise<void>
}>()
const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>()

const schema = toTypedSchema(
  z.object({
    name: z.string().trim().min(1, 'Nom requis').max(80, 'Trop long (max 80 caractères)'),
    scope: z.string(),
  }),
)

const { handleSubmit, isSubmitting, resetForm } = useForm({
  validationSchema: schema,
  initialValues: { name: '', scope: 'org' },
})

watch(() => props.open, (o) => { if (o) resetForm({ values: { name: '', scope: 'org' } }) })

const submit = handleSubmit(async (values) => {
  let owner: ProjectOwnerPayload['owner']
  if (values.scope === 'platform') owner = { owner_type: 'platform' }
  else if (values.scope.startsWith('group:'))
    owner = { owner_type: 'group', owner_id: values.scope.slice('group:'.length) }
  try {
    await props.onConfirm({ name: values.name.trim(), owner })
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
        <DialogTitle>nouveau projet</DialogTitle>
        <DialogDescription>un conteneur de travail (un but + ses entités).</DialogDescription>
      </DialogHeader>

      <form class="grid gap-4" @submit.prevent="submit">
        <FormField v-slot="{ componentField }" name="name">
          <FormItem>
            <FormLabel>nom</FormLabel>
            <FormControl>
              <Input type="text" placeholder="ex. prospection Q3" autocomplete="off" v-bind="componentField" />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField v-if="(groups && groups.length) || canPlatform" v-slot="{ componentField }" name="scope">
          <FormItem>
            <FormLabel>propriétaire</FormLabel>
            <Select v-bind="componentField">
              <FormControl>
                <SelectTrigger class="w-full">
                  <SelectValue placeholder="Choisir un scope" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="org">org{{ orgName ? ` (${orgName})` : '' }}</SelectItem>
                <SelectItem v-for="g in groups ?? []" :key="g.id" :value="`group:${g.id}`">
                  équipe — {{ g.name }}
                </SelectItem>
                <SelectItem v-if="canPlatform" value="platform">bibliothèque oto (plateforme)</SelectItem>
              </SelectContent>
            </Select>
            <FormDescription>un projet d'équipe n'est visible que de ses membres (+ admins d'org).</FormDescription>
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
