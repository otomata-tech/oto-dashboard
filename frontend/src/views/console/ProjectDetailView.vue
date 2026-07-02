<script setup lang="ts">
// Page DÉDIÉE d'un projet — `/projects/:id` (objet de premier rang, ADR 0030 ; pas
// un volet de liste). Charge un seul projet par id de route, remonté par le layout
// quand :id change (viewKey = fullPath). Brief + pages/Docs + entités liées (vrais
// sélecteurs) + partage + activité. Consomme oto_project / oto_doc / oto_resource.
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Tag from '@/components/console/Tag.vue'
import MarkdownView from '@/components/console/MarkdownView.vue'
import ProjectDocs from '@/components/console/ProjectDocs.vue'
import ProjectEntities from '@/components/console/ProjectEntities.vue'
import Dropzone from '@/components/console/Dropzone.vue'
import SharePrincipalDialog from '@/components/console/SharePrincipalDialog.vue'
import NameDialog from '@/components/console/NameDialog.vue'
// Unovis est lourd (~d3) : on l'isole dans son propre chunk, chargé seulement
// quand le projet a de l'activité (v-if ci-dessous) → vue projet de base légère.
const ActivityChart = defineAsyncComponent(() => import('@/components/console/ActivityChart.vue'))
import {
  getProject, updateProject, archiveProject, copyProject, setProjectTemplate, projectHandoff,
  getProjectActivity, listDocs,
  getResource, unshareResource, transferResource,
  listProjectFiles, uploadProjectFile, deleteProjectFile, setProjectFilePublic,
  publishProjectShare, unpublishProjectShare,
  publishProjectMcp, unpublishProjectMcp, getProjectInventory,
} from '@/api/console'
import type { Project, ProjectLink, ProjectActivity, NamespaceShare, ProjectFile } from '@/types/api'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'
import { encryptForShare } from '@/lib/crypto'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useTransferOwnership } from '@/composables/useTransferOwnership'

const route = useRoute()
const router = useRouter()
const { toast } = useToast()
const { confirmAction, promptForm } = usePrompt()
const { pickTarget } = useTransferOwnership()

const projectId = Number(route.params.id)
const project = ref<Project | null>(null)
const briefDraft = ref('')
// Le brief est du markdown : rendu (MarkdownView) hors édition, textarea seulement en édition.
const editingBrief = ref(false)
const grants = ref<NamespaceShare[]>([])
const activity = ref<ProjectActivity[]>([])
const files = ref<ProjectFile[]>([])
const uploading = ref(false)
const shareOpen = ref(false)
const copyOpen = ref(false)
const loaded = ref(false)
const error = ref<string | null>(null)
// Partage public CHIFFRÉ (zero-knowledge) : le lien COMPLET (avec la clé en fragment)
// n'existe que côté navigateur. On le mémorise en localStorage pour le ré-afficher à la
// revisite ; sinon on ne peut que re-publier (rotation de clé → nouveau lien).
const publicLink = ref<string | null>(null)
const publishing = ref(false)
const pshareStoreKey = `oto:pshare:${projectId}`

const briefDirty = computed(() => !!project.value && briefDraft.value !== (project.value.brief_md ?? ''))
const readOnly = computed(() => project.value?.can_write === false)   // #4b — proposer une modif au lieu d'éditer
// MAJ de la liste d'entités remontée par <ProjectEntities> après lier/délier/surcharger.
function onLinksUpdate(links: ProjectLink[]) {
  if (project.value) project.value = { ...project.value, links }
}

async function load() {
  if (!Number.isFinite(projectId)) { error.value = 'Projet introuvable.'; loaded.value = true; return }
  try {
    project.value = await getProject(projectId)
    briefDraft.value = project.value.brief_md ?? ''
    // Ré-affiche le lien public complet mémorisé localement (si toujours partagé).
    publicLink.value = project.value.public_shared ? localStorage.getItem(pshareStoreKey) : null
    await Promise.all([loadGrants(), loadActivity(), loadFiles()])
  } catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
}
async function loadFiles() {
  try { files.value = (await listProjectFiles(projectId)).files }
  catch (e) { toast(humanize(e)) }
}
function fmtSize(n?: number | null): string {
  if (!n) return ''
  if (n < 1024) return `${n} o`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`
}
async function onDropFile(file: File) {
  uploading.value = true
  try {
    const { file: row } = await uploadProjectFile(projectId, file)
    files.value = [row, ...files.value]
    await loadActivity()
  } catch (err) { toast(humanize(err)) }
  finally { uploading.value = false }
}
async function removeFile(f: ProjectFile) {
  if (!(await confirmAction({ title: 'Supprimer ce fichier ?',
    message: `Supprimer « ${f.title || f.filename} » ?` }))) return
  try {
    await deleteProjectFile(projectId, f.id)
    files.value = files.value.filter((x) => x.id !== f.id)
    await loadActivity()
  } catch (e) { toast(humanize(e)) }
}
async function toggleFilePublic(f: ProjectFile) {
  try {
    const { file: row } = await setProjectFilePublic(projectId, f.id, !f.public)
    files.value = files.value.map((x) => (x.id === f.id ? row : x))
    if (row.public && row.public_url) {
      await navigator.clipboard.writeText(row.public_url).catch(() => {})
      toast('Lien public copié.')
    }
  } catch (e) { toast(humanize(e)) }
}
async function loadGrants() {
  try { grants.value = (await getResource('project', String(projectId))).grants }
  catch { grants.value = [] }
}
async function loadActivity() {
  try { activity.value = (await getProjectActivity(projectId)).activity }
  catch { activity.value = [] }
}
onMounted(load)

function startEditBrief() { briefDraft.value = project.value?.brief_md ?? ''; editingBrief.value = true }
function cancelEditBrief() { briefDraft.value = project.value?.brief_md ?? ''; editingBrief.value = false }

async function saveBrief() {
  if (!project.value) return
  try {
    project.value = { ...project.value, ...(await updateProject(projectId, { brief_md: briefDraft.value })) }
    editingBrief.value = false
    await loadActivity(); toast('brief enregistré')
  } catch (e) { toast(humanize(e)) }
}

async function archive() {
  if (!project.value) return
  if (!await confirmAction({ title: 'Archiver le projet', danger: true, confirmLabel: 'Archiver',
    message: `Archiver « ${project.value.name} » ?` })) return
  try { await archiveProject(projectId); toast('projet archivé'); router.push('/projects') }
  catch (e) { toast(humanize(e)) }
}

// ── modèle (template) : copier ce projet / le publier comme modèle (ADR 0032 §7 B5a) ──
function copy() { if (project.value) copyOpen.value = true }
async function doCopy(name: string) {
  try {
    const c = await copyProject(projectId, name)
    toast('projet copié')
    router.push(`/projects/${c.id}`)
  } catch (e) { toast(humanize(e)); throw e }
}

async function toggleTemplate() {
  if (!project.value) return
  const next = !project.value.is_template
  try {
    project.value = { ...project.value, ...(await setProjectTemplate(projectId, next)) }
    toast(next ? 'publié comme modèle' : 'retiré des modèles')
  } catch (e) { toast(humanize(e)) }
}

// « Reprendre dans Claude » (B5b) : récupère le blob copier-coller et le met au presse-papier.
async function handoff() {
  try {
    const { markdown } = await projectHandoff(projectId)
    await navigator.clipboard.writeText(markdown)
    toast('texte copié — colle-le dans Claude pour reprendre le projet')
  } catch (e) { toast(humanize(e)) }
}

// ── partage / transfert (oto_resource) ──
// Le geste de partage (membre / équipe / org / email) vit dans
// <SharePrincipalDialog> (autonome) ; la carte inline garde sa révocation rapide.
function principalOf(g: NamespaceShare) {
  if (g.principal_type === 'group') return { group_id: Number(g.principal_id) }
  if (g.principal_type === 'org') return { org_id: Number(g.principal_id) }
  return g.email ? { email: g.email } : null
}
async function revoke(g: NamespaceShare) {
  const p = principalOf(g)
  if (!p) return
  try { await unshareResource('project', String(projectId), p); await loadGrants() }
  catch (e) { toast(humanize(e)) }
}
async function transfer() {
  if (!project.value) return
  const target = await pickTarget(project.value.name || `projet #${projectId}`)
  if (!target) return
  try { await transferResource('project', String(projectId), target); toast('transféré'); await Promise.all([load(), loadGrants()]) }
  catch (e) { toast(humanize(e)) }
}

// ── partage PUBLIC CHIFFRÉ (zero-knowledge, ADR 0032 §3) ──
// Chiffre un snapshot { brief + pages } DANS le navigateur avec une clé neuve, n'envoie
// que le ciphertext au backend, et met la clé dans le fragment du lien. La plateforme
// ne peut pas lire le projet partagé. Re-publier fait tourner la clé (ancien lien caduc).
async function publishPublic() {
  if (!project.value || publishing.value) return
  publishing.value = true
  try {
    const { docs } = await listDocs(projectId)
    const snapshot = {
      v: 1,
      name: project.value.name,
      brief_md: project.value.brief_md ?? '',
      docs: docs.map((d) => ({ id: d.id, parent_id: d.parent_id, title: d.title, body_md: d.body_md, kind: d.kind })),
      shared_at: new Date().toISOString(),
    }
    const { ciphertext, keyFragment } = await encryptForShare(snapshot)
    const { token, public_base_url } = await publishProjectShare(projectId, ciphertext)
    const url = `${public_base_url}/p/p/${token}#${keyFragment}`
    localStorage.setItem(pshareStoreKey, url)
    publicLink.value = url
    project.value = { ...project.value, public_shared: true }
    await navigator.clipboard.writeText(url).catch(() => {})
    toast('lien public chiffré copié — la clé ne quitte jamais ce navigateur')
    await loadActivity()
  } catch (e) { toast(humanize(e)) }
  finally { publishing.value = false }
}
async function unpublishPublic() {
  if (!project.value) return
  if (!await confirmAction({ title: 'Retirer le partage public',
    message: 'Le lien public deviendra immédiatement inaccessible. Continuer ?', confirmLabel: 'Retirer' })) return
  try {
    await unpublishProjectShare(projectId)
    localStorage.removeItem(pshareStoreKey)
    publicLink.value = null
    project.value = { ...project.value, public_shared: false }
    toast('partage public retiré')
    await loadActivity()
  } catch (e) { toast(humanize(e)) }
}
async function copyPublicLink() {
  if (!publicLink.value) return
  await navigator.clipboard.writeText(publicLink.value).catch(() => {})
  toast('lien copié')
}

// ── Endpoint MCP dédié (`<slug>.mcp.oto.cx`, ADR 0032 amende #44) ──
const mcpBusy = ref(false)
async function publishMcp() {
  if (!project.value || mcpBusy.value) return
  // Préremplissage DÉRIVÉ (ADR 0035 B4) : pas encore de liste curée sur le projet →
  // proposer l'inventaire (refs des procédures liées ∪ usage des runs) ; on cure, on
  // ne retape pas. Best-effort : échec de dérivation = formulaire vide, comme avant.
  let toolsDefault = (project.value.mcp_tools ?? []).join('\n')
  let toolsHint = 'un par ligne — les SEULS outils visibles sur ce sous-domaine'
  if (!toolsDefault) {
    try {
      toolsDefault = ((await getProjectInventory(projectId)).tools ?? []).join('\n')
      if (toolsDefault) toolsHint = 'prérempli depuis l’inventaire du projet (procédures liées + runs) — cure la liste'
    } catch { /* dérivation best-effort */ }
  }
  const r = await promptForm({
    title: 'Publier en endpoint MCP',
    description: 'Un sous-domaine dédié `<slug>.mcp.oto.cx` exposant un jeu d’outils figé, à brancher dans Claude/Mistral.',
    fields: [
      { key: 'slug', label: 'Sous-domaine', value: project.value.mcp_slug ?? '',
        placeholder: 'french-tech-marseille', required: true, hint: '→ <slug>.mcp.oto.cx (min. 3 car., a-z 0-9 -)' },
      { key: 'access', label: 'Accès', type: 'select', value: project.value.mcp_access && project.value.mcp_access !== 'off' ? project.value.mcp_access : 'anonymous',
        options: [
          { value: 'anonymous', label: 'Public · sans login (n’importe qui, aucun compte)' },
          { value: 'org', label: 'Org · authentifié (membres de l’org, login Logto)' },
        ] },
      { key: 'tools', label: 'Outils exposés', type: 'textarea', value: toolsDefault,
        placeholder: 'frenchtech_search_annuaire\nfrenchtech_evenements', required: true,
        hint: toolsHint },
    ],
    submitLabel: 'Publier',
  })
  if (!r) return
  const tools = (r.tools ?? '').split(/[\n,]/).map((t) => t.trim()).filter(Boolean)
  mcpBusy.value = true
  try {
    const updated = await publishProjectMcp(projectId, {
      mcp_slug: (r.slug ?? '').trim(), mcp_access: (r.access ?? 'anonymous') as 'anonymous' | 'org', mcp_tools: tools })
    project.value = { ...project.value, ...updated }
    toast('endpoint MCP publié')
    await loadActivity()
  } catch (e) { toast(humanize(e)) }
  finally { mcpBusy.value = false }
}
async function unpublishMcp() {
  if (!project.value) return
  if (!await confirmAction({ title: 'Retirer l’endpoint MCP',
    message: 'Le sous-domaine deviendra immédiatement inaccessible. Continuer ?', confirmLabel: 'Retirer', danger: true })) return
  try {
    const updated = await unpublishProjectMcp(projectId)
    project.value = { ...project.value, ...updated }
    toast('endpoint MCP retiré')
    await loadActivity()
  } catch (e) { toast(humanize(e)) }
}
async function copyMcpUrl() {
  if (!project.value?.mcp_url) return
  await navigator.clipboard.writeText(project.value.mcp_url).catch(() => {})
  toast('URL copiée')
}
</script>

<template>
  <div class="content-inner fadein">
    <RouterLink to="/projects" class="wk-back">← projets</RouterLink>

    <div v-if="error" class="surface-card"><p class="dim" style="font-size: 13px">{{ error }}</p></div>
    <div v-else-if="!loaded" class="surface-card"><p class="dim" style="font-size: 13px">chargement du projet…</p></div>

    <template v-else-if="project">
      <!-- en-tête de page -->
      <header class="wk-head">
        <div class="wk-head__id">
          <span class="card-eb">{{ project.owner_type === 'org' ? "projet d'org · partagé avec l'équipe" : 'projet perso' }}</span>
          <div class="wk-title">{{ project.name }}</div>
          <div class="wk-status">
            <span class="wk-dot"></span> actif
            <Tag v-if="project.is_template" tone="saffron" title="Publié comme modèle copiable">modèle</Tag>
            <Tag v-if="readOnly" tone="cobalt" title="Tu es en lecture seule sur ce projet">lecture</Tag>
          </div>
        </div>
        <div class="wk-head__act">
          <button class="btn-resume" @click="handoff">reprendre dans claude →</button>
          <button class="btn-soft" @click="copy">copier</button>
          <button v-if="!readOnly" class="btn-soft" @click="toggleTemplate">{{ project.is_template ? 'retirer des modèles' : 'publier comme modèle' }}</button>
          <button v-if="!readOnly" class="btn-soft" @click="shareOpen = true">partager</button>
          <button v-if="!readOnly" class="btn-soft" @click="transfer">transférer</button>
          <button v-if="!readOnly" class="btn-soft btn-soft--danger" @click="archive">archiver</button>
        </div>
      </header>

      <!-- grille atelier | méta -->
      <div class="wk-grid">
        <!-- colonne atelier : brief + pages + entités liées -->
        <div class="wk-col">

          <!-- brief : rendu markdown hors édition, textarea seulement en édition -->
          <section class="surface-card">
            <div class="card-eb-row">
              <span class="card-eb">brief — point d'entrée de l'agent</span>
              <span v-if="editingBrief" class="card-eb-hint">md</span>
              <button v-else-if="!readOnly" class="btn-soft btn-soft--xs" @click="startEditBrief">éditer</button>
            </div>
            <template v-if="editingBrief">
              <textarea v-model="briefDraft" class="wk-brief" rows="8"
                placeholder="Le but du projet, le contexte, ce que l'agent doit savoir au démarrage…"></textarea>
              <div class="wk-brief-act">
                <button class="btn-soft" @click="saveBrief">enregistrer le brief</button>
                <button class="ent__lnk" @click="cancelEditBrief">annuler</button>
                <span class="dim" style="font-size: 11px">{{ briefDirty ? 'modifié' : 'enregistré' }}</span>
              </div>
            </template>
            <template v-else>
              <MarkdownView v-if="project.brief_md && project.brief_md.trim()" :source="project.brief_md" />
              <p v-else class="dim" style="font-size: 12px">{{ readOnly ? 'aucun brief.' : 'aucun brief — clique « éditer » pour le rédiger.' }}</p>
            </template>
          </section>

          <!-- pages (ProjectDocs porte son propre en-tête « Pages ») -->
          <section class="surface-card">
            <ProjectDocs :project-id="project.id" :read-only="readOnly" @changed="loadActivity" />
          </section>

          <!-- entités liées -->
          <ProjectEntities :project-id="project.id" :links="project.links ?? []" :read-only="readOnly"
            @update:links="onLinksUpdate" @changed="loadActivity" />
        </div>

        <!-- colonne méta : partage + autres documents + activité -->
        <div class="wk-col">

          <!-- partage -->
          <section class="surface-card">
            <div class="card-eb-row">
              <span class="card-eb">partage</span>
              <button v-if="!readOnly" class="btn-soft btn-soft--xs" @click="shareOpen = true">+ inviter</button>
            </div>
            <p v-if="!grants.length" class="dim" style="font-size: 12px">non partagé.</p>
            <div v-for="g in grants" :key="(g.principal_type || 'user') + (g.principal_id || g.email || '')" class="meta-row">
              <span class="meta-row__main">{{ g.label || g.email || g.principal_id }}</span>
              <Tag v-if="g.principal_type === 'group'" tone="saffron">équipe</Tag>
              <Tag v-else-if="g.principal_type === 'org'" tone="terra">org</Tag>
              <Tag :tone="g.permission === 'write' ? 'olive' : 'cobalt'">{{ g.permission === 'write' ? 'édition' : 'lecture' }}</Tag>
              <button v-if="!readOnly && principalOf(g)" class="ent__lnk" title="Retirer l'accès" @click="revoke(g)">✕</button>
            </div>
          </section>

          <!-- partage public chiffré (zero-knowledge, ADR 0032 §3) -->
          <section class="surface-card">
            <div class="card-eb-row">
              <span class="card-eb">lien public · chiffré</span>
              <Tag v-if="project.public_shared" tone="olive" title="Un lien public chiffré est actif">actif</Tag>
            </div>
            <p class="dim" style="font-size: 11.5px; line-height: 1.5; margin-bottom: 9px">
              Publie un instantané en lecture seule (brief + pages) derrière un lien.
              Le contenu est <strong>chiffré dans ton navigateur</strong> : la clé vit dans le lien,
              oto ne peut pas le lire.
            </p>
            <template v-if="project.public_shared">
              <div v-if="publicLink" class="pshare-link">
                <input class="pshare-input" :value="publicLink" readonly @focus="($event.target as HTMLInputElement).select()" />
                <button class="btn-soft btn-soft--xs" @click="copyPublicLink">copier</button>
              </div>
              <p v-else class="dim" style="font-size: 11px; margin-bottom: 8px">
                Lien actif, mais sa clé n'a été affichée qu'à la publication (sur un autre appareil ?).
                Re-publie pour obtenir un nouveau lien.
              </p>
              <div class="pshare-act">
                <button v-if="!readOnly" class="btn-soft btn-soft--xs" :disabled="publishing" @click="publishPublic">re-publier</button>
                <button v-if="!readOnly" class="btn-soft btn-soft--xs btn-soft--danger" @click="unpublishPublic">retirer</button>
              </div>
            </template>
            <button v-else-if="!readOnly" class="btn-soft btn-soft--xs" :disabled="publishing" @click="publishPublic">
              {{ publishing ? 'chiffrement…' : 'partager par lien chiffré' }}
            </button>
            <p v-else class="dim" style="font-size: 12px">non partagé publiquement.</p>
          </section>

          <!-- endpoint MCP dédié (<slug>.mcp.oto.cx, ADR 0032 amende #44) -->
          <section class="surface-card">
            <div class="card-eb-row" style="margin-bottom: 6px">
              <strong>Endpoint MCP</strong>
              <Tag v-if="project.mcp_access === 'anonymous'" tone="olive" title="Sous-domaine public, sans login">public · sans login</Tag>
              <Tag v-else-if="project.mcp_access === 'org'" tone="saffron" title="Authentifié, membres de l'org">org · authentifié</Tag>
            </div>
            <p class="dim" style="font-size: 11.5px; line-height: 1.5; margin-bottom: 9px">
              Publie ce projet comme un serveur MCP dédié à brancher dans Claude / Mistral.
              <strong>Public</strong> = n'importe qui l'utilise <strong>sans compte</strong> ;
              <strong>org</strong> = login requis (membres de l'org).
            </p>
            <template v-if="project.mcp_url">
              <div class="pshare-link">
                <input class="pshare-input" :value="project.mcp_url" readonly @focus="($event.target as HTMLInputElement).select()" />
                <button class="btn-soft btn-soft--xs" @click="copyMcpUrl">copier</button>
              </div>
              <p class="dim" style="font-size: 11px; margin: 6px 0 8px">
                {{ project.mcp_tools?.length ?? 0 }} outil(s) : {{ (project.mcp_tools ?? []).join(', ') }}
              </p>
              <div class="pshare-act">
                <button v-if="!readOnly" class="btn-soft btn-soft--xs" :disabled="mcpBusy" @click="publishMcp">reconfigurer</button>
                <button v-if="!readOnly" class="btn-soft btn-soft--xs btn-soft--danger" @click="unpublishMcp">retirer</button>
              </div>
            </template>
            <button v-else-if="!readOnly" class="btn-soft btn-soft--xs" :disabled="mcpBusy" @click="publishMcp">
              {{ mcpBusy ? 'publication…' : 'publier en endpoint MCP' }}
            </button>
            <p v-else class="dim" style="font-size: 12px">non publié.</p>
          </section>

          <!-- autres documents -->
          <section class="surface-card">
            <div class="card-eb-row">
              <span class="card-eb">autres documents</span>
            </div>
            <Dropzone v-if="!readOnly" class="mb-3" :busy="uploading" :max-size-mb="25"
              accept=".pdf,.html,.htm,.txt,.md,.csv,.json,image/*"
              label="déposer un document" hint="PDF, HTML, image… — glisser-déposer ou cliquer · max 25 Mo"
              @select="onDropFile" @error="toast" />
            <p v-if="!files.length" class="dim" style="font-size: 12px">aucun fichier brut — PDF, HTML…</p>
            <div v-for="f in files" :key="f.id" class="meta-row meta-row--file">
              <div class="meta-row__main">
                <a v-if="f.public && f.public_url" :href="f.public_url" target="_blank" rel="noopener" class="file-link">{{ f.title || f.filename }}</a>
                <a v-else-if="f.download_url" :href="f.download_url" target="_blank" rel="noopener" class="file-link">{{ f.title || f.filename }}</a>
                <span v-else class="file-link">{{ f.title || f.filename }}</span>
                <span class="dim" style="font-size: 10.5px; margin-left: 6px">{{ fmtSize(f.size_bytes) }}</span>
                <Tag v-if="f.public" tone="cobalt" title="Partagé publiquement — accessible par lien">public</Tag>
                <div v-if="f.description" class="dim" style="font-size: 11px; margin-top: 2px">{{ f.description }}</div>
              </div>
              <button v-if="!readOnly" class="ent__lnk" :title="f.public ? 'Rendre privé' : 'Partager publiquement (copie le lien)'" @click="toggleFilePublic(f)">{{ f.public ? '🔓' : '🔗' }}</button>
              <button v-if="!readOnly" class="ent__lnk" title="Supprimer" @click="removeFile(f)">✕</button>
            </div>
          </section>

          <!-- activité -->
          <section class="surface-card">
            <span class="card-eb">activité</span>
            <ActivityChart v-if="activity.length" :activity="activity" :days="14" />
            <p v-if="!activity.length" class="dim" style="font-size: 12px; margin-top: 8px">aucune activité.</p>
            <div v-else class="wk-acts">
              <div v-for="(a, i) in activity" :key="i" class="wk-act">
                <span class="wk-act__t">{{ fmtDate(a.created_at) }}</span>
                <span class="wk-act__b"><strong>{{ a.action }}</strong><span v-if="a.detail" class="dim"> · {{ a.detail }}</span></span>
              </div>
            </div>
          </section>
        </div>
      </div>

      <SharePrincipalDialog :open="shareOpen" resource-type="project" :resource-id="String(projectId)"
        :resource-label="project.name" @close="shareOpen = false" @changed="loadGrants" />
      <NameDialog v-model:open="copyOpen" title="copier ce projet" label="nom de la copie"
        :initial="'Copie de ' + project.name" submit-label="copier" :on-confirm="doCopy" />
    </template>
  </div>
</template>

<style scoped>
/* ── chrome de page ── */
.wk-back { display: inline-block; margin-bottom: 14px; font-size: 12.5px; color: var(--color-mute); text-decoration: none; }
.wk-back:hover { color: var(--color-ink); }
.wk-head { display: flex; align-items: flex-start; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
.wk-head__id { flex: 1; min-width: 240px; }
.wk-title { font-size: 27px; font-weight: 700; letter-spacing: -0.03em; line-height: 1.06; margin-top: 5px; color: var(--color-ink); }
.wk-status { display: flex; align-items: center; gap: 7px; margin-top: 7px; font-size: 12.5px; color: var(--color-mute); }
.wk-dot { display: inline-block; width: 8px; height: 8px; border-radius: 999px; background: var(--color-olive); }
.wk-head__act { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; justify-content: flex-end; }

/* ── boutons ── */
.btn-resume { display: inline-flex; align-items: center; gap: 7px; background: var(--color-ink); color: var(--color-bg); border: 1px solid var(--color-ink); border-radius: 999px; padding: 7px 15px; font-family: var(--font-sans); font-size: 12.5px; font-weight: 600; text-transform: lowercase; cursor: pointer; transition: transform 180ms var(--ease-out); }
.btn-resume:hover { transform: translateY(-1px); }
.btn-soft { display: inline-flex; align-items: center; background: var(--color-surface); color: var(--color-ink-soft); border: 1px solid var(--color-hair); border-radius: 7px; padding: 5px 11px; font-family: var(--font-sans); font-size: 11.5px; font-weight: 600; text-transform: lowercase; cursor: pointer; transition: background 180ms; }
.btn-soft:hover { background: var(--color-paper-2); }
.btn-soft:disabled { opacity: .5; cursor: not-allowed; }
.btn-soft--xs { padding: 4px 9px; font-size: 11px; }
.btn-soft--danger { color: var(--color-terra-ink); border-color: var(--color-terra-soft); }

/* ── grille atelier | méta ── */
.wk-grid { display: grid; grid-template-columns: 1fr 280px; gap: 14px; align-items: start; }
@media (max-width: 900px) { .wk-grid { grid-template-columns: 1fr; } }
.wk-col { display: flex; flex-direction: column; gap: 14px; min-width: 0; }

/* ── carte-surface ── */
.surface-card { background: var(--color-surface); border: 1px solid var(--color-hair); border-radius: 12px; padding: 18px; }
.card-eb { font-family: var(--font-mono); font-size: 10px; font-weight: 600; letter-spacing: .16em; text-transform: uppercase; color: var(--color-mute); }
.card-eb-hint { font-family: var(--font-mono); font-size: 9.5px; color: var(--color-faint); }
.card-eb-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 9px; }

/* ── brief ── */
.wk-brief { width: 100%; margin-top: 0; border: 1px solid var(--color-hair); border-radius: 10px; padding: 11px 13px; font-family: var(--font-sans); font-size: 13.5px; line-height: 1.6; color: var(--color-ink-soft); background: var(--color-surface); resize: vertical; box-sizing: border-box; }
.wk-brief-act { display: flex; align-items: center; gap: 9px; margin-top: 8px; }

/* ── colonne méta : actions inline (partagées avec les cartes d'entité) ── */
.ent__lnk { background: none; border: 0; padding: 0; font-family: var(--font-sans); font-size: 11px; color: var(--color-mute); cursor: pointer; }
.ent__lnk:hover { color: var(--color-ink); text-decoration: underline; }

/* ── colonne méta : lignes partage / fichiers / activité ── */
.meta-row { display: flex; align-items: center; gap: 9px; padding: 7px 0; border-bottom: 1px solid var(--color-hair-soft); }
.meta-row:last-child { border-bottom: none; }
.meta-row--file { align-items: flex-start; }
.meta-row__main { flex: 1; min-width: 0; font-size: 12.5px; color: var(--color-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.meta-row--file .meta-row__main { white-space: normal; }
.file-link { font-size: 12.5px; color: var(--color-ink); font-weight: 500; }
.file-link:hover { text-decoration: underline; }
.wk-acts { margin-top: 9px; display: flex; flex-direction: column; }
.wk-act { display: flex; gap: 9px; padding: 5px 0; border-bottom: 1px solid var(--color-hair-soft); }
.wk-act:last-child { border-bottom: none; }
.wk-act__t { font-family: var(--font-mono); font-size: 10px; color: var(--color-faint); width: 64px; flex: none; }
.wk-act__b { font-size: 12px; color: var(--color-ink-soft); }
.wk-act__b strong { font-weight: 600; color: var(--color-ink); }

/* ── lien public chiffré ── */
.pshare-link { display: flex; align-items: center; gap: 7px; margin-bottom: 8px; }
.pshare-input { flex: 1; min-width: 0; border: 1px solid var(--color-hair); border-radius: 7px; padding: 5px 8px; font-family: var(--font-mono); font-size: 10.5px; color: var(--color-ink-soft); background: var(--color-paper-2); }
.pshare-act { display: flex; gap: 7px; }
</style>
