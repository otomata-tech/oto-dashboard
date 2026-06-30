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

// ── liens : picker des vraies entités (incrément 6) ──
async function entitiesFor(type: ProjectLinkType): Promise<{ value: string; label: string }[]> {
  if (type === 'tableau') return (await getNamespaces()).namespaces.map((n) => ({ value: String(n.id), label: n.namespace }))
  if (type === 'connecteur') return (await getConnectors()).connectors.map((c) => ({ value: c.name, label: c.label || c.name }))
  if (type === 'procedure') return ((await getDoctrine()).instructions ?? []).map((i) => ({ value: i.slug, label: i.title }))
  const w = await getMementoWorkspaces()
  const seen = new Set<string>()
  return [...w.orgs.flatMap((o) => o.workspaces), ...w.shared, ...w.pinned]
    .filter((x) => !seen.has(x.slug) && seen.add(x.slug))
    .map((x) => ({ value: x.slug, label: x.name }))
}
async function addLinkOf(type: ProjectLinkType) {
  if (!selected.value) return
  let opts: { value: string; label: string }[]
  try { opts = await entitiesFor(type) } catch (e) { toast(humanize(e)); return }
  if (!opts.length) { toast('aucune entité de ce type à lier'); return }
  const r = await promptForm({
    title: `Lier — ${LINK_GROUPS.find((g) => g.type === type)?.label}`,
    fields: [{ key: 'ref', label: 'Entité', type: 'select', required: true, options: opts }],
    submitLabel: 'Lier',
  })
  if (!r) return
  const label = opts.find((o) => o.value === r.ref)?.label
  try {
    const { links } = await linkProject(selected.value.id, type, String(r.ref), label)
    selected.value = { ...selected.value, links }; await loadActivity()
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

        <div class="subh">Entités liées</div>
        <div v-for="g in LINK_GROUPS" :key="g.type" class="pj-linkgroup">
          <div style="display: flex; align-items: center; margin: 2px 0">
            <span class="dim" style="font-size: 11px; font-weight: 700">{{ g.label }}</span>
            <button class="pj-x" style="margin-left: auto" @click="addLinkOf(g.type)">+ lier</button>
          </div>
          <div v-for="l in linksByType[g.type] || []" :key="l.target_ref" class="pj-link">
            <span style="flex: 1; color: var(--color-ink)">{{ l.label || l.target_ref }}</span>
            <button class="pj-x" @click="removeLink(l)">✕</button>
          </div>
        </div>

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
.pj-linkgroup { margin-bottom: 6px; }
.pj-link { display: flex; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--color-hair-soft, #ececec); }
.pj-act { display: flex; gap: 8px; padding: 3px 0; font-size: 12px; color: var(--color-ink-soft, #4a463d); }
.pj-x { border: 1px solid var(--color-hair-soft, #cfcfcf); background: #fff; border-radius: 6px; padding: 2px 7px; font-size: 11px; color: var(--color-ink-soft, #6b6b6b); cursor: pointer; }
.subh { margin: 16px 0 6px; font-size: 11px; color: var(--color-faint, #9a9a9a); text-transform: uppercase; letter-spacing: .05em; }
</style>
