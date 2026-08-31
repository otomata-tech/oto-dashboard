<script setup lang="ts">
// Modale PARTAGER d'un projet (refonte UX, ADR 0032) — un seul endroit à 4 sections :
// Équipe (membres/org, absorbe SharePrincipalDialog) · Lien public navigable (mode `secret`,
// URL secrète non devinable) · Endpoint MCP (publish) · Transférer la propriété. Absorbe l'ancienne carte
// « Endpoint MCP & partage » + le bouton Transférer. Réutilise le câblage existant.
import { computed, ref, watch } from 'vue'
import Icon from '@/components/console/Icon.vue'
import Btn from '@/components/console/Btn.vue'
import Tag from '@/components/console/Tag.vue'
import OtoSelect from '@/components/console/OtoSelect.vue'
import ModalOverlay from '@/components/console/ModalOverlay.vue'
import ProjectMcpPublishDialog from './ProjectMcpPublishDialog.vue'
import ProjectExposureStatus from './ProjectExposureStatus.vue'
import { projectVisibility, projectOwnerLabel } from '@/lib/projectVisibility'
import { linkedTablesOf } from '@/lib/projectExposure'
import {
  getMyOrgs, getOrg, listGroups, shareResource, unshareResource,
  publishProjectMcp, unpublishProjectMcp,
} from '@/api/console'
import type { GroupListItem, NamespaceShare, Org, OrgMember, SharePrincipal, Project } from '@/types/api'
import { humanize } from '@/lib/errors'
import { slugify } from '@/lib/slug'
import { ROLE_OPTIONS, roleLabel, roleTone, type ResourceRole } from '@/lib/resourceRole'
import { useToast } from '@/composables/useToast'
import { useMe } from '@/composables/useMe'
import { usePrompt } from '@/composables/usePrompt'
import { useTransferOwnership } from '@/composables/useTransferOwnership'

const props = defineProps<{ open: boolean; project: Project; grants: NamespaceShare[]; readOnly?: boolean }>()
const emit = defineEmits<{ close: []; changed: []; 'reload-project': [] }>()

const { toast } = useToast()
const { me } = useMe()
const { confirmAction } = usePrompt()
const { transfer: runTransfer } = useTransferOwnership()

const projectId = computed(() => props.project.id)

// ── Détenteur actuel (ADR 0030/0049) : la propriété est une ENTITÉ (toi / une org /
// une équipe / la bibliothèque), et c'est d'elle que découle QUI VOIT. On le résout
// depuis les listes déjà chargées (loadPickers) + l'identité courante. Répond au flou
// « ce projet appartient à qui ? » — l'axe DÉTENIR, distinct des partages (axe PRÊTER).
// Même formulation que la pastille de la page projet et de la liste (source unique
// `projectVisibility`) : celui qui vient vérifier « qui voit ça ? » doit retrouver
// MOT POUR MOT la réponse qu'il a déjà lue, avant le détail de détention/prêts.
const visibility = computed(() => projectVisibility(props.project, {
  orgName: me.value?.active_org_name,
  sharedCount: props.grants.length,
}))

const ownerLabel = computed(() => projectOwnerLabel(props.project, {
  mySub: me.value?.sub,
  myOrgId: me.value?.active_org,
  myOrgName: me.value?.active_org_name,
  orgs: myOrgs.value,
  groups: groups.value,
}))

// ── Équipe (principals) ──
type Mode = 'member' | 'team' | 'org' | 'email'
const mode = ref<Mode>('member')
const role = ref<ResourceRole>('editor')
const memberSub = ref(''); const groupId = ref(''); const orgId = ref(''); const email = ref('')
const members = ref<OrgMember[]>([]); const groups = ref<GroupListItem[]>([]); const myOrgs = ref<Org[]>([])
const busy = ref(false)

// Options des selects (DS OtoSelect) — dérivées des listes chargées.
const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: 'member', label: "membre de l'org" },
  { value: 'team', label: 'équipe' },
  { value: 'org', label: 'une de mes orgs' },
  { value: 'email', label: 'email libre' },
]
const memberOpts = computed(() => members.value.map((m) => ({ value: m.sub, label: m.name || m.email || m.sub })))
const teamOpts = computed(() => groups.value.map((g) => ({ value: String(g.group_id), label: g.name })))
const orgOpts = computed(() => myOrgs.value.map((o) => ({ value: String(o.id), label: o.name })))

async function loadPickers() {
  const org = me.value?.active_org
  const [m, g, o] = await Promise.all([
    org != null ? getOrg(org).then((d) => d.members ?? []).catch(() => []) : Promise.resolve([]),
    org != null ? listGroups(org).then((d) => d.groups).catch(() => []) : Promise.resolve([]),
    getMyOrgs().then((d) => d.orgs).catch(() => []),
  ])
  members.value = m.filter((x) => x.sub !== me.value?.sub && !!x.email)
  groups.value = g
  myOrgs.value = o.filter((x) => x.id !== org)
}
watch(() => props.open, (o) => {
  if (!o) return
  mode.value = 'member'; role.value = 'editor'
  memberSub.value = ''; groupId.value = ''; orgId.value = ''; email.value = ''
  void loadPickers()
})

const principal = computed<SharePrincipal | null>(() => {
  if (mode.value === 'member') { const m = members.value.find((x) => x.sub === memberSub.value); return m?.email ? { email: m.email } : null }
  if (mode.value === 'team') return groupId.value ? { group_id: Number(groupId.value) } : null
  if (mode.value === 'org') return orgId.value ? { org_id: Number(orgId.value) } : null
  const e = email.value.trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? { email: e } : null
})
async function addPrincipal() {
  if (!principal.value || busy.value) return
  busy.value = true
  try {
    await shareResource('project', String(projectId.value), principal.value, role.value)
    toast('partagé'); memberSub.value = ''; groupId.value = ''; orgId.value = ''; email.value = ''
    emit('changed')
  } catch (e) { toast(humanize(e)) }
  finally { busy.value = false }
}
function principalOf(g: NamespaceShare): SharePrincipal | null {
  if (g.principal_type === 'group') return { group_id: Number(g.principal_id) }
  if (g.principal_type === 'org') return { org_id: Number(g.principal_id) }
  return g.email ? { email: g.email } : null
}
async function revoke(g: NamespaceShare) {
  const p = principalOf(g)
  if (!p) return
  try { await unshareResource('project', String(projectId.value), p); toast('accès retiré'); emit('changed') }
  catch (e) { toast(humanize(e)) }
}
function initials(g: NamespaceShare): string {
  const s = g.label || g.email || String(g.principal_id || '?')
  return s.replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?'
}

// ── Lien public navigable (= accès `secret`, URL non devinable) ──
const shareUrl = computed(() =>
  props.project.mcp_access === 'secret' && props.project.mcp_slug
    ? `https://${props.project.mcp_slug}.share.oto.cx` : null)
async function copyShareUrl() { if (shareUrl.value) { await navigator.clipboard.writeText(shareUrl.value).catch(() => {}); toast('lien copié') } }

// ── Endpoint MCP ──
const mcpBusy = ref(false)
const mcpConnectUrl = computed(() =>
  shareUrl.value ? `${shareUrl.value}/mcp` : (props.project.mcp_url ?? null))
const mcpActive = computed(() => !!props.project.mcp_access && props.project.mcp_access !== 'off')
const mcpAccess = computed(() => props.project.mcp_access)
async function copyMcp() { if (mcpConnectUrl.value) { await navigator.clipboard.writeText(mcpConnectUrl.value).catch(() => {}); toast('URL copiée') } }
// Défaut de sous-domaine : `slugify(org)-slugify(projet)` (marque l'org, unique par
// projet) — évite d'imposer un slug vide « requis » que l'utilisateur doit inventer.
function defaultSlug(): string {
  return [slugify(me.value?.active_org_name, { maxLen: 24 }), slugify(props.project.name, { maxLen: 24 })]
    .filter(Boolean).join('-')
}
// DEUX intentions distinctes (R1) :
// - « Partager par lien public » = UN CLIC (accès figé `secret`, sous-domaine auto non
//   devinable, TOUT navigable en lecture seule). Pas de sélection d'outils : c'est un
//   instantané navigable, pas un endpoint MCP — le prompt d'outils n'avait aucun sens ici
//   (retour JB). La curation d'outils vit dans « Publier en endpoint MCP » ci-dessous.
// - « Publier en endpoint MCP » / « Reconfigurer » = dialog dédié `ProjectMcpPublishDialog`
//   (slug + accès + PICKER d'outils à cases groupées par connecteur, R3).
async function publishPublicLink() {
  if (mcpBusy.value) return
  // slug vide → slug secret généré ; outils vides → tout navigable ; exposition fermée par
  // défaut (opt-in explicite ensuite, cf. bloc « Pages du projet » / « Datastore » ci-dessous).
  await doPublish('secret', '', [])
}

// Endpoint MCP complet (dialog dédié, R3) — l'exposition (pages/tableaux) s'y règle
// désormais AU MOMENT de publier (issue #131), plutôt que de rester invisible jusqu'à
// republier depuis cet écran.
const endpointOpen = ref(false)
async function onEndpointPublish(v: {
  slug: string; access: 'anonymous' | 'secret' | 'org'; tools: string[]
  exposeDocs: boolean; exposeDatastore: boolean; exposeDatastoreWrite: boolean
}) {
  if (!v.tools.length && v.access !== 'secret') {
    toast('liste d’outils requise pour un endpoint public ou org — seuls les liens « secret » peuvent tout exposer en lecture seule')
    return
  }
  endpointOpen.value = false
  await doPublish(v.access, v.slug, v.tools, { docs: v.exposeDocs, datastore: v.exposeDatastore, datastoreWrite: v.exposeDatastoreWrite })
}

// Pose la publication (partagée entre lien public et endpoint) + retours. `expose` absent
// (lien public un clic) → tout fermé par défaut, à ouvrir ensuite explicitement.
async function doPublish(
  access: 'anonymous' | 'secret' | 'org', slug: string, tools: string[],
  expose?: { docs: boolean; datastore: boolean; datastoreWrite: boolean },
) {
  mcpBusy.value = true
  try {
    const updated = await publishProjectMcp(projectId.value, {
      mcp_slug: slug, mcp_access: access, mcp_tools: tools,
      mcp_expose_docs: expose?.docs ?? false,
      mcp_expose_datastore: expose?.datastore ?? false,
      mcp_expose_datastore_write: expose?.datastoreWrite ?? false,
    })
    const unresolvable = updated.mcp_unresolvable_tools ?? []
    toast(unresolvable.length ? `endpoint publié — ${unresolvable.length} outil(s) non résoluble(s) sans login : ${unresolvable.join(', ')}` : 'endpoint MCP publié')
    emit('reload-project')
  } catch (e) { toast(humanize(e)) }
  finally { mcpBusy.value = false }
}
async function unpublishMcp() {
  if (!await confirmAction({ title: 'Retirer l’endpoint MCP', message: 'Le sous-domaine deviendra immédiatement inaccessible. Continuer ?', confirmLabel: 'Retirer', danger: true })) return
  mcpBusy.value = true
  try { await unpublishProjectMcp(projectId.value); toast('endpoint MCP retiré'); emit('reload-project') }
  catch (e) { toast(humanize(e)) }
  finally { mcpBusy.value = false }
}

// ── Datastore exposé sur l'endpoint partagé (#193) ──
// État EFFECTIF dérivé du backend (flag lecture + opt-in écriture). Réservé à `secret` :
// un endpoint public/org n'expose jamais le datastore ainsi.
const dsSecret = computed(() => mcpAccess.value === 'secret')
const dsExposed = computed(() => dsSecret.value && !!props.project.mcp_expose_datastore)
const dsWritable = computed(() => dsExposed.value && !!props.project.mcp_expose_datastore_write)
// Legacy : des `data_*` dans l'allowlist figée = exposition posée par une ancienne UI
// (avant le flag) → à normaliser (retirer les data_* de la liste, s'appuyer sur le flag).
const dsLegacy = computed(() => (props.project.mcp_tools ?? []).some((t) => t.startsWith('data_')))
// Tableaux RÉELLEMENT liés au projet — pour ne pas promettre « les tableaux liés à ce
// projet » quand il n'y en a aucun (retour JB : la copy datastore s'affichait sans tableau).
const linkedTables = computed(() => linkedTablesOf(props.project))

// ── Pages du projet lisibles par l'invité (#310) ──
// Opt-in SÉPARÉ du datastore : les pages portent typiquement des notes internes
// (arbitrages, contacts, gotchas), donc jamais exposées par défaut.
const docsExposed = computed(() => dsSecret.value && !!props.project.mcp_expose_docs)

// ── Ce que l'invité lit en se branchant (#309) ──
// ≠ le brief du projet, qui reste interne. Sans ça, l'agent de l'invité se branche
// sans savoir ce que le projet contient ni comment le lire.
const guideDraft = ref(props.project.mcp_instructions_md ?? '')
const guideDirty = computed(() => guideDraft.value !== (props.project.mcp_instructions_md ?? ''))
watch(() => props.project.mcp_instructions_md, (v) => { guideDraft.value = v ?? '' })

// Republication ciblée : conserve slug/tools/flags, ne change QUE ce qu'on lui passe.
async function republish(changes: Partial<{ mcp_expose_datastore: boolean; mcp_expose_datastore_write: boolean; mcp_expose_docs: boolean; mcp_instructions_md: string }>, done: string) {
  if (mcpBusy.value || !dsSecret.value) return
  mcpBusy.value = true
  try {
    await publishProjectMcp(projectId.value, {
      mcp_slug: props.project.mcp_slug ?? '', mcp_access: 'secret',
      mcp_tools: props.project.mcp_tools ?? [],
      mcp_expose_datastore: dsExposed.value, mcp_expose_datastore_write: dsWritable.value,
      mcp_expose_docs: docsExposed.value,
      ...changes,
    })
    toast(done)
    emit('reload-project')
  } catch (e) { toast(humanize(e)) }
  finally { mcpBusy.value = false }
}

async function setDatastore(expose: boolean, write: boolean) {
  await republish({ mcp_expose_datastore: expose, mcp_expose_datastore_write: write },
    expose ? (write ? 'datastore : lecture + écriture' : 'datastore exposé en lecture') : 'datastore fermé')
}

async function setDocs(expose: boolean) {
  await republish({ mcp_expose_docs: expose },
    expose ? 'pages du projet lisibles par les invités' : 'pages refermées')
}

async function saveGuide() {
  await republish({ mcp_instructions_md: guideDraft.value },
    guideDraft.value.trim() ? 'mode d’emploi enregistré' : 'mode d’emploi retiré')
}
// Normalise un endpoint legacy : retire les data_* de la liste d'outils, expose via le
// flag. Une liste résultante VIDE est OK en `secret` (= tout navigable, lecture seule).
async function normalizeLegacy() {
  if (mcpBusy.value || !dsSecret.value) return
  const tools = (props.project.mcp_tools ?? []).filter((t) => !t.startsWith('data_'))
  mcpBusy.value = true
  try {
    await publishProjectMcp(projectId.value, {
      mcp_slug: props.project.mcp_slug ?? '', mcp_access: 'secret', mcp_tools: tools,
      mcp_expose_datastore: true, mcp_expose_datastore_write: dsWritable.value,
      mcp_expose_docs: docsExposed.value,
    })
    toast('exposition normalisée — datastore piloté par le réglage dédié')
    emit('reload-project')
  } catch (e) { toast(humanize(e)) }
  finally { mcpBusy.value = false }
}

// ── Changer de détenteur ── (flux + garde-fou anti-lockout centralisés dans le composable)
async function transfer() {
  try {
    const ok = await runTransfer('project', projectId.value, props.project.name || `projet #${projectId.value}`, { allowTeams: true })
    if (ok) { toast('transféré'); emit('reload-project'); emit('changed'); emit('close') }
  } catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <ModalOverlay :open="open" @close="emit('close')">
      <div class="sd" role="dialog" aria-modal="true" aria-label="partager">
        <header class="sd__hd">
          <span class="sd__hdic"><Icon name="users" :size="17" /></span>
          <strong class="sd__hdl">Partager « {{ project.name }} »</strong>
          <button class="sd__close" aria-label="fermer" @click="emit('close')"><Icon name="x" :size="16" /></button>
        </header>
        <div class="sd__body">
          <!-- Qui voit ? (audience) — la réponse d'abord, en clair et dans les mêmes
               mots que la page projet ; le détail de détention/prêts suit. -->
          <div class="sd__vis" :class="{ 'sd__vis--private': visibility.isPrivate }">
            <Icon :name="visibility.isPrivate ? 'shield' : 'users'" :size="15" />
            <strong>{{ visibility.label }}</strong>
            <span>{{ visibility.detail }}</span>
          </div>

          <!-- Détenteur (axe DÉTENIR) : qui possède ⇒ qui voit. Le changement de détenteur
               vit ICI, à côté de la réponse qu'il modifie — pas dans une section « transférer »
               reléguée en bas, séparée de la question qu'elle règle. -->
          <div class="sd__owner">
            <Icon name="circle-user" :size="15" />
            <span>Détenu par <strong>{{ ownerLabel }}</strong></span>
            <Tag v-if="grants.length" tone="cobalt">{{ grants.length }} prêt{{ grants.length > 1 ? 's' : '' }}</Tag>
            <Btn v-if="!readOnly" kind="mini" class="sd__ownerbtn" @click="transfer">Changer</Btn>
          </div>
          <p v-if="!readOnly" class="sd__desc sd__ownernote">
            Changer de détenteur change l’audience : toi seul, une personne, une équipe ou toute
            une org. Le détenteur précédent garde un accès édition. Si tu cèdes hors de ta portée,
            une confirmation te préviendra que tu ne pourras plus le récupérer seul.
          </p>

          <!-- Prêts (axe ADDITIF) -->
          <section>
            <div class="sd__sec"><Icon name="users" :size="16" /><span>Et en plus, ces personnes y ont accès</span></div>
            <p class="sd__desc">Un prêt <em>ajoute</em> un accès sans changer le détenteur : <strong>lecteur</strong> (lit) · <strong>éditeur</strong> (modifie) · <strong>gérant</strong> (peut re-partager).</p>
            <div v-if="grants.length" class="sd__grants">
              <div v-for="g in grants" :key="(g.principal_type || 'user') + (g.principal_id || g.email || '')" class="sd__grant">
                <span class="sd__av">{{ initials(g) }}</span>
                <span class="sd__gname">{{ g.label || g.email || g.principal_id }}</span>
                <Tag v-if="g.principal_type === 'group'" tone="saffron">équipe</Tag>
                <Tag v-else-if="g.principal_type === 'org'" tone="terra">org</Tag>
                <Tag :tone="roleTone(g.role, g.permission)">{{ roleLabel(g.role, g.permission) }}</Tag>
                <button v-if="!readOnly && principalOf(g)" class="sd__rev" title="Retirer l'accès" @click="revoke(g)"><Icon name="x" :size="13" /></button>
              </div>
            </div>
            <div v-if="!readOnly" class="sd__add">
              <OtoSelect v-model="mode" :options="MODE_OPTIONS" aria-label="type de destinataire" />
              <OtoSelect v-if="mode === 'member'" v-model="memberSub" :options="memberOpts" grow placeholder="choisir un membre…" />
              <OtoSelect v-else-if="mode === 'team'" v-model="groupId" :options="teamOpts" grow placeholder="choisir une équipe…" />
              <OtoSelect v-else-if="mode === 'org'" v-model="orgId" :options="orgOpts" grow placeholder="choisir une org…" />
              <input v-else v-model="email" class="sd__in sd__grow" type="email" placeholder="collègue@exemple.com" @keyup.enter="addPrincipal" />
              <OtoSelect v-model="role" :options="ROLE_OPTIONS" aria-label="rôle" />
              <Btn kind="mini" icon="plus" :disabled="busy || !principal" @click="addPrincipal">Inviter</Btn>
            </div>
            <p v-else class="dim sd__ro">Tu es en lecture seule — gestion réservée au propriétaire.</p>
          </section>

          <div class="sd__hr"></div>

          <!-- Lien public navigable (accès « secret ») -->
          <section>
            <div class="sd__sec"><Icon name="ext" :size="16" /><span>Lien public · navigable</span><Tag v-if="shareUrl" tone="olive">actif</Tag></div>
            <p class="sd__desc">Un instantané lecture seule (brief + pages), navigable via une URL secrète non devinable.</p>
            <div v-if="shareUrl" class="sd__linkrow">
              <input class="sd__url" :value="shareUrl" readonly @focus="($event.target as HTMLInputElement).select()" />
              <Btn kind="mini" icon="copy" @click="copyShareUrl">Copier</Btn>
            </div>
            <Btn v-else-if="!readOnly" kind="mini" icon="external-link" @click="publishPublicLink()">Partager par lien public</Btn>

            <!-- Ce que verra le destinataire (issue #131) : pages puis tableaux — visible dès
                 que le lien « secret » est actif, quel que soit le chemin qui l'a créé (un
                 clic ou l'endpoint MCP ci-dessous), pour que l'opt-in ne reste jamais invisible
                 une fois publié. -->
            <div v-if="dsSecret" class="sd__exposure">
              <ProjectExposureStatus
                :docs-exposed="docsExposed" :ds-exposed="dsExposed" :ds-writable="dsWritable" :ds-legacy="dsLegacy"
                :table-count="linkedTables.length" :read-only="readOnly" :busy="mcpBusy"
                @set-docs="setDocs" @set-datastore="(v) => setDatastore(v.expose, v.write)" @normalize-legacy="normalizeLegacy" />
            </div>
          </section>

          <div class="sd__hr"></div>

          <!-- Endpoint MCP -->
          <section>
            <div class="sd__sec"><Icon name="plug" :size="16" /><span>Endpoint MCP</span>
              <Tag v-if="mcpAccess === 'anonymous'" tone="olive">public · sans login</Tag>
              <Tag v-else-if="mcpAccess === 'secret'" tone="cobalt">secret · navigable</Tag>
              <Tag v-else-if="mcpAccess === 'org'" tone="saffron">org · authentifié</Tag>
            </div>
            <p class="sd__desc">Publie ce projet comme serveur MCP dédié à brancher dans Claude — sans compte Oto.</p>
            <template v-if="mcpActive && mcpConnectUrl">
              <div class="sd__linkrow">
                <input class="sd__url" :value="mcpConnectUrl" readonly @focus="($event.target as HTMLInputElement).select()" />
                <Btn kind="mini" icon="copy" @click="copyMcp">Copier</Btn>
              </div>
              <p v-if="project.mcp_tools?.length" class="sd__tools">{{ project.mcp_tools.length }} outil(s) : {{ project.mcp_tools.join(', ') }}</p>
              <p v-else class="sd__tools">aucun outil dédié — tout le projet visible, lecture seule</p>

              <!-- Mode d'emploi servi à l'invité au branchement (#309) -->
              <div v-if="dsSecret" class="sd__ds">
                <div class="sd__dsrow">
                  <Icon name="book" :size="14" />
                  <span class="sd__dslbl">Ce que l’invité lit en se branchant</span>
                  <Tag v-if="project.mcp_instructions_md" tone="olive">écrit</Tag>
                  <Tag v-else tone="terra">vide</Tag>
                </div>
                <p class="sd__desc">
                  Le premier message que reçoit son agent : ce que contient ce projet et comment le lire.
                  <strong>Ce n’est pas le brief du projet</strong>, qui reste chez toi — écris ici ce que tu
                  assumes de montrer. Sans rien, il se branche sans savoir quoi faire.
                </p>
                <textarea v-model="guideDraft" class="sd__area" rows="4" :disabled="readOnly || mcpBusy"
                  placeholder="ex. Ce vivier liste les entreprises dont l’accord santé/prévoyance n’a pas bougé depuis 24 mois. Une ligne = une entreprise ; `statut` dit où elle en est."></textarea>
                <div v-if="!readOnly" class="sd__mcpact">
                  <Btn kind="mini" icon="check" :disabled="mcpBusy || !guideDirty" @click="saveGuide">Enregistrer</Btn>
                </div>
              </div>

              <div v-if="!readOnly" class="sd__mcpact">
                <Btn kind="mini" :disabled="mcpBusy" @click="endpointOpen = true">Reconfigurer</Btn>
                <Btn kind="danger" :disabled="mcpBusy" @click="unpublishMcp">Retirer</Btn>
              </div>
            </template>
            <Btn v-else-if="!readOnly" kind="mini" icon="plug" :disabled="mcpBusy" @click="endpointOpen = true">Publier en endpoint MCP</Btn>
          </section>

        </div>
      </div>
  </ModalOverlay>

  <!-- Endpoint MCP : formulaire dédié avec picker d'outils à cases (R3) -->
  <ProjectMcpPublishDialog :open="endpointOpen" :project="project" :default-slug="defaultSlug()"
    @close="endpointOpen = false" @publish="onEndpointPublish" />
</template>

<style scoped>
.sd { width: min(540px, 100%); max-height: 86vh; overflow-y: auto; background: var(--color-surface); border: 1px solid var(--border-card); border-radius: var(--radius-md); box-shadow: var(--shadow-pop); }
.sd__hd { position: sticky; top: 0; display: flex; align-items: center; gap: 9px; padding: 10px 16px; border-bottom: 1px solid var(--color-hair); background: var(--color-saffron-soft); z-index: 1; }
.sd__hdic { display: inline-flex; color: var(--color-saffron-ink); }
.sd__hdl { font-size: 14px; font-weight: 700; color: var(--color-saffron-ink); }
.sd__close { margin-left: auto; height: 30px; width: 30px; display: inline-flex; align-items: center; justify-content: center; border: 0; background: transparent; border-radius: var(--radius-pill); color: var(--color-mute); cursor: pointer; }
.sd__close:hover { background: var(--color-paper-2); color: var(--color-ink); }
.sd__body { padding: 18px 20px; display: flex; flex-direction: column; gap: 18px; }
.sd__hr { height: 1px; background: var(--color-hair-soft); }
.sd__sec { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; font-size: 14.5px; font-weight: 700; letter-spacing: -.01em; color: var(--color-saffron-ink); }
.sd__sec :deep(svg) { color: color-mix(in srgb, var(--color-saffron) 55%, var(--color-saffron-ink)); flex: none; }
.sd__desc { margin: 0 0 10px; font-size: 11.5px; line-height: 1.5; color: var(--color-faint); }
/* bandeau d'audience : la réponse à « qui voit ? », en tête de la modale */
.sd__vis {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px;
  padding: 10px 12px; border: 1px solid var(--color-hair); border-radius: var(--radius-md);
  background: var(--color-surface); font-size: 12.5px; color: var(--color-ink-soft);
}
.sd__vis strong { color: var(--color-ink); }
.sd__vis :deep(svg) { color: var(--color-mute); flex: none; }
.sd__vis--private {
  background: var(--color-olive-soft); border-color: transparent; color: var(--color-olive-ink);
}
.sd__vis--private strong, .sd__vis--private :deep(svg) { color: var(--color-olive-ink); }
.sd__owner { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 9px 12px; border: 1px solid var(--color-hair); border-radius: var(--radius-md); background: var(--color-paper-2); font-size: 12.5px; color: var(--color-ink-soft); }
.sd__owner :deep(svg) { color: var(--color-mute); flex: none; }
.sd__ownerbtn { margin-left: auto; }
.sd__ownernote { margin: -4px 0 0; }
.sd__grants { display: flex; flex-direction: column; margin-bottom: 10px; }
.sd__grant { display: flex; align-items: center; gap: 9px; padding: 8px 0; border-bottom: 1px solid var(--color-hair-soft); }
.sd__av { width: 28px; height: 28px; border-radius: var(--radius-pill); flex: none; display: grid; place-items: center; background: var(--color-paper-2); border: 1px solid var(--color-hair); font-size: 10.5px; font-weight: 700; color: var(--color-ink-soft); }
.sd__gname { flex: 1; min-width: 0; font-size: 13px; color: var(--color-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sd__rev { border: 0; background: transparent; cursor: pointer; color: var(--color-mute); display: inline-flex; padding: 2px; border-radius: var(--radius-pill); }
.sd__rev:hover { color: var(--color-terra-ink); background: var(--color-terra-soft); }
.sd__add { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.sd__in { border: 1px solid var(--color-hair); border-radius: var(--radius-md); padding: 8px 11px; font-family: var(--font-sans); font-size: 13px; color: var(--color-ink); background: var(--color-surface); }
.sd__grow { flex: 1; min-width: 150px; }
.sd__ro { font-size: 11.5px; margin: 6px 0 0; }
.sd__linkrow { display: flex; align-items: center; gap: 7px; }
.sd__exposure { margin-top: 12px; display: flex; flex-direction: column; gap: 12px; }
.sd__url { flex: 1; min-width: 0; border: 1px solid var(--color-hair); border-radius: var(--radius-md); padding: 7px 10px; font-family: var(--font-mono); font-size: 10.5px; color: var(--color-ink-soft); background: var(--color-paper-2); }
.sd__tools { font-family: var(--font-mono); font-size: 10px; color: var(--color-faint); line-height: 1.5; margin: 7px 0 0; }
.sd__mcpact { display: flex; gap: 7px; margin-top: 9px; flex-wrap: wrap; }
.sd__ds { margin-top: 12px; padding: 11px 12px; border: 1px solid var(--color-hair); border-radius: var(--radius-md); background: var(--color-paper-2); }
.sd__dsrow { display: flex; align-items: center; gap: 7px; }
.sd__dsrow :deep(svg) { color: var(--color-mute); flex: none; }
.sd__dslbl { font-size: 12.5px; font-weight: 700; color: var(--color-ink-soft); margin-right: 2px; }
.sd__ds .sd__desc { margin: 7px 0 0; }
.sd__area { width: 100%; margin-top: 9px; border: 1px solid var(--color-hair); border-radius: var(--radius-md); padding: 9px 11px; font-family: var(--font-sans); font-size: 12.5px; line-height: 1.55; color: var(--color-ink-soft); background: var(--color-surface); resize: vertical; box-sizing: border-box; }
.sd__area:disabled { opacity: .6; }
.sd__dswarn { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-top: 9px; padding: 8px 10px; border-radius: var(--radius-md); background: var(--color-saffron-soft); font-size: 11px; line-height: 1.45; color: var(--color-saffron-ink); }
.sd__dswarn :deep(svg) { color: var(--color-saffron-ink); flex: none; }
.sd__dswarn code { font-family: var(--font-mono); font-size: 10px; }
</style>
