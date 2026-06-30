<script setup lang="ts">
// Page DÉDIÉE d'un projet — `/projects/:id` (objet de premier rang, ADR 0030 ; pas
// un volet de liste). Charge un seul projet par id de route, remonté par le layout
// quand :id change (viewKey = fullPath). Brief + pages/Docs + entités liées (vrais
// sélecteurs) + partage + activité. Consomme oto_project / oto_doc / oto_resource.
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Btn from '@/components/console/Btn.vue'
import Tag from '@/components/console/Tag.vue'
import ProjectDocs from '@/components/console/ProjectDocs.vue'
import {
  getProject, updateProject, archiveProject, copyProject, setProjectTemplate, projectHandoff,
  linkProject, unlinkProject, getProjectActivity,
  getResource, shareResource, unshareResource, transferResource,
  getNamespaces, getConnectors, getDoctrine, getMementoWorkspaces,
  getConnectorIdentities,
  listProjectFiles, uploadProjectFile, deleteProjectFile, setProjectFilePublic,
} from '@/api/console'
import type { Project, ProjectLink, ProjectLinkType, ProjectActivity, NamespaceShare, ConnectorIdentity, ProjectFile } from '@/types/api'
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

const LINK_GROUPS: { type: ProjectLinkType; label: string }[] = [
  { type: 'tableau', label: 'Tableaux' },
  { type: 'procedure', label: 'Procédures' },
  { type: 'connecteur', label: 'Connecteurs' },
  { type: 'base', label: 'Bases de connaissances' },
]
const linksByType = computed(() => {
  const out: Record<string, ProjectLink[]> = {}
  for (const l of project.value?.links ?? []) (out[l.target_type] ??= []).push(l)
  return out
})
const briefDirty = computed(() => !!project.value && briefDraft.value !== (project.value.brief_md ?? ''))
const readOnly = computed(() => project.value?.can_write === false)   // #4b — proposer une modif au lieu d'éditer

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

// ── liens : formulaire « Lier une entité » à vrais sélecteurs (type → entité) ──
// La référence n'est plus saisie à la main (id/slug/nom) : on choisit le type, puis
// l'entité dans la liste réelle de ce type. Le nom affiché se pré-remplit du libellé.
type LinkOption = { value: string; label: string }
async function entitiesFor(type: ProjectLinkType): Promise<LinkOption[]> {
  if (type === 'tableau') return (await getNamespaces()).namespaces.map((n) => ({ value: String(n.id), label: n.namespace }))
  if (type === 'connecteur') return (await getConnectors()).connectors.map((c) => ({ value: c.name, label: c.label || c.name }))
  if (type === 'procedure') return ((await getDoctrine()).instructions ?? []).map((i) => ({ value: i.slug, label: i.title }))
  const w = await getMementoWorkspaces()
  const seen = new Set<string>()
  return [...w.orgs.flatMap((o) => o.workspaces), ...w.shared, ...w.pinned]
    .filter((x) => !seen.has(x.slug) && seen.add(x.slug))
    .map((x) => ({ value: x.slug, label: x.name }))
}

const linking = ref(false)
const linkType = ref<ProjectLinkType | ''>('')
const linkRef = ref('')
const linkLabel = ref('')
const linkRole = ref('')
const linkLabelEdited = ref(false)
const linkOpts = ref<LinkOption[]>([])
const linkLoading = ref(false)

function startLinking() {
  linking.value = true
  linkType.value = ''; linkRef.value = ''; linkLabel.value = ''; linkRole.value = ''
  linkLabelEdited.value = false; linkOpts.value = []
}
function cancelLinking() { linking.value = false }

async function onTypeChange() {
  linkRef.value = ''; linkLabel.value = ''; linkLabelEdited.value = false; linkOpts.value = []
  const t = linkType.value
  if (!t) return
  linkLoading.value = true
  try { linkOpts.value = await entitiesFor(t) }
  catch (e) { toast(humanize(e)) }
  finally { linkLoading.value = false }
}
function onRefChange() {
  if (!linkLabelEdited.value) linkLabel.value = linkOpts.value.find((o) => o.value === linkRef.value)?.label ?? ''
}
async function submitLink() {
  const t = linkType.value
  if (!project.value || !t || !linkRef.value) return
  const label = linkLabel.value.trim() || linkOpts.value.find((o) => o.value === linkRef.value)?.label
  const role = linkRole.value.trim() || undefined
  try {
    const { links } = await linkProject(projectId, t, linkRef.value, label, role)
    project.value = { ...project.value, links }; await loadActivity()
    linking.value = false
  } catch (e) { toast(humanize(e)) }
}
// ── surcharge connecteur préfaite par projet (ADR 0032 §4, B2) ──
// Un connecteur lié peut être reconfiguré POUR CE PROJET : quelle identité (compte) +
// instructions de surcharge en prose. Préfait ici, lu par l'agent au chargement du projet.
const cfgRef = ref<string | null>(null)       // target_ref du connecteur en cours d'édition
const cfgIdentity = ref('')
const cfgInstructions = ref('')
const cfgIdentities = ref<ConnectorIdentity[]>([])
const cfgIdentitiesSupported = ref(false)
const cfgLoading = ref(false)
const cfgSaving = ref(false)

async function openConfig(l: ProjectLink) {
  cfgRef.value = l.target_ref
  cfgIdentity.value = l.config?.identity_id ?? ''
  cfgInstructions.value = l.config?.instructions_md ?? ''
  cfgIdentities.value = []; cfgIdentitiesSupported.value = false
  cfgLoading.value = true
  try {
    const r = await getConnectorIdentities(l.target_ref)
    cfgIdentitiesSupported.value = r.supported
    cfgIdentities.value = r.identities
  } catch { /* identité non gérée par ce connecteur — on garde juste les instructions */ }
  finally { cfgLoading.value = false }
}
function closeConfig() { cfgRef.value = null }

async function saveConfig(l: ProjectLink) {
  if (!project.value) return
  const config = {
    identity_id: cfgIdentity.value || undefined,
    instructions_md: cfgInstructions.value.trim() || undefined,
  }
  cfgSaving.value = true
  try {
    const { links } = await linkProject(projectId, 'connecteur', l.target_ref, l.label ?? undefined, l.role ?? undefined, config)
    project.value = { ...project.value, links }; await loadActivity()
    cfgRef.value = null; toast('surcharge enregistrée')
  } catch (e) { toast(humanize(e)) }
  finally { cfgSaving.value = false }
}

async function removeLink(l: ProjectLink) {
  if (!project.value) return
  if (!await confirmAction({ title: 'Délier', danger: true, confirmLabel: 'Délier',
    message: `Délier ${l.label || l.target_ref} ?` })) return
  try {
    const { links } = await unlinkProject(projectId, l.target_type, l.target_ref)
    project.value = { ...project.value, links }; await loadActivity()
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
    <RouterLink to="/projects" class="pjd-back">← projets</RouterLink>

    <ConsoleCard v-if="error" sub="ce projet n'a pas pu être chargé.">
      <p class="dim" style="font-size: 13px">{{ error }}</p>
    </ConsoleCard>
    <ConsoleCard v-else-if="!loaded" sub="chargement…">
      <p class="dim" style="font-size: 13px">chargement du projet…</p>
    </ConsoleCard>

    <div v-else-if="project" class="pjd-grid">
      <!-- colonne principale : brief + docs + entités liées -->
      <div class="pjd-main">
        <ConsoleCard :title="project.name"
          :sub="project.owner_type === 'org' ? 'projet d\'org — partagé avec l\'équipe' : 'projet perso'">
          <template #actions>
            <Btn kind="mini" @click="handoff">Reprendre dans Claude</Btn>
            <Btn kind="mini" @click="copy">Copier ce projet</Btn>
            <Btn kind="mini" @click="toggleTemplate">{{ project.is_template ? 'Retirer des modèles' : 'Publier comme modèle' }}</Btn>
            <Btn kind="mini" @click="share">Partager</Btn>
            <Btn kind="mini" @click="transfer">Transférer</Btn>
            <Btn kind="danger" @click="archive">Archiver</Btn>
          </template>

          <div class="subh">Brief — point d'entrée</div>
          <textarea v-model="briefDraft" class="pj-brief" rows="6"
            placeholder="Le but du projet, le contexte, ce que l'agent doit savoir au démarrage…"></textarea>
          <div style="margin-top: 6px">
            <Btn kind="mini" @click="saveBrief">Enregistrer le brief</Btn>
            <span v-if="briefDirty" class="dim" style="font-size: 11px; margin-left: 8px">modifié</span>
          </div>

          <ProjectDocs :project-id="project.id" :read-only="readOnly" @changed="loadActivity" />

          <div class="subh" style="display: flex; align-items: center">
            <span>Entités liées</span>
            <button v-if="!linking" class="pj-x" style="margin-left: auto" @click="startLinking">+ lier</button>
          </div>

          <div v-if="linking" class="pj-linkform">
            <label class="pj-fld">
              <span class="pj-fld__lbl">Type</span>
              <select v-model="linkType" class="pj-input" @change="onTypeChange">
                <option value="" disabled>choisir…</option>
                <option v-for="g in LINK_GROUPS" :key="g.type" :value="g.type">{{ g.label }}</option>
              </select>
            </label>
            <label class="pj-fld">
              <span class="pj-fld__lbl">Entité</span>
              <select v-model="linkRef" class="pj-input" :disabled="!linkType || linkLoading" @change="onRefChange">
                <option value="" disabled>{{ linkLoading ? 'chargement…' : !linkType ? 'choisis un type' : linkOpts.length ? 'choisir…' : 'aucune entité de ce type' }}</option>
                <option v-for="o in linkOpts" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
            </label>
            <label class="pj-fld">
              <span class="pj-fld__lbl">Nom affiché <span class="dim" style="font-weight: 400; text-transform: none; letter-spacing: 0">(optionnel)</span></span>
              <input v-model="linkLabel" class="pj-input" placeholder="(optionnel — par défaut le nom de l'entité)" @input="linkLabelEdited = true" />
            </label>
            <label class="pj-fld">
              <span class="pj-fld__lbl">Rôle <span class="dim" style="font-weight: 400; text-transform: none; letter-spacing: 0">(optionnel)</span></span>
              <input v-model="linkRole" class="pj-input" placeholder="pourquoi cette entité est ici / ce qu'elle apporte au projet" />
            </label>
            <div class="pj-linkform__act">
              <button class="pj-x" @click="cancelLinking">annuler</button>
              <Btn kind="mini" :disabled="!linkRef" @click="submitLink">Lier</Btn>
            </div>
          </div>

          <div v-for="g in LINK_GROUPS" :key="g.type" class="pj-linkgroup">
            <template v-if="linksByType[g.type]?.length">
              <div class="dim" style="font-size: 11px; font-weight: 700; margin: 2px 0">{{ g.label }}</div>
              <div v-for="l in linksByType[g.type]" :key="l.target_ref" class="pj-linkwrap">
                <div class="pj-link" style="align-items: flex-start">
                  <div style="flex: 1; min-width: 0">
                    <div style="display: flex; align-items: center; gap: 6px">
                      <span style="color: var(--color-ink)">{{ l.label || l.target_ref }}</span>
                      <Tag v-if="l.cross_project" tone="saffron" title="Cette entité est aussi liée par un autre projet — éviter les modifications brutales">partagé</Tag>
                      <Tag v-if="g.type === 'connecteur' && (l.config?.identity_id || l.config?.instructions_md)" tone="olive" title="Connecteur reconfiguré pour ce projet">surchargé</Tag>
                    </div>
                    <div v-if="l.role" class="dim" style="font-size: 11px; margin-top: 2px">{{ l.role }}</div>
                    <div v-if="g.type === 'connecteur' && l.config?.instructions_md" class="dim pj-cfg-note" style="margin-top: 2px">↳ {{ l.config.instructions_md }}</div>
                  </div>
                  <button v-if="g.type === 'connecteur'" class="pj-x" @click="cfgRef === l.target_ref ? closeConfig() : openConfig(l)">configurer</button>
                  <button class="pj-x" @click="removeLink(l)">✕</button>
                </div>

                <div v-if="g.type === 'connecteur' && cfgRef === l.target_ref" class="pj-cfgform">
                  <p class="dim" style="font-size: 11px; margin: 0 0 2px">Surcharge de ce connecteur <b>pour ce projet</b> — préparée ici, appliquée par l'agent au chargement du projet.</p>
                  <label v-if="cfgIdentitiesSupported && cfgIdentities.length" class="pj-fld">
                    <span class="pj-fld__lbl">Identité (compte)</span>
                    <select v-model="cfgIdentity" class="pj-input">
                      <option value="">(défaut du compte)</option>
                      <option v-for="idn in cfgIdentities" :key="idn.id" :value="idn.id">{{ idn.label || idn.id }}{{ idn.channel ? ` · ${idn.channel}` : '' }}</option>
                    </select>
                  </label>
                  <p v-else-if="cfgLoading" class="dim" style="font-size: 11px">chargement des identités…</p>
                  <label class="pj-fld">
                    <span class="pj-fld__lbl">Instructions de surcharge <span class="dim" style="font-weight: 400; text-transform: none; letter-spacing: 0">(prose, optionnel)</span></span>
                    <textarea v-model="cfgInstructions" class="pj-input" rows="3" placeholder="ex. ne filtrer les accords que par thème mutuelle"></textarea>
                  </label>
                  <div class="pj-linkform__act">
                    <button class="pj-x" @click="closeConfig">annuler</button>
                    <Btn kind="mini" :disabled="cfgSaving" @click="saveConfig(l)">Enregistrer</Btn>
                  </div>
                </div>
              </div>
            </template>
          </div>
          <p v-if="!(project.links?.length)" class="dim" style="font-size: 12px">aucune entité liée — utilise « + lier ».</p>

          <div class="subh" style="display: flex; align-items: center">
            <span>Autre document</span>
            <input ref="fileInput" type="file" style="display: none" @change="onFilePick" />
            <button v-if="!uploading" class="pj-x" style="margin-left: auto" @click="fileInput?.click()">+ déposer</button>
            <span v-else class="dim" style="margin-left: auto; font-size: 11px">envoi…</span>
          </div>
          <div v-for="f in files" :key="f.id" class="pj-link" style="align-items: flex-start">
            <div style="flex: 1; min-width: 0">
              <a v-if="f.public && f.public_url" :href="f.public_url" target="_blank" rel="noopener" style="color: var(--color-ink)">{{ f.title || f.filename }}</a>
              <a v-else-if="f.download_url" :href="f.download_url" target="_blank" rel="noopener" style="color: var(--color-ink)">{{ f.title || f.filename }}</a>
              <span v-else style="color: var(--color-ink)">{{ f.title || f.filename }}</span>
              <span class="dim" style="font-size: 11px; margin-left: 6px">{{ fmtSize(f.size_bytes) }}</span>
              <Tag v-if="f.public" tone="cobalt" title="Partagé publiquement — accessible par lien">public</Tag>
              <div v-if="f.description" class="dim" style="font-size: 11px; margin-top: 2px">{{ f.description }}</div>
            </div>
            <button class="pj-x" :title="f.public ? 'Rendre privé' : 'Partager publiquement (copie le lien)'" @click="toggleFilePublic(f)">{{ f.public ? '🔓' : '🔗' }}</button>
            <button class="pj-x" @click="removeFile(f)">✕</button>
          </div>
          <p v-if="!files.length" class="dim" style="font-size: 12px">aucun fichier brut — PDF, HTML… via « + déposer ».</p>
        </ConsoleCard>
      </div>

      <!-- aside : partage + activité -->
      <div class="pjd-aside">
        <ConsoleCard title="Partage">
          <p v-if="!grants.length" class="dim" style="font-size: 12px">non partagé.</p>
          <div v-for="g in grants" :key="(g.email || '') + g.permission" class="pj-link">
            <span style="flex: 1; color: var(--color-ink)">{{ g.email || g.principal_id }}</span>
            <Tag :tone="g.permission === 'write' ? 'olive' : 'cobalt'">{{ g.permission === 'write' ? 'édition' : 'lecture' }}</Tag>
            <button class="pj-x" @click="revoke(g)">✕</button>
          </div>
        </ConsoleCard>

        <ConsoleCard title="Activité">
          <p v-if="!activity.length" class="dim" style="font-size: 12px">aucune activité.</p>
          <div v-for="(a, i) in activity" :key="i" class="pj-act">
            <span class="dim" style="font-size: 11px; width: 92px; flex: none">{{ fmtDate(a.created_at) }}</span>
            <span style="flex: 1"><b style="font-weight: 600">{{ a.action }}</b>
              <span v-if="a.detail" class="dim"> · {{ a.detail }}</span></span>
          </div>
        </ConsoleCard>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pjd-back { display: inline-block; margin-bottom: 10px; font-size: 12.5px; color: var(--color-ink-soft, #6b6b6b); text-decoration: none; }
.pjd-back:hover { color: var(--color-ink, #2a2a2a); }
.pjd-grid { display: grid; grid-template-columns: 1fr 320px; gap: 12px; align-items: start; }
@media (max-width: 900px) { .pjd-grid { grid-template-columns: 1fr; } }
.pjd-aside { display: flex; flex-direction: column; gap: 12px; }
.pj-brief { width: 100%; border: 1px solid var(--color-hair-soft, #cfcfcf); border-radius: 8px; padding: 9px 11px; font: inherit; font-size: 13px; line-height: 1.5; resize: vertical; background: #fff; color: var(--color-ink, #2a2a2a); }
.pj-linkform { display: flex; flex-direction: column; gap: 9px; padding: 11px 12px; margin-bottom: 10px; border: 1px solid var(--color-hair-soft, #e0ddd6); border-radius: 9px; background: #faf9f7; }
.pj-fld { display: flex; flex-direction: column; gap: 4px; }
.pj-fld__lbl { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--color-faint, #9a9a9a); }
.pj-input { width: 100%; border: 1px solid var(--color-hair-soft, #cfcfcf); border-radius: 7px; padding: 7px 9px; font: inherit; font-size: 13px; background: #fff; color: var(--color-ink, #2a2a2a); }
.pj-input:disabled { opacity: .55; cursor: not-allowed; }
.pj-linkform__act { display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 2px; }
.pj-linkgroup { margin-bottom: 6px; }
.pj-linkwrap { border-bottom: 1px solid var(--color-hair-soft, #ececec); }
.pj-linkwrap .pj-link { border-bottom: none; }
.pj-cfg-note { font-size: 11px; font-style: italic; white-space: pre-wrap; overflow-wrap: anywhere; }
.pj-cfgform { display: flex; flex-direction: column; gap: 9px; padding: 10px 11px 11px; margin: 2px 0 8px; border: 1px solid var(--color-hair-soft, #e0ddd6); border-radius: 9px; background: #faf9f7; }
.pj-link { display: flex; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--color-hair-soft, #ececec); }
.pj-act { display: flex; gap: 8px; padding: 3px 0; font-size: 12px; color: var(--color-ink-soft, #4a463d); }
.pj-x { border: 1px solid var(--color-hair-soft, #cfcfcf); background: #fff; border-radius: 6px; padding: 2px 7px; font-size: 11px; color: var(--color-ink-soft, #6b6b6b); cursor: pointer; }
.subh { margin: 16px 0 6px; font-size: 11px; color: var(--color-faint, #9a9a9a); text-transform: uppercase; letter-spacing: .05em; }
</style>
