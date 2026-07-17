<script setup lang="ts">
// Page DÉDIÉE d'un projet — `/projects/:id` (objet de premier rang, ADR 0030). Refonte UX
// (ADR « refonte projets ») : chef d'orchestre du NAVIGATEUR de contenu. En-tête injecté
// dans le topbar global (TopbarPage — fin du double en-tête) : tags + avatars + Partager ·
// Historique · Reprendre dans Claude · ••• — plus de titre local (nom du projet retiré,
// pas de doublon avec le topbar). Corps = viewer polymorphe (gauche) + rail d'entités
// (droite) ; audit en bandeau pleine largeur ; partage en modale, activité en drawer. La
// logique data (get/update/link/doc/file…) est CONSERVÉE — c'est le rendu qui est ré-agencé.
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useScopedLink } from '@/composables/useScopedLink'
import Tag from '@/components/console/Tag.vue'
import Icon from '@/components/console/Icon.vue'
import NameDialog from '@/components/console/NameDialog.vue'
import TopbarPage from '@/components/console/TopbarPage.vue'
import ProjectRail from '@/components/console/project/ProjectRail.vue'
import ProjectViewer from '@/components/console/project/ProjectViewer.vue'
import ProjectShareDialog from '@/components/console/project/ProjectShareDialog.vue'
import ProjectHistoryDrawer from '@/components/console/project/ProjectHistoryDrawer.vue'
import EntityPickerDialog from '@/components/console/project/EntityPickerDialog.vue'
import type { RailGroup, RailItem } from '@/components/console/project/rail'
import {
  getProject, updateProject, archiveProject, copyProject, setProjectTemplate, projectHandoff,
  getProjectActivity, getResource, listProjectFiles, listDocs, getProjectInventory,
} from '@/api/console'
import type { ProjectAudit } from '@/api/console'
import type { Project, ProjectLink, ProjectActivity, NamespaceShare, ProjectFile, Doc } from '@/types/api'
import { humanize } from '@/lib/errors'
import { useToast } from '@/composables/useToast'

const route = useRoute()
const router = useRouter()
const { toast } = useToast()

const projectId = Number(route.params.id)
const project = ref<Project | null>(null)
const grants = ref<NamespaceShare[]>([])
const activity = ref<ProjectActivity[]>([])
const files = ref<ProjectFile[]>([])
const docs = ref<Doc[]>([])
const audit = ref<ProjectAudit | null>(null)
// Source de chaque connecteur du projet (ADR 0035/0044) : 'declared' (lié au projet)
// vs 'procedure:<slug>' / 'run' (requis par une procédure). Sert à distinguer dans le rail.
const connectorSources = ref<Record<string, string[]>>({})
const loaded = ref(false)
const error = ref<string | null>(null)

const sel = ref<string>('home')
const shareOpen = ref(false)
const histOpen = ref(false)
const menuOpen = ref(false)
const copyOpen = ref(false)
const renameOpen = ref(false)
// picker d'ajout : { kind, parentId? } ouvert par un (+) du rail ou « + sous-page »
const addKind = ref<null | 'connecteur' | 'tableau' | 'procedure' | 'page' | 'file'>(null)
const addParent = ref<number | null>(null)

const readOnly = computed(() => project.value?.can_write === false)
const links = computed<ProjectLink[]>(() => project.value?.links ?? [])
const auditIssues = computed(() => !!audit.value
  && audit.value.dead_links.length + audit.value.unbound_slots.length + audit.value.inert_procedures.length > 0)
const auditLines = computed<string[]>(() => {
  const a = audit.value
  if (!a) return []
  return [
    ...a.dead_links.map((d) => `Lien mort — ${d.target_type} « ${d.target_ref} » : ${d.why}`),
    ...a.unbound_slots.map((u) => `Procédure « ${u.procedure} » : slots déclarés non bindés dans ce projet — ${u.slots.join(', ')}`),
    ...a.inert_procedures.map((s) => `Procédure « ${s} » liée mais jamais déroulée dans ce projet.`),
  ]
})

// ── en-tête : tags + avatars ──
const statusTags = computed(() => {
  const out: { tone: 'saffron' | 'cobalt'; label: string }[] = []
  if (project.value?.is_template) out.push({ tone: 'saffron', label: 'modèle' })
  if (readOnly.value) out.push({ tone: 'cobalt', label: 'lecture' })
  return out
})
const AV_PALETTE = [
  { bg: 'var(--color-cobalt-soft)', fg: 'var(--color-cobalt-ink)' },
  { bg: 'var(--color-saffron-soft)', fg: 'var(--color-saffron-ink)' },
  { bg: 'var(--color-olive-soft)', fg: 'var(--color-olive-ink)' },
]
function initialsOf(g: NamespaceShare): string {
  const s = g.label || g.email || String(g.principal_id || '?')
  return s.replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?'
}
const avatars = computed(() => grants.value.slice(0, 3).map((g, i) => ({ initials: initialsOf(g), ...AV_PALETTE[i % AV_PALETTE.length] })))
const moreCount = computed(() => Math.max(0, grants.value.length - 3))

// ── rail : groupes dérivés (pages + liens + fichiers) ──
function bindingKey(l: ProjectLink): string { return `link:${l.target_type}:${l.target_ref}|${l.identity_ref ?? ''}` }
function linkName(l: ProjectLink): string { return l.label || l.title || l.namespace || l.target_ref }
function linksOf(t: string): ProjectLink[] { return links.value.filter((l) => l.target_type === t) }

const railGroups = computed<RailGroup[]>(() => {
  // Pages : accueil (brief) + arbre de docs (top-level puis enfants).
  const pageItems: RailItem[] = [{ key: 'home', kind: 'page', label: 'Accueil · Brief', home: true, pad: 0 }]
  const top = docs.value.filter((d) => d.parent_id == null)
  for (const d of top) {
    pageItems.push({ key: `doc:${d.id}`, kind: 'page', label: d.title, doc: d, pad: 0, hint: d.description })
    for (const c of docs.value.filter((x) => x.parent_id === d.id))
      pageItems.push({ key: `doc:${c.id}`, kind: 'page', label: c.title, doc: c, parentKey: `doc:${d.id}`, pad: 1, hint: c.description })
  }
  const mkLink = (t: RailItem['kind'], l: ProjectLink): RailItem => ({
    key: bindingKey(l), kind: t, label: linkName(l), link: l,
    railTag: t === 'connecteur' && l.config?.instructions_md ? { tone: 'olive', label: 'surchargé' } : null,
  })
  const fileItems: RailItem[] = files.value.map((f) => ({
    key: `file:${f.id}`, kind: 'file', label: f.title || f.filename, file: f,
    railTag: f.public ? { tone: 'cobalt', label: 'public' } : null,
  }))
  // Connecteurs REQUIS par une procédure mais NON déclarés au projet (ADR 0035/0044) :
  // affichés sous les déclarés, tag « requis ». Ils résolvent via la cascade normale ;
  // les DÉCLARER permet de leur préconfigurer une identité/surcharge.
  const declaredConns = new Set(linksOf('connecteur').map((l) => l.target_ref))
  const derivedConnItems: RailItem[] = Object.entries(connectorSources.value)
    .filter(([name, srcs]) => !declaredConns.has(name) && srcs.some((s) => s !== 'declared'))
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, srcs]) => ({
      key: `reqconn:${name}`, kind: 'connecteur' as const, label: name,
      derived: srcs.filter((s) => s !== 'declared'),
      railTag: { tone: 'cobalt' as const, label: 'requis' },
    }))
  return [
    { key: 'pages', label: 'Pages', icon: 'book', kind: 'page', addKind: 'page', items: pageItems },
    { key: 'tableaux', label: 'Tableaux', icon: 'db', kind: 'tableau', addKind: 'tableau', items: linksOf('tableau').map((l) => mkLink('tableau', l)) },
    { key: 'connecteurs', label: 'Connecteurs', icon: 'plug', kind: 'connecteur', addKind: 'connecteur', items: [...linksOf('connecteur').map((l) => mkLink('connecteur', l)), ...derivedConnItems] },
    { key: 'procedures', label: 'Procédures', icon: 'doc', kind: 'procedure', addKind: 'procedure', items: linksOf('procedure').map((l) => mkLink('procedure', l)) },
    { key: 'files', label: 'Fichiers importés', icon: 'file-text', kind: 'file', addKind: 'file', items: fileItems },
  ]
})
// Item sélectionné (recomputé → survit aux reloads ; fallback accueil si disparu).
const selItem = computed<RailItem | null>(() => {
  for (const g of railGroups.value) { const it = g.items.find((x) => x.key === sel.value); if (it) return it }
  return railGroups.value[0]?.items[0] ?? null
})

// ── chargement ──
async function load() {
  if (!Number.isFinite(projectId)) { error.value = 'Projet introuvable.'; loaded.value = true; return }
  try {
    project.value = await getProject(projectId)
    await Promise.all([loadGrants(), loadActivity(), loadFiles(), loadDocs(), loadAudit()])
  } catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
}
async function reloadProject() { try { project.value = await getProject(projectId) } catch (e) { toast(humanize(e)) } }
async function loadGrants() { try { grants.value = (await getResource('project', String(projectId))).grants } catch { grants.value = [] } }
async function loadActivity() { try { activity.value = (await getProjectActivity(projectId)).activity } catch { activity.value = [] } }
async function loadFiles() { try { files.value = (await listProjectFiles(projectId)).files } catch (e) { toast(humanize(e)) } }
async function loadDocs() { try { docs.value = (await listDocs(projectId)).docs } catch (e) { toast(humanize(e)) } }
async function loadAudit() {
  try {
    const inv = await getProjectInventory(projectId)
    audit.value = inv.audit ?? null
    connectorSources.value = inv.connector_sources ?? {}
  } catch { audit.value = null; connectorSources.value = {} }
}
const { scoped } = useScopedLink()

// Sélection ↔ URL pour les TABLEAUX : `/projects/:id/data/:nsRef` ouvre le tableau lié
// correspondant (les autres entités restent en sélection interne `sel`). Navigation
// directe / refresh / back : on resynchronise depuis l'URL.
function selectFromRoute() {
  const ref = route.params.nsRef
  if (typeof ref === 'string' && ref) {
    const l = linksOf('tableau').find((x) => x.target_ref === ref || String(x.namespace ?? '') === ref)
    if (l) { sel.value = bindingKey(l); return }
  }
  // Deep-link PAGE `?doc=<id>` (lot 3 Ship 2) — prérequis de tout clic de résultat
  // (recherche, fil Récent, backlinks) : arriver par URL sélectionne la page.
  const d = route.query.doc
  if (typeof d === 'string' && /^\d+$/.test(d)) sel.value = `doc:${d}`
}
watch(() => route.params.nsRef, selectFromRoute)
watch(() => route.query.doc, selectFromRoute)

onMounted(async () => { await load(); selectFromRoute() })

// ── actions d'en-tête ──
async function saveBrief(value: string) {
  if (!project.value) return
  try { project.value = { ...project.value, ...(await updateProject(projectId, { brief_md: value })) }; await loadActivity(); toast('brief enregistré') }
  catch (e) { toast(humanize(e)) }
}
async function handoff() {
  try { const { markdown } = await projectHandoff(projectId); await navigator.clipboard.writeText(markdown); toast('texte copié — colle-le dans Claude pour reprendre le projet') }
  catch (e) { toast(humanize(e)) }
}
function copy() { menuOpen.value = false; if (project.value) copyOpen.value = true }
async function doCopy(name: string) {
  try { const c = await copyProject(projectId, name); toast('projet copié'); router.push(`/projects/${c.id}`) }
  catch (e) { toast(humanize(e)); throw e }
}
function rename() { menuOpen.value = false; if (project.value) renameOpen.value = true }
async function doRename(name: string) {
  if (!project.value) return
  try { project.value = { ...project.value, ...(await updateProject(projectId, { name })) }; await loadActivity(); toast('projet renommé') }
  catch (e) { toast(humanize(e)); throw e }
}
async function toggleTemplate() {
  menuOpen.value = false
  if (!project.value) return
  const next = !project.value.is_template
  try { project.value = { ...project.value, ...(await setProjectTemplate(projectId, next)) }; toast(next ? 'publié comme modèle' : 'retiré des modèles') }
  catch (e) { toast(humanize(e)) }
}
async function archive() {
  menuOpen.value = false
  if (!project.value) return
  try { await archiveProject(projectId); toast('projet archivé'); router.push('/projects') }
  catch (e) { toast(humanize(e)) }
}

// ── navigateur : sélection + ajout ──
function onSelect(it: RailItem) {
  sel.value = it.key
  // Un tableau lié ouvre sa vue COMPLÈTE dans le projet et pose l'URL dédiée ;
  // toute autre entité quitte la vue tableau (retour à /projects/:id).
  if (it.kind === 'tableau' && it.link) {
    void router.push(scoped(`/projects/${projectId}/data/${it.link.target_ref}`))
    return
  }
  if (route.params.nsRef != null) {
    void router.push(scoped(`/projects/${projectId}`))
  }
  // Miroir URL de la page sélectionnée (`?doc=`) — lien partageable, refresh stable.
  const did = it.kind === 'page' && it.doc ? String(it.doc.id) : undefined
  if ((route.query.doc as string | undefined) !== did)
    void router.replace({ query: { ...route.query, doc: did } })
}
function openAdd(kind: NonNullable<typeof addKind.value>) { addParent.value = null; addKind.value = kind }
function openSubPage(parentId: number) { addParent.value = parentId; addKind.value = 'page' }
async function onLinked() { await Promise.all([reloadProject(), loadActivity(), loadAudit()]) }
async function onCreatedDoc(id: number) { await loadDocs(); sel.value = `doc:${id}` }
async function onReloadDocs() {
  await loadDocs()
  if (sel.value.startsWith('doc:') && !docs.value.some((d) => `doc:${d.id}` === sel.value)) sel.value = 'home'
}
async function onReloadFiles() {
  await loadFiles()
  if (sel.value.startsWith('file:') && !files.value.some((f) => `file:${f.id}` === sel.value)) sel.value = 'home'
}
async function onReloadLinks() { await Promise.all([reloadProject(), loadAudit()]) }
async function onChanged() { await Promise.all([loadActivity(), loadAudit()]) }
</script>

<template>
  <div class="pj fadein">
    <div v-if="error" class="pj__msg surface-card"><p class="dim" style="font-size: 13px">{{ error }}</p></div>
    <div v-else-if="!loaded" class="pj__msg surface-card"><p class="dim" style="font-size: 13px">chargement du projet…</p></div>

    <template v-else-if="project">
      <!-- en-tête : injecté dans le topbar global (fin du double en-tête). claim=false :
           pas de titre local à dédupliquer → le fil d'ariane générique ("projects · workspace")
           reste visible à côté des actions, dans la même barre. -->
      <TopbarPage :claim="false">
        <div class="pj-top__act">
          <Tag v-for="t in statusTags" :key="t.label" :tone="t.tone">{{ t.label }}</Tag>
          <button v-if="grants.length" class="pj-avs" title="Partagé — voir avec qui" @click="shareOpen = true">
            <span v-for="(a, i) in avatars" :key="i" class="pj-av" :style="{ background: a.bg, color: a.fg }">{{ a.initials }}</span>
            <span v-if="moreCount" class="pj-av pj-av--more">+{{ moreCount }}</span>
          </button>
          <button class="pj-btn" @click="shareOpen = true"><Icon name="users" :size="15" /> Partager</button>
          <button class="pj-btn" @click="histOpen = true"><Icon name="activity" :size="15" /> Historique</button>
          <button class="pj-btn pj-btn--primary" @click="handoff"><Icon name="sparkles" :size="14" /> Reprendre dans Claude</button>
          <span class="pj-menu">
            <button class="pj-btn pj-btn--icon" aria-label="plus d'actions" @click="menuOpen = !menuOpen"><Icon name="ellipsis" :size="17" /></button>
            <template v-if="menuOpen">
              <span class="pj-menu__scrim" @click="menuOpen = false"></span>
              <div class="pj-menu__pop">
                <button v-if="!readOnly" class="pj-mi" @click="rename"><Icon name="pencil" :size="14" /> Renommer le projet</button>
                <button class="pj-mi" @click="copy"><Icon name="copy" :size="14" /> Copier le projet</button>
                <template v-if="!readOnly">
                  <button class="pj-mi" @click="toggleTemplate"><Icon name="sparkles" :size="14" /> {{ project.is_template ? 'Retirer des modèles' : 'Publier comme modèle' }}</button>
                  <div class="pj-mi__sep"></div>
                  <button class="pj-mi pj-mi--danger" @click="archive"><Icon name="trash-2" :size="14" /> Archiver</button>
                </template>
              </div>
            </template>
          </span>
        </div>
      </TopbarPage>

      <!-- bandeau audit pleine largeur -->
      <section v-if="auditIssues" class="pj-audit">
        <div class="pj-audit__hd">
          <span class="pj-audit__ic"><Icon name="triangle-alert" :size="15" /></span>
          <span class="pj-audit__t">liens à vérifier</span>
          <Tag tone="saffron">{{ auditLines.length }}</Tag>
        </div>
        <div class="pj-audit__list">
          <div v-for="(a, i) in auditLines" :key="i" class="pj-audit__row"><span class="pj-audit__dot"></span><span>{{ a }}</span></div>
        </div>
      </section>

      <!-- navigateur : viewer (gauche) + rail (droite) -->
      <div class="pj-body">
        <ProjectViewer class="pj-body__vw" :item="selItem" :project-id="projectId" :project-name="project.name"
          :brief="project.brief_md" :read-only="readOnly"
          @save-brief="saveBrief" @reload-docs="onReloadDocs" @reload-files="onReloadFiles"
          @reload-links="onReloadLinks" @changed="onChanged" @open-doc="(id) => sel = `doc:${id}`" @add-subpage="openSubPage" />
        <ProjectRail class="pj-body__rail" :groups="railGroups" :sel="sel" :read-only="readOnly"
          @select="onSelect" @add="openAdd" />
      </div>
    </template>

    <ProjectShareDialog v-if="project" :open="shareOpen" :project="project" :grants="grants" :read-only="readOnly"
      @close="shareOpen = false" @changed="loadGrants" @reload-project="reloadProject" />
    <ProjectHistoryDrawer :open="histOpen" :activity="activity" :days="14" @close="histOpen = false" />
    <EntityPickerDialog v-if="addKind" :open="!!addKind" :kind="addKind" :project-id="projectId" :parent-id="addParent"
      @close="addKind = null" @linked="onLinked" @created-doc="onCreatedDoc" @reload-files="onReloadFiles" />
    <NameDialog v-if="project" v-model:open="copyOpen" title="copier ce projet" label="nom de la copie"
      :initial="'Copie de ' + project.name" submit-label="copier" :on-confirm="doCopy" />
    <NameDialog v-if="project" v-model:open="renameOpen" title="renommer le projet" label="nom du projet"
      :initial="project.name" submit-label="renommer" :on-confirm="doRename" />
  </div>
</template>

<style scoped>
/* le navigateur pleine largeur casse la gouttière de .content pour coller au menu/bord */
.pj { display: flex; flex-direction: column; min-height: calc(100vh - 60px); margin: -24px -26px -64px; }
@media (max-width: 820px) { .pj { margin: -18px -16px -56px; } }
@media (max-width: 480px) { .pj { margin: -14px -12px -48px; } }
.pj__msg { margin: 24px 26px; }

/* en-tête : actions injectées dans le topbar global (TopbarPage), plus de titre local */
.pj-top__act { flex: 1; display: flex; align-items: center; gap: 9px; flex-wrap: wrap; justify-content: flex-end; }
.pj-avs { display: inline-flex; align-items: center; padding-left: 8px; border: 0; background: transparent; cursor: pointer; flex: none; }
.pj-av { width: 30px; height: 30px; border-radius: var(--radius-pill); display: grid; place-items: center; font-size: 10.5px; font-weight: 700; border: 2px solid var(--color-bg); margin-left: -8px; }
.pj-av--more { background: var(--color-paper-2); color: var(--color-mute); }

.pj-btn { height: 36px; display: inline-flex; align-items: center; gap: 7px; padding: 0 14px; border: 1px solid var(--color-hair); background: var(--color-surface); border-radius: var(--radius-pill); font-family: var(--font-sans); font-size: 12.5px; font-weight: 600; color: var(--color-ink-soft); cursor: pointer; white-space: nowrap; transition: background var(--t-fast), transform var(--t-fast) var(--ease-out); }
.pj-btn:not(.pj-btn--primary):hover { background: var(--color-paper-2); }
.pj-btn--primary { background: var(--color-ink); color: var(--color-bg); border-color: var(--color-ink); padding: 0 16px; }
/* Lift réservé au survol souris (sur tactile, capterait le 1er tap). */
@media (hover: hover) { .pj-btn--primary:hover { transform: translateY(-1px); } }
.pj-btn--icon { width: 36px; padding: 0; justify-content: center; }
.pj-menu { position: relative; display: inline-flex; flex: none; }
.pj-menu__scrim { position: fixed; inset: 0; z-index: 60; }
.pj-menu__pop { position: absolute; top: calc(100% + 6px); right: 0; width: 214px; z-index: 70; background: var(--color-surface); border: 1px solid var(--border-card); border-radius: var(--radius-md); box-shadow: var(--shadow-pop); padding: 5px; }
.pj-mi { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; padding: 8px 10px; border: 0; background: transparent; border-radius: 6px; font-family: var(--font-sans); font-size: 12.5px; font-weight: 600; color: var(--color-ink-soft); cursor: pointer; }
.pj-mi:hover { background: var(--color-paper-2); color: var(--color-ink); }
.pj-mi--danger { color: var(--color-terra-ink); }
.pj-mi--danger:hover { background: var(--color-terra-soft); }
.pj-mi__sep { height: 1px; background: var(--color-hair-soft); margin: 5px 4px; }

/* audit */
.pj-audit { background: var(--color-surface); border-bottom: 1px solid var(--color-hair); border-left: 3px solid var(--color-saffron); padding: 14px 26px; }
.pj-audit__hd { display: flex; align-items: center; gap: 8px; margin-bottom: 9px; }
.pj-audit__ic { display: inline-flex; color: var(--color-saffron-ink); }
.pj-audit__t { font-family: var(--font-mono); font-size: 10px; font-weight: 600; letter-spacing: .16em; text-transform: uppercase; color: var(--color-saffron-ink); }
.pj-audit__list { display: flex; flex-direction: column; gap: 7px; }
.pj-audit__row { display: flex; gap: 9px; align-items: flex-start; font-size: 12.5px; line-height: 1.5; color: var(--color-ink-soft); }
.pj-audit__dot { width: 5px; height: 5px; border-radius: var(--radius-pill); background: var(--color-saffron); margin-top: 6px; flex: none; }

/* corps : viewer 3fr | rail ~0.85fr */
.pj-body { flex: 1; display: grid; grid-template-columns: 3fr minmax(198px, 0.85fr); align-items: stretch; min-height: 0; }
.pj-body__vw { order: 1; min-width: 0; }
.pj-body__rail { order: 2; }
@media (max-width: 720px) { .pj-body { grid-template-columns: 1fr; } .pj-body__rail { order: 1; border-left: 0; border-bottom: 1px solid var(--color-hair); } .pj-body__vw { order: 2; } }

.surface-card { background: var(--color-surface); border: 1px solid var(--color-hair); border-radius: var(--radius-md); padding: 18px; }
</style>
