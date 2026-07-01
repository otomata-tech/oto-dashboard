<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import * as z from 'zod'
import ConsoleCard from './ConsoleCard.vue'
import Btn from './Btn.vue'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { getTokens, createToken, deleteToken } from '@/api/console'
import type { ApiToken } from '@/types/api'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'

// Tokens CLI/API = identité du compte (/api/me/tokens, user-scoped) → ils vivent
// dans le hub compte, pas dans les connecteurs (qui sont org-scopés).
const { toast } = useToast()
const { confirmAction } = usePrompt()

const tokens = ref<ApiToken[]>([])
const createOpen = ref(false)
const revealed = ref<string | null>(null)   // token en clair, montré UNE fois après création
const copied = ref(false)

async function reload() {
  tokens.value = (await getTokens().catch(() => ({ tokens: [] }))).tokens
}

// ── création (form validé) ──
const schema = toTypedSchema(
  z.object({
    label: z.string().trim().min(1, 'Label requis').max(40, 'Trop long (max 40 caractères)'),
  }),
)
const { handleSubmit, isSubmitting, resetForm } = useForm({
  validationSchema: schema,
  initialValues: { label: 'cli' },
})
watch(createOpen, (o) => { if (o) resetForm({ values: { label: 'cli' } }) })

const submitCreate = handleSubmit(async ({ label }) => {
  try {
    const { token } = await createToken(label)
    await reload()
    createOpen.value = false
    revealed.value = token   // ouvre le dialog de révélation
  } catch (e) {
    toast(humanize(e))       // on garde le dialog ouvert pour corriger
  }
})

// ── révélation (montré une seule fois) ──
function onRevealOpen(v: boolean) { if (!v) { revealed.value = null; copied.value = false } }
async function copyToken() {
  if (!revealed.value) return
  try {
    await navigator.clipboard.writeText(revealed.value)
    copied.value = true
  } catch { toast('copie impossible — sélectionne et copie à la main') }
}

async function revokeToken(t: ApiToken) {
  if (!await confirmAction({ title: 'revoke token', danger: true, confirmLabel: 'revoke', message: `revoke "${t.label}"?` })) return
  try { await deleteToken(t.id); toast('token revoked'); await reload() } catch (e) { toast(humanize(e)) }
}

onMounted(reload)
</script>

<template>
  <ConsoleCard id="tokens" title="cli & api tokens" flush
    sub="long-lived tokens for the oto cli and ci environments.">
    <template #actions><Btn kind="mini" icon="plus" @click="createOpen = true">new token</Btn></template>
    <table class="tbl">
      <thead><tr><th>label</th><th>created</th><th>last used</th><th style="width: 80px"></th></tr></thead>
      <tbody>
        <tr v-for="t in tokens" :key="t.id">
          <td style="font-weight: 600; color: var(--color-ink)">{{ t.label }}</td>
          <td class="dim">{{ fmtDate(t.created_at) }}</td>
          <td class="dim">{{ fmtDate(t.last_used_at) ?? 'never' }}</td>
          <td style="text-align: right"><Btn kind="danger" @click="revokeToken(t)">revoke</Btn></td>
        </tr>
        <tr v-if="!tokens.length"><td colspan="4" class="dim" style="text-align: center; padding: 16px">no tokens yet</td></tr>
      </tbody>
    </table>

    <!-- création -->
    <Dialog :open="createOpen" @update:open="createOpen = $event">
      <DialogContent class="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>new cli token</DialogTitle>
          <DialogDescription>long-lived token for the oto cli and ci environments.</DialogDescription>
        </DialogHeader>
        <form class="grid gap-4" @submit.prevent="submitCreate">
          <FormField v-slot="{ componentField }" name="label">
            <FormItem>
              <FormLabel>label</FormLabel>
              <FormControl>
                <Input type="text" placeholder="e.g. cli, ci" autocomplete="off" v-bind="componentField" />
              </FormControl>
              <FormDescription>pour reconnaître ce token dans la liste.</FormDescription>
              <FormMessage />
            </FormItem>
          </FormField>
          <DialogFooter>
            <Button type="button" variant="ghost" :disabled="isSubmitting" @click="createOpen = false">annuler</Button>
            <Button type="submit" :disabled="isSubmitting">{{ isSubmitting ? 'création…' : 'créer' }}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <!-- révélation (une seule fois) -->
    <Dialog :open="revealed !== null" @update:open="onRevealOpen">
      <DialogContent class="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>copie ce token maintenant</DialogTitle>
          <DialogDescription>il n'est affiché qu'une fois — range-le dans ton gestionnaire de secrets.</DialogDescription>
        </DialogHeader>
        <div class="flex items-center gap-2">
          <Input :model-value="revealed ?? ''" readonly class="font-mono text-[12px]" @focus="(e: FocusEvent) => (e.target as HTMLInputElement).select()" />
          <Button type="button" variant="outline" @click="copyToken">{{ copied ? 'copié ✓' : 'copier' }}</Button>
        </div>
        <DialogFooter>
          <Button type="button" @click="onRevealOpen(false)">terminé</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </ConsoleCard>
</template>
