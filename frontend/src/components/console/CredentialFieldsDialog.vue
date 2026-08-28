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
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { humanize } from '@/lib/errors'
import { payloadFor, relevantFields, secretPlaceholder } from '@/lib/credentialForm'
import DocSections from '@/components/console/DocSections.vue'
import type { CredentialField, DocSection, VerifyResult } from '@/types/api'

const props = defineProps<{
  open: boolean
  label: string
  fields: CredentialField[]
  single?: boolean
  // Le champ dont la VALEUR sélectionne les autres (`auth_mode` chez `http`) —
  // déclaré par le connecteur, jamais deviné ici. Vide = schéma plat, tous les
  // champs s'affichent (le cas des ~90 autres connecteurs).
  fieldDiscriminator?: string
  // Ce qui est DÉJÀ au coffre, pour pré-remplir : uniquement les champs révélables
  // (URL de base, mode d'auth, nom de header…). Un secret ne se relit jamais.
  initialValues?: Record<string, string>
  // Un credential existe-t-il déjà à ce palier ? Ça change le sens d'un champ secret
  // laissé vide : « je n'y touche pas » au lieu de « efface-le ».
  existing?: boolean
  // Multi-compte (#121) : 'new' ajoute un compte NOMMÉ à côté d'un existant (nom
  // obligatoire — le serveur refuse une seconde pose anonyme) ; 'fixed' repose sur
  // `account` sans le demander ; 'none' (défaut) = pose ordinaire, aucun champ.
  accountMode?: 'none' | 'new' | 'fixed'
  account?: string
  accountNoun?: string
  accountNames?: string[]
  // La doc « how-to » du connecteur, rendue DANS le dialogue. Elle vivait sur la
  // fiche de la bibliothèque, c'est-à-dire pas là où on colle : devant deux champs
  // « bot token / user token » et rien d'autre, on ne sait ni quoi créer chez le
  // fournisseur, ni avec quels droits. Seuls le prérequis et la mise en route sont
  // repris ; l'usage n'a rien à faire dans un formulaire.
  docs?: DocSection[]
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

// Valeur courante du champ discriminant — la seule dont dépend la composition du
// formulaire. On la suit à part plutôt que de lire tout `values` : `shown` et le
// schéma se construisent AVANT `useForm`, qui les consomme.
const picked = ref('')
const shown = computed(() => relevantFields(
  props.fields, props.fieldDiscriminator,
  props.fieldDiscriminator ? { [props.fieldDiscriminator]: picked.value } : {},
))

const schema = computed(() =>
  toTypedSchema(
    z.object(Object.fromEntries([
      ...shown.value.map((f) => [
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
      // il n'y a rien à enregistrer. ⚠️ Sur un credential qui EXISTE déjà, un
      // formulaire tout vide est légitime : les secrets restent au coffre et les
      // champs non secrets sont pré-remplis — c'est justement le geste « je ne
      // change qu'une URL ».
      (v) => props.existing
        || shown.value.some((f) => ((v as Record<string, string>)[f.name] ?? '').length > 0),
      { message: 'renseigne au moins un champ', path: [shown.value[0]?.name ?? ''] },
    ),
  ),
)

const { handleSubmit, isSubmitting, resetForm, values } = useForm({ validationSchema: schema })
watch(
  () => (values as Record<string, unknown>)[props.fieldDiscriminator ?? ''],
  (v) => { picked.value = typeof v === 'string' ? v : '' },
  { immediate: true },
)

// Les champs NON SECRETS partent pré-remplis avec ce qui est au coffre : c'est ce qui
// rend une correction possible sans tout resaisir. Un secret naît vide, toujours.
const blank = () => Object.fromEntries([
  ...props.fields.map((f) => [f.name, (!f.secret && props.initialValues?.[f.name]) || '']),
  ...(asksAccount.value ? [[ACCOUNT_KEY, '']] : []),
])
const testing = ref(false)
const testRes = ref<VerifyResult | null>(null)
// immediate : si le dialog est monté déjà ouvert, le watch transitionnel ne
// firait jamais → valeurs initiales absentes (champs undefined).
// Rejoue aussi quand les valeurs pré-remplies arrivent : le parent les charge en
// asynchrone (un aller-retour au serveur), souvent APRÈS l'ouverture du dialogue.
watch(() => [props.open, props.initialValues] as const,
      ([o]) => { if (o) { resetForm({ values: blank() }); testRes.value = null } },
      { immediate: true, deep: true })

const howto = computed(() =>
  (props.docs ?? []).filter((d) => d.kind === 'prerequisite' || d.kind === 'setup'))
const showHowto = ref(false)

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
  const fieldValues = payloadFor(shown.value, all, { existing: !!props.existing })
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

      <div v-if="howto.length" class="cfd-howto">
        <button type="button" class="cfd-toggle" @click="showHowto = !showHowto">
          {{ showHowto ? '▾' : '▸' }} où trouver ces identifiants ?
        </button>
        <DocSections v-if="showHowto" :sections="howto" />
      </div>

      <!-- Ce credential existe déjà : dire ce que le formulaire fait des vides, sinon
           l'utilisateur croit devoir retrouver un secret qu'aucune surface ne rend —
           c'est ce qui a fait renoncer à un repointage d'adresse. -->
      <p v-if="existing" class="cfd-note">
        les champs non secrets sont pré-remplis. laisse un champ secret vide pour le conserver tel quel.
      </p>

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

        <!-- `shown`, pas `fields` : le mode choisi décide de ce qui sert. Un
             formulaire `bearer` affiche 4 champs, pas les 12 du connecteur. -->
        <FormField v-for="f in shown" :key="f.name" v-slot="{ componentField }" :name="f.name">
          <FormItem>
            <FormLabel>{{ f.label.toLowerCase() }}<span v-if="f.required === false" class="dim"> · optionnel</span></FormLabel>
            <!-- Jeu FERMÉ de valeurs déclaré par le connecteur : un select, pas un
                 champ libre — une faute de frappe y était acceptée puis refusée au
                 premier appel réel. -->
            <Select v-if="f.choices?.length" v-bind="componentField">
              <FormControl>
                <SelectTrigger class="w-full"><SelectValue :placeholder="f.help || 'choisir'" /></SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem v-for="opt in f.choices" :key="opt" :value="opt">{{ opt }}</SelectItem>
              </SelectContent>
            </Select>
            <FormControl v-else>
              <Input
                :type="f.secret ? 'password' : 'text'"
                autocomplete="off"
                :placeholder="secretPlaceholder(f, !!existing) || (single ? `colle ta clé ${label}` : '')"
                v-bind="componentField"
              />
            </FormControl>
            <p v-if="f.choices?.length && f.help" class="cfd-hint">{{ f.help }}</p>
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

<style scoped>
.cfd-howto { border-top: 1px solid var(--color-hair-soft); padding-top: 10px; margin-top: 2px; }
.cfd-toggle {
  font: inherit; font-size: 11.5px; font-weight: 600; cursor: pointer;
  background: none; border: 0; padding: 0; color: var(--color-cobalt-ink);
}
.cfd-toggle:hover { text-decoration: underline; }
.cfd-note {
  margin: 0; font-size: 11.5px; line-height: 1.45; color: var(--color-mute);
  border-left: 2px solid var(--color-hair); padding-left: 9px;
}
.cfd-hint { margin: 2px 0 0; font-size: 11.5px; color: var(--color-faint); }
</style>
