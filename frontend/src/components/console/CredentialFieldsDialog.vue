<script setup lang="ts">
// Saisie d'un credential keyé (ADR 0011) — form VALIDÉ à champs DYNAMIQUES
// (vee-validate + zod construit depuis credential_fields). Remplace le promptForm :
// chaque champ requis est vérifié, les champs `secret` sont masqués (password).
// L'appel réseau (setCredential) est délégué au parent via `onConfirm`.
import { computed, ref, watch } from 'vue'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import * as z from 'zod'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { humanize } from '@/lib/errors'
import type { VerifyResult } from '@/types/api'

interface Field { name: string; label: string; secret?: boolean; required?: boolean; help?: string }

const props = defineProps<{
  open: boolean
  label: string
  fields: Field[]
  single?: boolean
  // Multi-compte (#121) : 'new' ajoute un compte NOMMÉ à côté d'un existant (nom
  // obligatoire — le serveur refuse une seconde pose anonyme) ; 'fixed' repose sur
  // `account` sans le demander ; 'none' (défaut) = pose ordinaire, aucun champ.
  accountMode?: 'none' | 'new' | 'fixed'
  account?: string
  accountNoun?: string
  accountNames?: string[]
  onConfirm: (values: Record<string, string>, account: string) => Promise<void>
  // Optionnel : sonde exécutée APRÈS un enregistrement réussi (« tester la connexion »).
  // OK → ferme ; échec → reste ouvert avec le message provider pour corriger.
  verify?: () => Promise<VerifyResult>
}>()
const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>()

// Un champ `required:false` (connecteur « ET/OU » type slack, ou config
// optionnelle type base_url lighton) peut rester vide, mais il faut au moins
// un champ renseigné au total — même règle que le backend. ⚠️ Un champ jamais
// touché arrive `undefined` (pas '') à vee-validate → sans `.optional()`, zod
// répondait son « Required » par défaut sur un champ pourtant optionnel.
// Le mot du fournisseur, servi par le registre — « compte » si rien n'est déclaré.
const noun = computed(() => props.accountNoun || 'compte')
const asksAccount = computed(() => props.accountMode === 'new')
// Clé réservée du formulaire : ne peut pas entrer en collision avec un champ de
// credential, qui vient du registre et n'a jamais ce nom.
const ACCOUNT_KEY = '__account'

const schema = computed(() =>
  toTypedSchema(
    z.object(Object.fromEntries([
      ...props.fields.map((f) => [
        f.name,
        f.required === false
          ? z.string().trim().optional().default('')
          : z.string().trim().min(1, 'requis'),
      ]),
      ...(asksAccount.value
        ? [[ACCOUNT_KEY, z.string().trim().min(1, 'requis').refine(
            (v: string) => !(props.accountNames ?? []).includes(v),
            `ce ${noun.value} existe déjà`)]]
        : []),
    ])).refine(
      // Le nom du compte ne compte pas comme un champ renseigné : sans identifiant,
      // il n'y a rien à enregistrer.
      (v) => props.fields.some((f) => ((v as Record<string, string>)[f.name] ?? '').length > 0),
      { message: 'renseigne au moins un champ', path: [props.fields[0]?.name ?? ''] },
    ),
  ),
)

const { handleSubmit, isSubmitting, resetForm } = useForm({ validationSchema: schema })

const blank = () => Object.fromEntries([
  ...props.fields.map((f) => [f.name, '']),
  ...(asksAccount.value ? [[ACCOUNT_KEY, '']] : []),
])
const testing = ref(false)
const testRes = ref<VerifyResult | null>(null)
// immediate : si le dialog est monté déjà ouvert, le watch transitionnel ne
// firait jamais → valeurs initiales absentes (champs undefined).
watch(() => props.open, (o) => { if (o) { resetForm({ values: blank() }); testRes.value = null } },
      { immediate: true })

const title = computed(() => {
  if (props.accountMode === 'new') return `ajouter un ${noun.value} ${props.label}`
  if (props.accountMode === 'fixed') return `${props.label} · ${props.account}`
  return props.single ? `clé api ${props.label}` : `connecter ${props.label}`
})
const description = computed(() => {
  if (props.accountMode === 'new')
    return `un second jeu d'identifiants ${props.label}, sous son propre nom — tu choisiras lequel sert par défaut, et ton agent peut viser l'autre à l'appel.`
  if (props.accountMode === 'fixed')
    return `remplace les identifiants de ce ${noun.value} — le reste ne bouge pas.`
  return props.single
    ? `ta clé ${props.label} — stockée chiffrée, scopée à l'org courante ; elle y prime sur la clé d'org et de plateforme.`
    : `tes identifiants ${props.label} — stockés chiffrés, scopés à l'org courante, utilisés pour agir en ton nom.`
})

const submit = handleSubmit(async (values) => {
  testRes.value = null
  const all = values as Record<string, string>
  const account = asksAccount.value ? (all[ACCOUNT_KEY] ?? '').trim() : (props.account ?? '')
  const fieldValues = Object.fromEntries(props.fields.map((f) => [f.name, all[f.name] ?? '']))
  try {
    await props.onConfirm(fieldValues, account)
  } catch {
    // Le parent affiche le toast d'erreur ; on garde le dialog ouvert pour corriger.
    return
  }
  // Pas de sonde câblée → comportement historique (fermer au succès).
  if (!props.verify) { emit('update:open', false); return }
  // Sonde après enregistrement : OK → fermer ; échec → rester ouvert pour corriger.
  // ⚠️ SAUF `pending` : le credential est enregistré et volontairement incomplet
  // (connexion en deux temps — l'app est posée, le consentement se donne sur la
  // fiche). Rester ouvert enfermerait l'utilisateur dans un formulaire qui ne peut
  // pas aboutir (« connecter ne fait rien », vécu 28/07). On ferme et on laisse la
  // fiche afficher l'étape suivante.
  testing.value = true
  try {
    const res = await props.verify()
    testRes.value = res
    if (res.ok || res.pending) emit('update:open', false)
  } catch (e) {
    testRes.value = { ok: false, provider: '', error: humanize(e) }
  } finally {
    testing.value = false
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
        <FormField v-if="asksAccount" v-slot="{ componentField }" :name="ACCOUNT_KEY">
          <FormItem>
            <FormLabel>nom du {{ noun }}</FormLabel>
            <FormControl>
              <Input type="text" autocomplete="off"
                     :placeholder="`comment tu appelles ce ${noun}`" v-bind="componentField" />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField v-for="f in fields" :key="f.name" v-slot="{ componentField }" :name="f.name">
          <FormItem>
            <FormLabel>{{ f.label.toLowerCase() }}<span v-if="f.required === false" class="dim"> · optionnel</span></FormLabel>
            <FormControl>
              <Input
                :type="f.secret ? 'password' : 'text'"
                autocomplete="off"
                :placeholder="f.help || (single ? `colle ta clé ${label}` : '')"
                v-bind="componentField"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <p v-if="testRes && !testRes.ok" style="margin: 0; font-size: 12px; color: var(--color-terra-ink)">✗ {{ testRes.error }}</p>

        <DialogFooter>
          <Button type="button" variant="ghost" :disabled="isSubmitting || testing" @click="emit('update:open', false)">annuler</Button>
          <Button type="submit" :disabled="isSubmitting || testing">
            {{ testing ? 'test…' : (isSubmitting ? '…' : (accountMode === 'new' ? 'ajouter' : (single ? 'enregistrer' : 'connecter'))) }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
