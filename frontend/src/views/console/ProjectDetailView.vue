<script setup lang="ts">
// Page DÉDIÉE d'un projet — `/projects/:id` (objet de premier rang, ADR 0030 ; pas
// un volet de liste). Charge un seul projet par id de route, remonté par le layout
// quand :id change (viewKey = fullPath). Brief + pages/Docs + entités liées (vrais
// sélecteurs) + partage + activité. Consomme oto_project / oto_doc / oto_resource.
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Tag from '@/components/console/Tag.vue'
import ProjectDocs from '@/components/console/ProjectDocs.vue'
import ProjectEntities from '@/components/console/ProjectEntities.vue'
import {
  getProject, updateProject, archiveProject, copyProject, setProjectTemplate, projectHandoff,
  getProjectActivity,
  getResource, shareResource, unshareResource, transferResource,
  listProjectFiles, uploadProjectFile, deleteProjectFile, setProjectFilePublic,
} from '@/api/console'
import type { Project, ProjectLink, ProjectActivity, NamespaceShare, ProjectFile } from '@/types/api'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'
import { useToast } from '@/composables/useToast'
import { usePrompt, type PromptField } from '@/composables/usePrompt'

const route = useRoute()
const router = useRouter()
const { toast } = useToast()
const { promptForm, confirmAction } = usePrompt()

const projectId = Number(route.params.id)
const project = ref<Project | null>(null)
const briefDraft = ref('')
const grants = ref<NamespaceShare[]>([])
const activity = ref<ProjectActivity[]>([])
const files = ref<ProjectFile[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const loaded = ref(false)
const error = ref<string | null>(null)

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
async function onFilePick(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploading.value = true
  try {
    const { file: row } = await uploadProjectFile(projectId, file)
    files.value = [row, ...files.value]
    await loadActivity()
  } catch (err) { toast(humanize(err)) }
  finally { uploading.value = false; if (fileInput.value) fileInput.value.value = '' }
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

async function saveBrief() {
  if (!project.value) return
  try {
    project.value = { ...project.value, ...(await updateProject(projectId, { brief_md: briefDraft.value })) }
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
async function copy() {
  if (!project.value) return
  const res = await promptForm({
    title: 'Copier ce projet', submitLabel: 'Copier',
    fields: [{ key: 'name', label: 'Nom de la copie', type: 'text',
               value: `Copie de ${project.value.name}`, required: true }],
  })
  if (!res) return
  try {
    const copy = await copyProject(projectId, String(res.name).trim())
    toast('projet copié')
    router.push(`/projects/${copy.id}`)
  } catch (e) { toast(humanize(e)) }
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
async function share() {
  if (!project.value) return
  const fields: PromptField[] = [
    { key: 'email', label: 'Email (utilisateur oto)', required: true },
    { key: 'permission', label: 'Droit', type: 'select',
      options: [{ value: 'write', label: 'édition' }, { value: 'read', label: 'lecture' }] },
  ]
  const r = await promptForm({ title: 'Partager le projet', fields, submitLabel: 'Partager' })
  if (!r) return
  try {
    await shareResource('project', String(projectId), String(r.email),
      (r.permission as 'read' | 'write') || 'write')
    toast('partagé'); await loadGrants()
  } catch (e) { toast(humanize(e)) }
}
async function revoke(g: NamespaceShare) {
  if (!g.email) return
  try { await unshareResource('project', String(projectId), g.email); await loadGrants() }
  catch (e) { toast(humanize(e)) }
}
async function transfer() {
  if (!project.value) return
  const r = await promptForm({ title: 'Transférer la propriété',
    description: "L'ancien propriétaire garde l'accès en écriture.",
    fields: [{ key: 'email', label: 'Nouveau propriétaire (email oto)', required: true }], submitLabel: 'Transférer' })
  if (!r) return
  try { await transferResource('project', String(projectId), String(r.email)); toast('transféré'); await Promise.all([load(), loadGrants()]) }
  catch (e) { toast(humanize(e)) }
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
          <button v-if="!readOnly" class="btn-soft" @click="share">partager</button>
          <button v-if="!readOnly" class="btn-soft" @click="transfer">transférer</button>
          <button v-if="!readOnly" class="btn-soft btn-soft--danger" @click="archive">archiver</button>
        </div>
      </header>

      <!-- grille atelier | méta -->
      <div class="wk-grid">
        <!-- colonne atelier : brief + pages + entités liées -->
        <div class="wk-col">

          <!-- brief -->
          <section class="surface-card">
            <div class="card-eb-row">
              <span class="card-eb">brief — point d'entrée de l'agent</span>
              <span class="card-eb-hint">md</span>
            </div>
            <textarea v-model="briefDraft" class="wk-brief" rows="5" :readonly="readOnly"
              placeholder="Le but du projet, le contexte, ce que l'agent doit savoir au démarrage…"></textarea>
            <div v-if="!readOnly" class="wk-brief-act">
              <button class="btn-soft" @click="saveBrief">enregistrer le brief</button>
              <span class="dim" style="font-size: 11px">{{ briefDirty ? 'modifié' : 'enregistré' }}</span>
            </div>
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
              <button v-if="!readOnly" class="btn-soft btn-soft--xs" @click="share">+ inviter</button>
            </div>
            <p v-if="!grants.length" class="dim" style="font-size: 12px">non partagé.</p>
            <div v-for="g in grants" :key="(g.email || '') + g.permission" class="meta-row">
              <span class="meta-row__main">{{ g.email || g.principal_id }}</span>
              <Tag :tone="g.permission === 'write' ? 'olive' : 'cobalt'">{{ g.permission === 'write' ? 'édition' : 'lecture' }}</Tag>
              <button v-if="!readOnly" class="ent__lnk" title="Retirer l'accès" @click="revoke(g)">✕</button>
            </div>
          </section>

          <!-- autres documents -->
          <section class="surface-card">
            <div class="card-eb-row">
              <span class="card-eb">autres documents</span>
              <input ref="fileInput" type="file" style="display: none" @change="onFilePick" />
              <button v-if="!readOnly && !uploading" class="btn-soft btn-soft--xs" @click="fileInput?.click()">+ déposer</button>
              <span v-else-if="uploading" class="dim" style="font-size: 11px">envoi…</span>
            </div>
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
</style>
