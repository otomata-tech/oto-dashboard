<script setup lang="ts">
// Page DÉDIÉE d'un projet — `/projects/:id` (objet de premier rang, ADR 0030 ; pas
// un volet de liste). Charge un seul projet par id de route, remonté par le layout
// quand :id change (viewKey = fullPath). Brief + pages/Docs + entités liées (vrais
// sélecteurs) + partage + activité. Consomme oto_project / oto_doc / oto_resource.
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Tag from '@/components/console/Tag.vue'
import ProjectWiki from '@/components/console/ProjectWiki.vue'
import ProjectEntities from '@/components/console/ProjectEntities.vue'
import Dropzone from '@/components/console/Dropzone.vue'
import Icon from '@/components/console/Icon.vue'
import AttachmentViewer from '@/components/console/AttachmentViewer.vue'
import SharePrincipalDialog from '@/components/console/SharePrincipalDialog.vue'
import NameDialog from '@/components/console/NameDialog.vue'
// Unovis est lourd (~d3) : on l'isole dans son propre chunk, chargé seulement
// quand le projet a de l'activité (v-if ci-dessous) → vue projet de base légère.
const ActivityChart = defineAsyncComponent(() => import('@/components/console/ActivityChart.vue'))
import {
  getProject, updateProject, archiveProject, copyProject, setProjectTemplate, projectHandoff,
  getProjectActivity,
  getResource, unshareResource, transferResource,
  listProjectFiles, uploadProjectFile, deleteProjectFile, setProjectFilePublic,
  publishProjectMcp, unpublishProjectMcp, getProjectInventory,
} from '@/api/console'
import type { ProjectAudit } from '@/api/console'
import type { Project, ProjectLink, ProjectActivity, NamespaceShare, ProjectFile } from '@/types/api'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'
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
const grants = ref<NamespaceShare[]>([])
const activity = ref<ProjectActivity[]>([])
const files = ref<ProjectFile[]>([])
const preview = ref<ProjectFile | null>(null)   // fichier ouvert dans le viewer lightbox
const uploading = ref(false)
const shareOpen = ref(false)
const copyOpen = ref(false)
const loaded = ref(false)
const error = ref<string | null>(null)
// URL de PARTAGE NAVIGABLE (lecture seule, humain) — mode `secret` uniquement (ADR 0032) :
// sur `<slug>.share.oto.cx` la racine + /procedures//data//docs rendent l'UI, le MCP est au
// path /mcp. Dérivée du slug (aucun secret) plutôt que calculée par le backend.
const shareUrl = computed(() =>
  project.value?.mcp_access === 'secret' && project.value.mcp_slug
    ? `https://${project.value.mcp_slug}.share.oto.cx` : null)
// URL du connecteur MCP à brancher dans Claude : share.oto.cx/mcp en secret, sinon la dérivée
// backend (mcp.oto.cx/mcp pour anonymous/org).
const mcpConnectUrl = computed(() =>
  shareUrl.value ? `${shareUrl.value}/mcp` : (project.value?.mcp_url ?? null))

const readOnly = computed(() => project.value?.can_write === false)   // #4b — proposer une modif au lieu d'éditer
// Audit des liens (ADR 0035 B5) : morts / slots non bindés / procédures inertes.
const audit = ref<ProjectAudit | null>(null)
const auditIssues = computed(() => !!audit.value
  && audit.value.dead_links.length + audit.value.unbound_slots.length + audit.value.inert_procedures.length > 0)
async function loadAudit() {
  try { audit.value = (await getProjectInventory(projectId)).audit ?? null }
  catch { audit.value = null }   // dérivation best-effort — pas de bandeau, pas d'erreur
}
// MAJ de la liste d'entités remontée par <ProjectEntities> après lier/délier/surcharger.
function onLinksUpdate(links: ProjectLink[]) {
  if (project.value) project.value = { ...project.value, links }
  void loadAudit()
}

async function load() {
  if (!Number.isFinite(projectId)) { error.value = 'Projet introuvable.'; loaded.value = true; return }
  try {
    project.value = await getProject(projectId)
    await Promise.all([loadGrants(), loadActivity(), loadFiles(), loadAudit()])
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

// Le brief est édité dans le wiki (page d'accueil) ; le parent reste propriétaire de
// l'état projet et persiste la valeur remontée par <ProjectWiki @save-brief>.
async function saveBrief(value: string) {
  if (!project.value) return
  try {
    project.value = { ...project.value, ...(await updateProject(projectId, { brief_md: value })) }
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

// ── Endpoint MCP dédié + partage navigable (`<slug>.{mcp,share}.oto.cx`, ADR 0032) ──
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
    description: 'Un sous-domaine dédié exposant un jeu d’outils figé, à brancher dans Claude/Mistral. En « secret », le sous-domaine `<slug>.share.oto.cx` est aussi une UI navigable (lecture seule).',
    fields: [
      { key: 'slug', label: 'Sous-domaine', value: project.value.mcp_slug ?? '',
        placeholder: 'french-tech-marseille', required: false, hint: '→ <slug>.mcp.oto.cx (public/org) ou <slug>.share.oto.cx (secret). Min. 3 car., a-z 0-9 -. En « secret », préfixe optionnel : un suffixe aléatoire est ajouté.' },
      { key: 'access', label: 'Accès', type: 'select', value: project.value.mcp_access && project.value.mcp_access !== 'off' ? project.value.mcp_access : 'anonymous',
        options: [
          { value: 'anonymous', label: 'Public · sans login, listé dans l’annuaire' },
          { value: 'secret', label: 'Secret · URL non devinable, navigable (non listé)' },
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
      mcp_slug: (r.slug ?? '').trim(), mcp_access: (r.access ?? 'anonymous') as 'anonymous' | 'secret' | 'org', mcp_tools: tools })
    project.value = { ...project.value, ...updated }
    const unresolvable = updated.mcp_unresolvable_tools ?? []
    if (unresolvable.length)
      toast(`endpoint publié — ${unresolvable.length} outil(s) exposé(s) mais non résoluble(s) sans login (échoueront à l’appel) : ${unresolvable.join(', ')}`)
    else
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
  if (!mcpConnectUrl.value) return
  await navigator.clipboard.writeText(mcpConnectUrl.value).catch(() => {})
  toast('URL copiée')
}
async function copyShareUrl() {
  if (!shareUrl.value) return
  await navigator.clipboard.writeText(shareUrl.value).catch(() => {})
  toast('lien de partage copié')
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
          <button class="btn-resume" @click="handoff">Reprendre dans claude →</button>
          <button class="btn-soft" @click="copy">Copier</button>
          <button v-if="!readOnly" class="btn-soft" @click="toggleTemplate">{{ project.is_template ? 'Retirer des modèles' : 'Publier comme modèle' }}</button>
          <button v-if="!readOnly" class="btn-soft" @click="shareOpen = true">Partager</button>
          <button v-if="!readOnly" class="btn-soft" @click="transfer">Transférer</button>
          <button v-if="!readOnly" class="btn-soft btn-soft--danger" @click="archive">Archiver</button>
        </div>
      </header>

      <!-- grille atelier | méta -->
      <div class="wk-grid">
        <!-- colonne atelier : wiki (accueil=brief + pages navigables) + entités liées -->
        <div class="wk-col">

          <!-- wiki : le brief est la page d'accueil, les pages s'y naviguent (#37) -->
          <ProjectWiki :project-id="project.id" :project-name="project.name" :brief="project.brief_md"
            :read-only="readOnly" @save-brief="saveBrief" @changed="loadActivity" />

          <!-- audit des liens (ADR 0035 B5) : morts / slots non bindés / inertes -->
          <section v-if="auditIssues && audit" class="surface-card"
            style="border-left: 3px solid var(--color-saffron)">
            <div class="card-eb-row"><span class="card-eb">liens à vérifier</span></div>
            <ul class="dim" style="font-size: 12px; margin: 0; padding-left: 16px; display: grid; gap: 4px">
              <li v-for="d in audit.dead_links" :key="'dead-' + d.target_type + d.target_ref">
                lien mort — {{ d.target_type }} « {{ d.target_ref }} » : {{ d.why }}
              </li>
              <li v-for="u in audit.unbound_slots" :key="'unbound-' + u.ref">
                procédure « {{ u.procedure }} » : slots déclarés non bindés dans ce projet — {{ u.slots.join(', ') }}
              </li>
              <li v-for="s in audit.inert_procedures" :key="'inert-' + s">
                procédure « {{ s }} » liée mais jamais déroulée dans ce projet
              </li>
            </ul>
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
              <button v-if="!readOnly" class="btn-soft btn-soft--xs" @click="shareOpen = true">+ Inviter</button>
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

          <!-- endpoint MCP dédié + partage navigable (<slug>.{mcp,share}.oto.cx, ADR 0032) -->
          <section class="surface-card">
            <div class="card-eb-row" style="margin-bottom: 6px">
              <strong>Endpoint MCP & partage</strong>
              <Tag v-if="project.mcp_access === 'anonymous'" tone="olive" title="Sous-domaine public, sans login">public · sans login</Tag>
              <Tag v-else-if="project.mcp_access === 'secret'" tone="cobalt" title="URL secrète navigable, sans login">secret · navigable</Tag>
              <Tag v-else-if="project.mcp_access === 'org'" tone="saffron" title="Authentifié, membres de l'org">org · authentifié</Tag>
            </div>
            <p class="dim" style="font-size: 11.5px; line-height: 1.5; margin-bottom: 9px">
              Publie ce projet comme serveur MCP dédié à brancher dans Claude / Mistral.
              <strong>Public</strong> = n'importe qui l'utilise <strong>sans compte</strong> (listé) ;
              <strong>secret</strong> = URL non devinable, <strong>navigable</strong> (procédures, tableaux, docs en lecture seule) ;
              <strong>org</strong> = login requis (membres de l'org).
            </p>
            <template v-if="mcpConnectUrl">
              <!-- lien de partage navigable (mode secret) : ce qu'on envoie à un invité -->
              <template v-if="shareUrl">
                <span class="card-eb">lien de partage · navigable</span>
                <div class="pshare-link">
                  <input class="pshare-input" :value="shareUrl" readonly @focus="($event.target as HTMLInputElement).select()" />
                  <button class="btn-soft btn-soft--xs" @click="copyShareUrl">Copier</button>
                </div>
                <p class="dim" style="font-size: 11px; margin: 6px 0 10px">
                  Tes invités y naviguent les procédures, tableaux et documents (lecture seule).
                </p>
                <span class="card-eb">endpoint MCP (Claude)</span>
              </template>
              <div class="pshare-link">
                <input class="pshare-input" :value="mcpConnectUrl" readonly @focus="($event.target as HTMLInputElement).select()" />
                <button class="btn-soft btn-soft--xs" @click="copyMcpUrl">Copier</button>
              </div>
              <p class="dim" style="font-size: 11px; margin: 6px 0 8px">
                {{ project.mcp_tools?.length ?? 0 }} outil(s) : {{ (project.mcp_tools ?? []).join(', ') }}
              </p>
              <div class="pshare-act">
                <button v-if="!readOnly" class="btn-soft btn-soft--xs" :disabled="mcpBusy" @click="publishMcp">Reconfigurer</button>
                <button v-if="!readOnly" class="btn-soft btn-soft--xs btn-soft--danger" @click="unpublishMcp">Retirer</button>
              </div>
            </template>
            <button v-else-if="!readOnly" class="btn-soft btn-soft--xs" :disabled="mcpBusy" @click="publishMcp">
              {{ mcpBusy ? 'Publication…' : 'Publier en endpoint MCP' }}
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
                <button class="file-link" title="Aperçu" @click="preview = f">{{ f.title || f.filename }}</button>
                <span class="dim" style="font-size: 10.5px; margin-left: 6px">{{ fmtSize(f.size_bytes) }}</span>
                <Tag v-if="f.public" tone="cobalt" title="Partagé publiquement — accessible par lien">public</Tag>
                <div v-if="f.description" class="dim" style="font-size: 11px; margin-top: 2px">{{ f.description }}</div>
              </div>
              <button class="ent__lnk" title="Aperçu" @click="preview = f"><Icon name="eye" :size="14" /></button>
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
      <AttachmentViewer :file="preview" @close="preview = null" />
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
.card-eb-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 9px; }

/* ── colonne méta : actions inline (partagées avec les cartes d'entité) ── */
.ent__lnk { background: none; border: 0; padding: 0; font-family: var(--font-sans); font-size: 11px; color: var(--color-mute); cursor: pointer; }
.ent__lnk:hover { color: var(--color-ink); text-decoration: underline; }

/* ── colonne méta : lignes partage / fichiers / activité ── */
.meta-row { display: flex; align-items: center; gap: 9px; padding: 7px 0; border-bottom: 1px solid var(--color-hair-soft); }
.meta-row:last-child { border-bottom: none; }
.meta-row--file { align-items: flex-start; }
.meta-row__main { flex: 1; min-width: 0; font-size: 12.5px; color: var(--color-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.meta-row--file .meta-row__main { white-space: normal; }
.file-link { font-size: 12.5px; color: var(--color-ink); font-weight: 500; background: none; border: 0; padding: 0; cursor: pointer; text-align: left; font-family: inherit; }
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
