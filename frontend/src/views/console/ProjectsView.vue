<script setup lang="ts">
// Projets — couche d'organisation (ADR 0030). Master-détail : liste à gauche, projet
// ouvert à droite (brief + pages/Docs + entités liées + partage + activité). Consomme
// oto_project / oto_doc / oto_resource (POST /api/me/{projects,docs}, /api/resources).
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Btn from '@/components/console/Btn.vue'
import Tag from '@/components/console/Tag.vue'
import ProjectDocs from '@/components/console/ProjectDocs.vue'
import {
  listProjects, getProject, createProject, updateProject, archiveProject,
  linkProject, unlinkProject, getProjectActivity,
  getResource, shareResource, unshareResource, transferResource,
  getNamespaces, getConnectors, getDoctrine, getMementoWorkspaces,
} from '@/api/console'
import type { Project, ProjectLink, ProjectLinkType, ProjectActivity, NamespaceShare } from '@/types/api'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'
import { useToast } from '@/composables/useToast'
import { usePrompt, type PromptField } from '@/composables/usePrompt'

const { toast } = useToast()
const { promptForm, confirmAction } = usePrompt()

const projects = ref<Project[]>([])
const selected = ref<Project | null>(null)
const briefDraft = ref('')
const grants = ref<NamespaceShare[]>([])
const activity = ref<ProjectActivity[]>([])
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
  for (const l of selected.value?.links ?? []) (out[l.target_type] ??= []).push(l)
  return out
})
const briefDirty = computed(() => !!selected.value && briefDraft.value !== (selected.value.brief_md ?? ''))

async function load() {
  try { projects.value = (await listProjects()).projects }
  catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
}
onMounted(load)

async function open(id: number) {
  try {
    selected.value = await getProject(id)
    briefDraft.value = selected.value.brief_md ?? ''
    await Promise.all([loadGrants(), loadActivity()])
  } catch (e) { toast(humanize(e)) }
}
async function loadGrants() {
  if (!selected.value) return
  try { grants.value = (await getResource('project', String(selected.value.id))).grants }
  catch { grants.value = [] }
}
async function loadActivity() {
  if (!selected.value) return
  try { activity.value = (await getProjectActivity(selected.value.id)).activity }
  catch { activity.value = [] }
}

async function create() {
  const r = await promptForm({
    title: 'Nouveau projet', description: 'Un conteneur de travail (un but + ses entités).',
    fields: [{ key: 'name', label: 'Nom', required: true, placeholder: 'Prospection Marseille' }],
    submitLabel: 'Créer',
  })
  if (!r) return
  try { const p = await createProject(String(r.name)); toast('projet créé'); await load(); await open(p.id) }
  catch (e) { toast(humanize(e)) }
}

async function saveBrief() {
  if (!selected.value) return
  try {
    selected.value = { ...selected.value, ...(await updateProject(selected.value.id, { brief_md: briefDraft.value })) }
    await loadActivity(); toast('brief enregistré')
  } catch (e) { toast(humanize(e)) }
}

async function archive() {
  if (!selected.value) return
  if (!await confirmAction({ title: 'Archiver le projet', danger: true, confirmLabel: 'Archiver',
    message: `Archiver « ${selected.value.name} » ?` })) return
  try { await archiveProject(selected.value.id); selected.value = null; await load(); toast('projet archivé') }
  catch (e) { toast(humanize(e)) }
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
const linkLabelEdited = ref(false)
const linkOpts = ref<LinkOption[]>([])
const linkLoading = ref(false)

function startLinking() {
  linking.value = true
  linkType.value = ''; linkRef.value = ''; linkLabel.value = ''
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
  if (!selected.value || !t || !linkRef.value) return
  const label = linkLabel.value.trim() || linkOpts.value.find((o) => o.value === linkRef.value)?.label
  try {
    const { links } = await linkProject(selected.value.id, t, linkRef.value, label)
    selected.value = { ...selected.value, links }; await loadActivity()
    linking.value = false
  } catch (e) { toast(humanize(e)) }
}
async function removeLink(l: ProjectLink) {
  if (!selected.value) return
  if (!await confirmAction({ title: 'Délier', danger: true, confirmLabel: 'Délier',
    message: `Délier ${l.label || l.target_ref} ?` })) return
  try {
    const { links } = await unlinkProject(selected.value.id, l.target_type, l.target_ref)
    selected.value = { ...selected.value, links }; await loadActivity()
  } catch (e) { toast(humanize(e)) }
}

// ── partage / transfert (oto_resource) ──
async function share() {
  if (!selected.value) return
  const fields: PromptField[] = [
    { key: 'email', label: 'Email (utilisateur oto)', required: true },
    { key: 'permission', label: 'Droit', type: 'select',
      options: [{ value: 'write', label: 'édition' }, { value: 'read', label: 'lecture' }] },
  ]
  const r = await promptForm({ title: 'Partager le projet', fields, submitLabel: 'Partager' })
  if (!r) return
  try {
    await shareResource('project', String(selected.value.id), String(r.email),
      (r.permission as 'read' | 'write') || 'write')
    toast('partagé'); await loadGrants()
  } catch (e) { toast(humanize(e)) }
}
async function revoke(g: NamespaceShare) {
  if (!selected.value || !g.email) return
  try { await unshareResource('project', String(selected.value.id), g.email); await loadGrants() }
  catch (e) { toast(humanize(e)) }
}
async function transfer() {
  if (!selected.value) return
  const r = await promptForm({ title: 'Transférer la propriété',
    description: "L'ancien propriétaire garde l'accès en écriture.",
    fields: [{ key: 'email', label: 'Nouveau propriétaire (email oto)', required: true }], submitLabel: 'Transférer' })
  if (!r) return
  try { await transferResource('project', String(selected.value.id), String(r.email)); toast('transféré'); await load(); await loadGrants() }
  catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="content-inner fadein">
    <ConsoleCard title="projects"
      sub="conteneurs de travail (un but + ses entités). couche d'organisation — partageable, reprenable.">
      <template #actions><Btn kind="mini" @click="create">+ Nouveau projet</Btn></template>
      <p v-if="error" class="dim" style="font-size: 13px">{{ error }}</p>
      <p v-else-if="!loaded" class="dim" style="font-size: 13px">chargement…</p>
    </ConsoleCard>

    <div v-if="loaded && !error" class="pj-grid">
      <ConsoleCard flush title="mes projets" :sub="`${projects.length}`">
        <p v-if="!projects.length" class="dim" style="font-size: 12.5px; padding: 0 14px 12px">aucun projet — crée-en un.</p>
        <ul v-else class="pj-list">
          <li v-for="p in projects" :key="p.id" :class="{ on: selected?.id === p.id }" @click="open(p.id)">
            <div style="font-weight: 600; color: var(--color-ink)">{{ p.name }}</div>
            <div class="dim" style="font-size: 11px">{{ p.owner_type === 'org' ? 'org' : 'perso' }} · maj {{ fmtDate(p.updated_at) }}</div>
          </li>
        </ul>
      </ConsoleCard>

      <ConsoleCard v-if="selected" :title="selected.name"
        :sub="selected.owner_type === 'org' ? 'projet d\'org' : 'projet perso'">
        <template #actions>
          <Btn kind="mini" @click="share">Partager</Btn>
          <Btn kind="mini" @click="transfer">Transférer</Btn>
          <Btn kind="danger" @click="archive">Archiver</Btn>
        </template>

        <div class="subh">Brief — point d'entrée</div>
        <textarea v-model="briefDraft" class="pj-brief" rows="5"
          placeholder="Le but du projet, le contexte, ce que l'agent doit savoir au démarrage…"></textarea>
        <div style="margin-top: 6px">
          <Btn kind="mini" @click="saveBrief">Enregistrer le brief</Btn>
          <span v-if="briefDirty" class="dim" style="font-size: 11px; margin-left: 8px">modifié</span>
        </div>

        <ProjectDocs :project-id="selected.id" @changed="loadActivity" />

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
          <div class="pj-linkform__act">
            <button class="pj-x" @click="cancelLinking">annuler</button>
            <Btn kind="mini" :disabled="!linkRef" @click="submitLink">Lier</Btn>
          </div>
        </div>

        <div v-for="g in LINK_GROUPS" :key="g.type" class="pj-linkgroup">
          <template v-if="linksByType[g.type]?.length">
            <div class="dim" style="font-size: 11px; font-weight: 700; margin: 2px 0">{{ g.label }}</div>
            <div v-for="l in linksByType[g.type]" :key="l.target_ref" class="pj-link">
              <span style="flex: 1; color: var(--color-ink)">{{ l.label || l.target_ref }}</span>
              <button class="pj-x" @click="removeLink(l)">✕</button>
            </div>
          </template>
        </div>
        <p v-if="!(selected.links?.length)" class="dim" style="font-size: 12px">aucune entité liée — utilise « + lier ».</p>

        <div class="subh">Partage</div>
        <p v-if="!grants.length" class="dim" style="font-size: 12px">non partagé.</p>
        <div v-for="g in grants" :key="(g.email || '') + g.permission" class="pj-link">
          <span style="flex: 1; color: var(--color-ink)">{{ g.email || g.principal_id }}</span>
          <Tag :tone="g.permission === 'write' ? 'olive' : 'cobalt'">{{ g.permission === 'write' ? 'édition' : 'lecture' }}</Tag>
          <button class="pj-x" @click="revoke(g)">✕</button>
        </div>

        <div class="subh">Activité</div>
        <p v-if="!activity.length" class="dim" style="font-size: 12px">aucune activité.</p>
        <div v-for="(a, i) in activity" :key="i" class="pj-act">
          <span class="dim" style="font-size: 11px; width: 92px; flex: none">{{ fmtDate(a.created_at) }}</span>
          <span style="flex: 1"><b style="font-weight: 600">{{ a.action }}</b>
            <span v-if="a.detail" class="dim"> · {{ a.detail }}</span></span>
        </div>
      </ConsoleCard>
      <ConsoleCard v-else sub="sélectionne un projet à gauche, ou crée-en un.">
        <div class="dim" style="font-size: 12.5px; padding: 8px 0">aucun projet ouvert.</div>
      </ConsoleCard>
    </div>
  </div>
</template>

<style scoped>
.pj-grid { display: grid; grid-template-columns: 300px 1fr; gap: 12px; align-items: start; }
@media (max-width: 820px) { .pj-grid { grid-template-columns: 1fr; } }
.pj-list { list-style: none; margin: 0; padding: 0; }
.pj-list li { padding: 9px 14px; border-top: 1px solid var(--color-hair-soft, #e6e6e3); cursor: pointer; }
.pj-list li:first-child { border-top: 0; }
.pj-list li:hover { background: #faf9f7; }
.pj-list li.on { background: var(--color-paper-3, #f5f1e8); box-shadow: inset 3px 0 0 var(--color-ink, #2a2a2a); }
.pj-brief { width: 100%; border: 1px solid var(--color-hair-soft, #cfcfcf); border-radius: 8px; padding: 9px 11px; font: inherit; font-size: 13px; line-height: 1.5; resize: vertical; background: #fff; color: var(--color-ink, #2a2a2a); }
.pj-linkform { display: flex; flex-direction: column; gap: 9px; padding: 11px 12px; margin-bottom: 10px; border: 1px solid var(--color-hair-soft, #e0ddd6); border-radius: 9px; background: #faf9f7; }
.pj-fld { display: flex; flex-direction: column; gap: 4px; }
.pj-fld__lbl { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--color-faint, #9a9a9a); }
.pj-input { width: 100%; border: 1px solid var(--color-hair-soft, #cfcfcf); border-radius: 7px; padding: 7px 9px; font: inherit; font-size: 13px; background: #fff; color: var(--color-ink, #2a2a2a); }
.pj-input:disabled { opacity: .55; cursor: not-allowed; }
.pj-linkform__act { display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 2px; }
.pj-linkgroup { margin-bottom: 6px; }
.pj-link { display: flex; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--color-hair-soft, #ececec); }
.pj-act { display: flex; gap: 8px; padding: 3px 0; font-size: 12px; color: var(--color-ink-soft, #4a463d); }
.pj-x { border: 1px solid var(--color-hair-soft, #cfcfcf); background: #fff; border-radius: 6px; padding: 2px 7px; font-size: 11px; color: var(--color-ink-soft, #6b6b6b); cursor: pointer; }
.subh { margin: 16px 0 6px; font-size: 11px; color: var(--color-faint, #9a9a9a); text-transform: uppercase; letter-spacing: .05em; }
</style>
