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
import { getTokens, createToken, deleteToken, getMyOrgs,
         getNamespacesOfOrg, listProjectsOfOrg } from '@/api/console'
import { porteeDepuis, schemaLabel } from './tokenScope'
import type { ApiToken, Org, NamespaceEntry, Project } from '@/types/api'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'

// Tokens CLI/API = identité du compte (/api/me/tokens, user-scoped) → ils vivent
// dans le hub compte, pas dans les connecteurs (qui sont org-scopés).
const { toast } = useToast()
const { confirmAction } = usePrompt()

const tokens = ref<ApiToken[]>([])
const createOpen = ref(false)

// ── portée du jeton (oto-dashboard#161) ──
// ⚠️ Un jeton SANS portée a tous les droits de la personne dans l'org. C'est ce que
// cet écran émettait sans le dire : pour brancher UN tableau de dix lignes sur un
// service tiers, il ouvrait les 35 tableaux de l'org en écriture — viviers clients et
// comptabilité compris — et le secret est parti chez ce tiers (oto-backend#514).
// La précaution existait dans le modèle depuis le début ; aucune surface ne la posait.
const orgs = ref<Org[]>([])
const orgId = ref<number | null>(null)          // pose `X-Oto-Org` sur la création
const namespaces = ref<NamespaceEntry[]>([])
const projects = ref<Project[]>([])
const nsRights = ref<Record<string, 'read' | 'write'>>({})
const projRead = ref<Record<string, true>>({})
const chargePortee = ref(false)

// ⚠️ La construction vit dans `tokenScope.ts` et non ici : c'est l'endroit où l'écran
// peut mentir au backend (une portée vide au lieu d'aucune portée), et un `.vue` ne se
// teste pas à ce grain. Le composant CONSOMME la fonction éprouvée — la recopier ferait
// tester un double pendant que le défaut vivrait ici.
const porteeChoisie = () => porteeDepuis(nsRights.value, projRead.value)

// Les tableaux et projets DE L'ORG CHOISIE — rechargés à chaque changement, sinon on
// proposerait de borner un jeton sur des tableaux d'une autre org, que le backend
// refuserait (`unknown_namespace`) au moment de valider.
async function chargerPortee() {
  nsRights.value = {}; projRead.value = {}
  namespaces.value = []; projects.value = []
  if (!orgId.value) return
  chargePortee.value = true
  try {
    const [n, p] = await Promise.all([
      getNamespacesOfOrg(orgId.value).catch(() => ({ namespaces: [] })),
      listProjectsOfOrg(orgId.value).catch(() => ({ projects: [] })),
    ])
    namespaces.value = n.namespaces
    projects.value = p.projects
  } finally { chargePortee.value = false }
}
watch(orgId, chargerPortee)
const revealed = ref<string | null>(null)   // token en clair, montré UNE fois après création
const copied = ref(false)

async function reload() {
  tokens.value = (await getTokens().catch(() => ({ tokens: [] }))).tokens
}

// ── création (form validé) ──
const schema = toTypedSchema(
  z.object({
    // La borne du BACKEND (32, `label_too_long`), partagée avec son banc. Le formulaire
    // acceptait 40 et faisait donc rejeter une saisie qu'il venait de valider : une
    // borne de formulaire plus LARGE que celle du serveur ne protège de rien, elle
    // déplace le refus après l'envoi, là où il n'aide plus à corriger.
    label: schemaLabel,
    ttl_days: z.coerce.number().int().positive().optional(),
  }),
)
const { handleSubmit, isSubmitting, resetForm } = useForm({
  validationSchema: schema,
  initialValues: { label: 'cli' },
})
watch(createOpen, (o) => { if (o) resetForm({ values: { label: 'cli' } }) })

const submitCreate = handleSubmit(async ({ label, ttl_days }) => {
  try {
    const { token } = await createToken(label, {
      scopes: porteeChoisie(), ttl_days, orgId: orgId.value,
    })
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
  if (!await confirmAction({ title: 'revoke token', danger: true, confirmLabel: 'Revoke', message: `revoke "${t.label}"?` })) return
  try { await deleteToken(t.id); toast('token revoked'); await reload() } catch (e) { toast(humanize(e)) }
}

onMounted(async () => {
  await reload()
  orgs.value = (await getMyOrgs().catch(() => ({ orgs: [] }))).orgs
  // Pas de présélection : choisir l'org est le geste qui décide OÙ naît le jeton, et
  // il ne doit pas être fait à la place de la personne. Sans choix, l'appel part sans
  // `X-Oto-Org` — donc dans l'org maison, ce que le backend fait déjà aujourd'hui.
})
</script>

<template>
  <ConsoleCard id="tokens" title="cli & api tokens" flush
    sub="long-lived tokens for the oto cli and ci environments.">
    <template #actions><Btn kind="mini" icon="plus" @click="createOpen = true">New token</Btn></template>
    <table class="tbl">
      <thead><tr><th>label</th><th>portée</th><th>expire</th><th>created</th><th>last used</th><th style="width: 80px"></th></tr></thead>
      <tbody>
        <tr v-for="t in tokens" :key="t.id">
          <td style="font-weight: 600; color: var(--color-ink)">{{ t.label }}</td>
          <!-- ⚠️ Un jeton sans portée ouvre TOUTE l'organisation : c'est le fait que
               cet écran taisait, et qui a fait partir 35 tableaux chez un tiers. Il se
               lit d'un coup d'œil dans la liste, pas seulement à la création. -->
          <td>
            <span v-if="!t.scopes" class="tout-org">toute l'org</span>
            <span v-else class="dim">{{ Object.keys((t.scopes as any).namespaces ?? {}).length }} tableau(x),
              {{ Object.keys((t.scopes as any).projects ?? {}).length }} projet(s)</span>
          </td>
          <td class="dim">{{ fmtDate(t.expires_at) ?? 'jamais' }}</td>
          <td class="dim">{{ fmtDate(t.created_at) }}</td>
          <td class="dim">{{ fmtDate(t.last_used_at) ?? 'never' }}</td>
          <td style="text-align: right"><Btn kind="danger" @click="revokeToken(t)">Revoke</Btn></td>
        </tr>
        <tr v-if="!tokens.length"><td colspan="6" class="dim" style="text-align: center; padding: 16px">no tokens yet</td></tr>
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

          <!-- L'ORG décide où naît le jeton : elle pose `X-Oto-Org` sur la création,
               et c'est elle qui détermine quels tableaux sont proposés en dessous. -->
          <div class="grid gap-1">
            <label class="lbl" for="tok-org">organisation</label>
            <select id="tok-org" v-model="orgId" class="sel">
              <option :value="null">mon espace personnel</option>
              <option v-for="o in orgs" :key="o.id" :value="o.id">{{ o.name }}</option>
            </select>
          </div>

          <div v-if="orgId" class="grid gap-1">
            <label class="lbl">portée</label>
            <p v-if="chargePortee" class="dim">chargement…</p>
            <template v-else>
              <p v-if="!namespaces.length && !projects.length" class="dim">
                aucun tableau ni projet dans cette organisation.
              </p>
              <div v-else class="portee">
                <div v-for="n in namespaces" :key="n.namespace" class="ligne">
                  <span class="nom">{{ n.namespace }}</span>
                  <select v-model="nsRights[n.namespace]" class="sel mini">
                    <option :value="undefined">—</option>
                    <option value="read">lecture</option>
                    <option value="write">écriture</option>
                  </select>
                </div>
                <div v-for="p in projects" :key="p.id" class="ligne">
                  <span class="nom">{{ p.name }}</span>
                  <label class="dim"><input type="checkbox"
                    :checked="!!projRead[String(p.id)]"
                    @change="(e: Event) => (e.target as HTMLInputElement).checked
                      ? (projRead[String(p.id)] = true) : delete projRead[String(p.id)]" />
                    lecture</label>
                </div>
              </div>
            </template>
            <!-- ⚠️ Dit AVANT de créer, pas après : c'est le moment où la personne peut
                 encore choisir autrement. Le mot exact du backend, pas un euphémisme. -->
            <p v-if="!porteeChoisie()" class="avert">
              rien de coché ⇒ ce jeton aura <strong>tous tes droits</strong> dans cette
              organisation. Coche ce dont l'intégration a besoin, et rien de plus.
            </p>
          </div>

          <FormField v-slot="{ componentField }" name="ttl_days">
            <FormItem>
              <FormLabel>expire après (jours)</FormLabel>
              <FormControl>
                <Input type="number" min="1" placeholder="laisser vide = jamais"
                       autocomplete="off" v-bind="componentField" />
              </FormControl>
              <FormDescription>
                vide ⇒ le jeton n'expire pas, et rien ne te le rappellera ensuite.
              </FormDescription>
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

<style scoped>
.lbl { font-size: 12px; font-weight: 600; color: var(--color-ink); }
.sel { border: 1px solid var(--color-line); border-radius: 6px; padding: 6px 8px; font-size: 13px; background: var(--color-bg); }
.sel.mini { padding: 2px 6px; font-size: 12px; }
.portee { display: grid; gap: 4px; max-height: 180px; overflow-y: auto; padding: 6px;
          border: 1px solid var(--color-line); border-radius: 6px; }
.ligne { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.nom { font-size: 12px; font-family: ui-monospace, monospace; }
.tout-org { font-size: 12px; font-weight: 600; color: var(--color-danger, #b42318); }
.avert { font-size: 12px; color: var(--color-danger, #b42318); }
</style>
