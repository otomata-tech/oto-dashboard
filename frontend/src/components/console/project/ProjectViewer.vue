<script setup lang="ts">
// Viewer POLYMORPHE d'un projet (refonte UX, ADR 0032) — colonne GAUCHE du navigateur.
// Rend l'entité/page sélectionnée dans le rail selon son `kind` (6 formes). Réutilise la
// logique de câblage existante (ProjectWiki pour les pages, ProjectEntities pour la
// surcharge connecteur) — même appels API, remontés au parent par events.
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, onBeforeRouteLeave } from 'vue-router'
import Icon from '@/components/console/Icon.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import OtoSelect from '@/components/console/OtoSelect.vue'
import MarkdownView from '@/components/console/MarkdownView.vue'
// Éditeur TipTap en chunk séparé : chargé au premier passage en mode édition seulement.
const MarkdownEditor = defineAsyncComponent(() => import('@/components/console/MarkdownEditor.vue'))
import AttachmentViewer from '@/components/console/AttachmentViewer.vue'
import DatastoreTable from '@/components/console/DatastoreTable.vue'
import ProjectWorkQueues from './ProjectWorkQueues.vue'
import ProjectUrlPerimeter from './ProjectUrlPerimeter.vue'
import DocPageHead from './DocPageHead.vue'
import { useDocAutosave } from '@/composables/useDocAutosave'
import { parseDocSegments } from '@/lib/docEmbeds'
import {
  updateDoc, deleteDoc, setDocPublic, getDocRevisions, getBacklinks,
  getConnectorIdentities, linkProject, unlinkProject,
  setProjectFilePublic, deleteProjectFile,
  getToolRegistry, getConnectors, getProjectRuns, getRunThread, appendRunThread,
  enqueueRunContinue, getProjectProcedures,
  type RunThreadMessage,
} from '@/api/console'
import type {
  Doc, DocKind, DocRevision, ProjectLink, ConnectorIdentity,
  ToolRegistryEntry, ConnectorMeta, ProjectRun, ProjectFile, LinkedProcedure,
} from '@/types/api'

// Caches module-level : le registre d'outils et le catalogue de connecteurs ne changent
// pas entre deux sélections → une seule requête, partagée par toutes les cartes connecteur.
let _registryP: Promise<ToolRegistryEntry[]> | null = null
let _connectorsP: Promise<ConnectorMeta[]> | null = null
const loadRegistry = () => (_registryP ??= getToolRegistry().then((r) => r.tools).catch(() => []))
const loadConnectors = () => (_connectorsP ??= getConnectors().then((r) => r.connectors).catch(() => []))
const nsOf = (tool: string) => tool.split('_')[0] ?? ''
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useHotkey } from '@/composables/useHotkey'
import type { RailItem } from './rail'

const props = defineProps<{
  item: RailItem | null
  projectId: number
  projectName: string
  brief?: string | null
  readOnly?: boolean
  docTitleMap?: Record<string, number>   // casefold(titre)→id (résolution [[…]], Ship 4)
  // Les liens `tableau` du projet, ENTIERS (bloc files de travail, home) : c'est leur
  // `datastore_id` qui désigne, pas un nom projeté en amont (oto#160).
  tableLinks?: ProjectLink[]
  excludedUrlPrefixes?: string[]         // périmètre d'URL du projet (home, oto-backend#605)
  docs?: Doc[]                           // pages du projet : fil d'Ariane de l'en-tête de page
}>()
const emit = defineEmits<{
  'save-brief': [string]
  'reload-docs': []
  'reload-files': []
  changed: []
  'open-doc': [number]
  'add-subpage': [number]
  'reload-links': []
  'reload-project': []                   // le projet lui-même a changé hors brief/icône/nom (ex. périmètre d'URL)
  'create-page': [string]                // lien-souche [[Titre]] cliqué → créer la page
}>()

// Résolution des backlinks [[Titre]] contre les pages du projet (casefold).
function resolveLink(title: string): number | null {
  return props.docTitleMap?.[title.split(/\s+/).join(' ').toLowerCase()] ?? null
}

const { toast } = useToast()
const { confirmAction } = usePrompt()

const item = computed(() => props.item)
const kind = computed(() => item.value?.kind ?? 'page')
const isHome = computed(() => !!item.value?.home)
const doc = computed<Doc | null>(() => item.value?.doc ?? null)
const link = computed<ProjectLink | null>(() => item.value?.link ?? null)

// ── En-tête du viewer (icône + titre + tags + eyebrow) ──
const ICON: Record<string, string> = { page: 'file-text', tableau: 'db', connecteur: 'plug', procedure: 'doc', doc: 'book', file: 'file-text' }
const viewerIcon = computed(() => (isHome.value ? 'house' : ICON[kind.value] ?? 'file-text'))
const title = computed(() => {
  if (isHome.value) return props.projectName
  if (kind.value === 'page') return doc.value?.title ?? ''
  if (kind.value === 'file') return item.value?.file?.title || item.value?.file?.filename || ''
  return item.value?.label ?? ''
})
const KIND_EYEBROW: Record<string, string> = {
  tableau: 'tableau lié · datastore', connecteur: 'connecteur · résolution par projet',
  procedure: "ce qu'un agent exécute", doc: 'document lié',
  file: 'fichier importé',
}
const eyebrow = computed(() => {
  if (isHome.value) return "brief · point d'entrée de l'agent"
  // Chapô (Ship 2) : le sous-titre curé de la page remplace le générique « page ».
  if (kind.value === 'page') return doc.value?.description || 'page'
  return KIND_EYEBROW[kind.value] ?? ''
})

// ═══════════ PAGE (accueil = brief, ou page Documents) ═══════════
// `editing` ne vaut que pour le BRIEF (bouton « éditer », « Enregistrer »). Une page
// s'édite EN PLACE et s'enregistre seule (`useDocAutosave`, 24/09/2026) : un clic dans le
// texte l'ouvre à l'écriture, sortir du texte la referme — le rendu (diagrammes, liens
// [[…]], tableaux intégrés) revient alors, ce que l'éditeur ne sait pas afficher.
const editing = ref(false)
const briefDraft = ref(props.brief ?? '')
const auto = useDocAutosave(doc, () => { emit('reload-docs'); emit('changed') })
const draft = auto.draft
const docEditing = auto.editing
const revisions = ref<DocRevision[]>([])
const showHistory = ref(false)
const backlinks = ref<{ id: number; project_id: number; title: string }[]>([])
const KIND_LABEL: Record<DocKind, string> = { doc: 'doc', note: 'note agent', source: 'source' }
const KIND_OPTIONS = (Object.keys(KIND_LABEL) as DocKind[]).map((value) => ({ value, label: KIND_LABEL[value] }))

// Resynchronise l'édition quand la sélection CHANGE (clé du rail), pas à chaque
// recalcul de la référence `item` : le parent recrée l'objet `selItem` (ex. après
// avoir lié un connecteur) → sans la clé, resetPage() jetait le brouillon en cours.
watch(() => item.value?.key, () => resetPage(), { immediate: true })
watch(() => props.brief, (v) => { if (!editing.value || !isHome.value) briefDraft.value = v ?? '' })

function resetPage() {
  editing.value = false
  showHistory.value = false; revisions.value = []
  briefDraft.value = props.brief ?? ''
  auto.reset()
  const d = doc.value
  backlinks.value = []
  if (d) void loadBacklinks(d.id)
}
async function loadBacklinks(id: number) {
  try { backlinks.value = (await getBacklinks(id)).backlinks } catch { backlinks.value = [] }
}

// brief
function editBrief() { briefDraft.value = props.brief ?? ''; editing.value = true }
function cancelBrief() { briefDraft.value = props.brief ?? ''; editing.value = false }
// Anti double-submit : `editing` retombe SYNCHRONIQUEMENT ici (l'écriture est déléguée
// au parent), donc un second clic dans la même rafale trouve la garde fermée — pas
// besoin du flag `saving`, qui n'aurait rien à attendre.
function saveBrief() {
  if (!editing.value) return
  emit('save-brief', briefDraft.value); editing.value = false
}

// doc page — édition en place. Un clic sur un lien, un bouton ou un tableau intégré garde
// son sens : seul un clic dans la prose ouvre l'écriture.
const canEditDoc = computed(() => kind.value === 'page' && !isHome.value && !!doc.value && !props.readOnly)
// Le curseur s'ouvre LÀ où l'on a cliqué. Pas par les coordonnées — l'éditeur n'a ni la même
// barre ni les mêmes interlignes que la lecture, le curseur tombait une ligne à côté — mais
// par le TEXTE : le bloc cliqué (paragraphe, élément de liste, titre, cellule) et le nombre
// de caractères avant le point cliqué, retrouvés ensuite dans l'éditeur.
const focusAt = ref<{ text: string; offset: number } | 'end'>('end')
function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const d = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
  }
  const r = d.caretRangeFromPoint?.(x, y)
  if (r) return { node: r.startContainer, offset: r.startOffset }
  const p = d.caretPositionFromPoint?.(x, y)
  return p ? { node: p.offsetNode, offset: p.offset } : null
}
function onPageClick(e: MouseEvent) {
  if (!canEditDoc.value || docEditing.value) return
  if ((e.target as HTMLElement).closest('a, button, input, .vw__embed, .mermaid, svg')) return
  focusAt.value = 'end'
  const c = caretAt(e.clientX, e.clientY)
  const el = c ? (c.node.nodeType === 1 ? c.node as Element : c.node.parentElement) : null
  const block = el?.closest('p, li, h1, h2, h3, h4, h5, h6, td, th, pre')
  if (c && block) {
    const before = document.createRange()
    before.selectNodeContents(block)
    before.setEnd(c.node, c.offset)
    focusAt.value = { text: (block.textContent ?? '').trim(), offset: before.toString().replace(/^\s+/, '').length }
  }
  auto.start()
}
// Sortir de l'écriture = le focus quitte la zone (la barre d'outils de l'éditeur en fait partie).
function onEditorFocusOut(e: FocusEvent) {
  const zone = e.currentTarget as HTMLElement
  if (zone.contains(e.relatedTarget as Node | null)) return
  void auto.stop()
}
// Page rechargée après un conflit : on jette le brouillon, on relit la page servie.
function reloadAfterConflict() { auto.reset(); emit('reload-docs') }
async function removeDoc() {
  const d = doc.value
  if (!d) return
  if (!await confirmAction({ title: 'Supprimer la page', danger: true, confirmLabel: 'Supprimer', message: `Supprimer « ${d.title} » et ses sous-pages ?` })) return
  try { await deleteDoc(d.id); emit('reload-docs'); emit('changed') }
  catch (e) { toast(humanize(e)) }
}
async function toggleDocPublic() {
  const d = doc.value
  if (!d) return
  try {
    const r = await setDocPublic(d.id, !d.public)
    if (r.public && r.public_url) { await navigator.clipboard.writeText(r.public_url).catch(() => {}); toast('lien public copié') }
    else toast('partage public retiré')
    emit('reload-docs')
  } catch (e) { toast(humanize(e)) }
}
async function toggleHistory() {
  const d = doc.value
  if (!d) return
  showHistory.value = !showHistory.value
  if (showHistory.value) { try { revisions.value = (await getDocRevisions(d.id)).revisions } catch (e) { toast(humanize(e)) } }
}
async function restoreRevision(r: DocRevision) {
  const d = doc.value
  if (!d) return
  if (!await confirmAction({ title: 'Restaurer cette version', message: `Remplacer le contenu actuel par la version du ${fmtDate(r.created_at)} ?` })) return
  try { await updateDoc(d.id, { title: r.title, body_md: r.body_md }); emit('reload-docs'); emit('changed'); revisions.value = (await getDocRevisions(d.id)).revisions; toast('version restaurée') }
  catch (e) { toast(humanize(e)) }
}

// ═══════════ GARDE-FOUS D'ÉDITION (anti-perte de brouillon) ═══════════
// Un brouillon ne vit que dans ce composant : rien ne le persiste tant qu'on n'a pas
// enregistré. Trois sorties possibles — changer de route, fermer l'onglet, oublier
// d'enregistrer — et aucune n'était gardée.
const isDirty = computed(() => {
  if (docEditing.value) return auto.dirty.value
  if (!editing.value) return false
  return isHome.value && briefDraft.value !== (props.brief ?? '')
})

// Ctrl/Cmd+S — le réflexe d'enregistrement. L'édition n'est ouverte qu'en écriture
// (aucun bouton n'y mène en lecture seule) ; la garde `readOnly` tient si ça change.
useHotkey('s', () => {
  if (props.readOnly) return
  if (docEditing.value) void auto.flush()
  else if (editing.value && isHome.value) saveBrief()
})

// Fermeture d'onglet / rechargement : seul le dialogue natif du navigateur peut retenir
// (aucune UI applicative n'est rendue à ce moment-là) — d'où l'exception à la règle
// « pas de dialogue natif ».
function onBeforeUnload(e: BeforeUnloadEvent) { if (isDirty.value) e.preventDefault() }
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

// Navigation interne : là on est encore dans l'app → confirmation applicative.
onBeforeRouteLeave(async () => {
  if (docEditing.value) await auto.flush()   // une page s'enregistre avant de partir
  if (!isDirty.value) return true
  return await confirmAction({
    title: 'Quitter sans enregistrer ?',
    message: 'Les modifications en cours sur cette page seront perdues.',
    confirmLabel: 'Quitter sans enregistrer',
    danger: true,
  })
})

const body = computed(() => (isHome.value ? props.brief : doc.value?.body_md) ?? '')
const hasBody = computed(() => !!body.value && body.value.trim().length > 0)
// Embed datastore (#6 top5 #5) : le corps est découpé en segments prose + tableaux live
// (bloc ```oto-data). Une page « Panorama » affiche ainsi le datastore TOUJOURS à jour.
const segments = computed(() => parseDocSegments(body.value))

// ═══════════ CONNECTEUR (résolution + outils + surcharge, ADR 0032 §4) ═══════════
const identities = ref<ConnectorIdentity[]>([])
const identLoading = ref(false)
const chosenIdentity = ref('')      // identité cible (défaut = celle du binding)
const identityOpts = computed(() => identities.value.map((idn) => ({
  value: idn.id,
  label: `${idn.label || idn.id}${idn.channel ? ` · ${idn.channel}` : ''}${idn.granted ? ' · partagé' : ''}`,
})))
const surcharge = ref('')
const cfgSaving = ref(false)
const connectorTools = ref<{ name: string; description: string }[]>([])
const toolsLoading = ref(false)

// ═══════════ PROCÉDURE (runs) / CONNECTEUR — extras chargés à la sélection ═══════════
// (Le TABLEAU affiche sa vue complète via <DatastoreTable>, plus d'aperçu à charger ici.)
const runs = ref<ProjectRun[]>([])
const runsLoading = ref(false)
// Le fil d'un run hébergé, chargé AU CLIC (la plupart des runs sont tracés par un
// agent externe et n'en ont pas — on ne le sait qu'en le demandant).
const filOuvert = ref<string | null>(null)
const filMessages = ref<RunThreadMessage[]>([])
const filLoading = ref(false)
const filErreur = ref<string | null>(null)

function toggleFil(r: ProjectRun) {
  if (filOuvert.value === r.run_id) { filOuvert.value = null; return }
  filOuvert.value = r.run_id
  filMessages.value = []; filErreur.value = null; filLoading.value = true
  getRunThread(r.run_id)
    .then((res) => { filMessages.value = res.messages || [] })
    .catch(() => { filErreur.value = 'fil illisible (droits ou run purgé)' })
    .finally(() => { filLoading.value = false })
}

// « Continuer » (R4) : append par la capacité R1 (droits du propriétaire hérités),
// puis un job `continue` — pending tant qu'aucun worker armé ne le claime.
const filSaisie = ref('')
const filEnvoi = ref(false)
const filEnvoiNote = ref<string | null>(null)

function continuerRun(r: ProjectRun) {
  const texte = filSaisie.value.trim()
  if (!texte || filEnvoi.value) return
  filEnvoi.value = true; filEnvoiNote.value = null
  appendRunThread(r.run_id, texte)
    .then((res) => {
      filMessages.value = [...filMessages.value,
        { seq: res.seq, role: 'user', content: { text: texte } }]
      filSaisie.value = ''
      return enqueueRunContinue(r.run_id)
        .then(() => { filEnvoiNote.value = 'Message apposé — repris au prochain passage du worker.' })
        .catch(() => { filEnvoiNote.value = 'Message apposé au fil ; la reprise n\'a pas pu être enfilée (réessaie).' })
    })
    .catch((e) => {
      const msg = String((e as Error)?.message || '')
      filEnvoiNote.value = msg.includes('404') || msg.includes('run_not_found')
        ? 'Seul le propriétaire du run peut le continuer.'
        : 'Écriture refusée — le fil n\'a pas bougé.'
    })
    .finally(() => { filEnvoi.value = false })
}

function filTexte(m: RunThreadMessage): string {
  const c = m.content || {}
  if (typeof c.text === 'string' && c.text.trim()) return c.text
  const calls = Array.isArray(c.tool_calls) ? c.tool_calls as Array<Record<string, unknown>> : []
  if (calls.length) return calls.map((t) => String(t.name ?? '?')).join(' · ')
  return '—'
}
// Le contenu de la procédure liée, rendu inline (comme un tableau montre sa grille).
const procDoc = ref<LinkedProcedure | null>(null)
const procLoading = ref(false)
// Déplié par défaut : on a cliqué CETTE procédure pour la lire. La replier d'office
// remettrait le contenu derrière un geste — le défaut qu'on corrige ici.
const procOpen = ref(true)
const procBody = computed(() => (procDoc.value?.body_md ?? '').trim())
// Résumé de tête, quand la procédure en porte un. Champ facultatif : absent aujourd'hui,
// il apparaîtra côté backend sans que cet écran change.
const procSummary = computed(() => (procDoc.value?.description ?? '').trim())

// Charge les extras de l'entité sélectionnée (identités+outils / runs) selon son type.
watch(item, async () => {
  identities.value = []; connectorTools.value = []; runs.value = []; procDoc.value = null
  const l = link.value
  if (kind.value === 'connecteur' && l) {
    chosenIdentity.value = l.identity_ref ?? ''
    surcharge.value = l.config?.instructions_md ?? ''
    identLoading.value = true; toolsLoading.value = true
    getConnectorIdentities(l.target_ref)
      .then((r) => { identities.value = r.supported ? r.identities : [] })
      .catch(() => { identities.value = [] })
      .finally(() => { identLoading.value = false })
    // Outils exposés = ceux du registre dont le namespace appartient au connecteur.
    Promise.all([loadRegistry(), loadConnectors()])
      .then(([reg, cons]) => {
        const ns = new Set(cons.find((c) => c.name === l.target_ref)?.namespaces ?? [])
        connectorTools.value = reg.filter((t) => ns.has(nsOf(t.name)))
          .map((t) => ({ name: t.name, description: t.description }))
      })
      .catch(() => { connectorTools.value = [] })
      .finally(() => { toolsLoading.value = false })
  } else if (kind.value === 'procedure' && l) {
    runsLoading.value = true
    getProjectRuns(props.projectId, l.target_ref)
      .then((r) => { runs.value = r.runs })
      .catch(() => { runs.value = [] })
      .finally(() => { runsLoading.value = false })
    // Le corps vient de la route PROJET (`include=procedures`), PAS de la doctrine de
    // l'org du lecteur : c'est le projet qui donne le droit de lire ce qu'il lie. La
    // route de doctrine répondait depuis l'intérieur de l'org et échouait pour un
    // invité — l'écran retombait alors sur un texte de repli, silencieusement.
    // Une procédure hors de portée du jeton est absente de la réponse : on garde son
    // titre, sans message d'erreur ni case vide.
    procLoading.value = true
    procOpen.value = true
    getProjectProcedures(props.projectId)
      .then((p) => {
        procDoc.value = (p.procedures ?? []).find((x) => x.ref === l.target_ref) ?? null
      })
      .catch(() => { procDoc.value = null })
      .finally(() => { procLoading.value = false })
  }
}, { immediate: true })

const RUN_DOT: Record<string, string> = {
  done: 'var(--color-olive)', failed: 'var(--color-terra-ink)', blocked: 'var(--color-terra-ink)',
  abandoned: 'var(--color-mute)',
}
const runDot = (o: string | null) => (o ? RUN_DOT[o] ?? 'var(--color-saffron)' : 'var(--color-saffron)')

async function saveConnector() {
  const l = link.value
  if (!l || cfgSaving.value) return
  cfgSaving.value = true
  const nextIdentity = chosenIdentity.value || undefined
  const instr = surcharge.value.trim() || undefined
  try {
    // Changement de compte = déplacer le binding (l'identité est la clé, #57) : délie
    // l'ancien puis relie le nouveau en conservant label/rôle/instructions.
    if ((l.identity_ref ?? '') !== (nextIdentity ?? '')) {
      await unlinkProject(props.projectId, 'connecteur', l.target_ref, l.identity_ref ?? undefined)
    }
    await linkProject(props.projectId, 'connecteur', l.target_ref, l.label ?? undefined, l.role ?? undefined,
      { instructions_md: instr }, nextIdentity)
    emit('reload-links'); emit('changed'); toast('surcharge enregistrée')
  } catch (e) { toast(humanize(e)) }
  finally { cfgSaving.value = false }
}

// ═══════════ TABLEAU / PROCÉDURE / DOC — deep-link vers l'entité ═══════════
const openHref = computed<string | null>(() => {
  const l = link.value
  if (!l) return null
  const ref = encodeURIComponent(l.target_ref)
  if (kind.value === 'procedure') return `/procedures/${ref}`
  if (kind.value === 'doc') return l.doc_project_id ? `/projects/${l.doc_project_id}` : null
  return null
})

// ═══════════ FICHIER importé ═══════════
const file = computed(() => item.value?.file ?? null)
const preview = ref<ProjectFile | null>(null)   // fichier ouvert dans le lightbox AttachmentViewer
function fmtSize(n?: number | null): string {
  if (!n) return '—'
  if (n < 1024) return `${n} o`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`
}
async function toggleFilePublic() {
  const f = file.value
  if (!f) return
  try {
    const { file: row } = await setProjectFilePublic(props.projectId, f.id, !f.public)
    if (row.public && row.public_url) { await navigator.clipboard.writeText(row.public_url).catch(() => {}); toast('lien public copié') }
    else toast('partage public retiré')
    emit('reload-files')
  } catch (e) { toast(humanize(e)) }
}
async function removeFile() {
  const f = file.value
  if (!f) return
  if (!await confirmAction({ title: 'Supprimer ce fichier ?', danger: true, confirmLabel: 'Supprimer', message: `Supprimer « ${f.title || f.filename} » ?` })) return
  try { await deleteProjectFile(props.projectId, f.id); emit('reload-files'); emit('changed') }
  catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="vw">
    <p v-if="!item" class="dim vw__empty">Sélectionne une page ou une entité dans le rail.</p>

    <template v-else>
      <!-- en-tête commun -->
      <header class="vw__hd">
        <span class="vw__hdic"><Icon :name="viewerIcon" :size="18" /></span>
        <div class="vw__hdtxt">
          <DocPageHead v-if="kind === 'page' && !isHome && doc" :project-name="projectName" :doc="doc"
            :docs="docs" :read-only="readOnly" :status="auto.status.value" :error="auto.error.value"
            @open-doc="(id) => emit('open-doc', id)" @rename="(t) => auto.saveTitle(t)" @reload="reloadAfterConflict">
            <Tag v-if="doc.kind !== 'doc'">{{ KIND_LABEL[doc.kind] }}</Tag>
            <Tag v-if="doc.public" tone="cobalt">public</Tag>
          </DocPageHead>
          <template v-else>
          <div class="vw__hdrow">
            <h3 class="vw__title">{{ title }}</h3>
            <Tag v-if="kind === 'page' && doc && doc.kind !== 'doc'">{{ KIND_LABEL[doc.kind] }}</Tag>
            <Tag v-if="kind === 'page' && doc?.public" tone="cobalt">public</Tag>
            <Tag v-if="link?.cross_project" tone="saffron">partagé</Tag>
          </div>
          <div v-if="eyebrow" class="vw__eb">{{ eyebrow }}</div>
          <div v-if="link?.role" class="vw__hint">{{ link.role }}</div>
          </template>
        </div>
        <!-- actions d'en-tête (pages) -->
        <div v-if="kind === 'page'" class="vw__hdact">
          <template v-if="!editing">
            <button v-if="!isHome && !readOnly" class="vw__x" @click="emit('add-subpage', doc!.id)"><Icon name="plus" :size="12" /> sous-page</button>
            <button v-if="isHome && !readOnly" class="vw__x" @click="editBrief()"><Icon name="pencil" :size="12" /> éditer</button>
          </template>
          <template v-else>
            <Btn kind="mini" @click="saveBrief">Enregistrer</Btn><button class="vw__x" @click="cancelBrief">Annuler</button>
          </template>
        </div>
      </header>

      <!-- ═══ PAGE ═══ -->
      <template v-if="kind === 'page'">
        <!-- édition (brief ou doc) -->
        <template v-if="editing && isHome">
          <MarkdownEditor v-model="briefDraft"
            placeholder="Le but du projet, le contexte, ce que l'agent doit savoir au démarrage…" />
        </template>
        <!-- page en écriture : la zone entière (réglages + éditeur) tient le focus ; en sortir
             enregistre et rend la page. Échap fait de même. -->
        <div v-else-if="docEditing && draft" class="vw__page vw__page--editing"
          @focusout="onEditorFocusOut" @keydown.esc="auto.stop()">
          <div class="vw__editopts">
            <input v-model="draft.description" class="vw__descin"
              placeholder="Sous-titre (une ligne — aide à repérer la page dans l'arbre et la recherche)" />
            <OtoSelect v-model="draft.kind" :options="KIND_OPTIONS" size="sm" aria-label="type de page" />
          </div>
          <MarkdownEditor v-model="draft.body_md" placeholder="Contenu de la page…" :focus-at="focusAt" />
        </div>

        <!-- lecture -->
        <template v-else>
          <div class="vw__page" :class="{ 'vw__page--editable': canEditDoc }" @click="onPageClick">
            <template v-if="hasBody">
              <template v-for="(seg, i) in segments" :key="i">
                <MarkdownView v-if="seg.type === 'md' && seg.text.trim()" :source="seg.text"
                  :resolve-link="kind === 'page' ? resolveLink : undefined"
                  @navigate-doc="(id) => emit('open-doc', id)"
                  @create-stub="(t) => emit('create-page', t)" />
                <!-- tableau datastore embarqué : donnée live, jamais recopiée (#6 top5 #5) -->
                <div v-else-if="seg.type === 'data'" class="vw__embed">
                  <DatastoreTable :ns-ref="seg.ns" :govern="false" />
                </div>
              </template>
            </template>
            <p v-else class="dim vw__novalue">{{ readOnly ? 'aucun contenu.' : (isHome ? 'aucun brief — clique « éditer » pour le rédiger.' : 'page vide — clique ici pour écrire.') }}</p>

            <!-- Files de travail (home) : supervision dérivée des tableaux liés à
                 cycle de vie — se rend seulement s'il y en a, ou pour dire qu'un lien
                 n'est rattaché à aucun tableau. -->
            <ProjectWorkQueues v-if="isHome && tableLinks?.length"
              :links="tableLinks" :project-id="projectId" />
            <!-- Périmètre d'URL (home, oto-backend#605) : toujours affiché — même une
                 liste vide répond à « est-ce que quelque chose est exclu ? ». -->
            <ProjectUrlPerimeter v-if="isHome" :project-id="projectId"
              :prefixes="excludedUrlPrefixes ?? []" :read-only="readOnly"
              @changed="emit('reload-project'); emit('changed')" />
          </div>

          <!-- actions secondaires page (doc) -->
          <div v-if="!isHome && doc" class="vw__pageact">
            <button class="vw__x" @click="toggleHistory">{{ showHistory ? "Masquer l'historique" : 'Historique' }}</button>
            <!-- Portée dans le libellé, et l'icône de partage des deux autres gestes (#158). -->
            <button v-if="!readOnly" class="vw__x" @click="toggleDocPublic"><Icon name="ext" :size="12" /> {{ doc.public ? 'Rendre privé' : 'Partager cette page seule' }}</button>
            <button v-if="!readOnly" class="vw__x vw__x--danger" @click="removeDoc">Supprimer</button>
          </div>

          <!-- Cité par (backlinks [[…]], Ship 4) -->
          <div v-if="!isHome && doc && backlinks.length" class="vw__panel">
            <div class="card-eb" style="margin-bottom: 6px">Cité par · {{ backlinks.length }}</div>
            <button v-for="b in backlinks" :key="b.id" class="vw__citedby"
              @click="emit('open-doc', b.id)">
              <Icon name="book" :size="12" /> {{ b.title }}
            </button>
          </div>

          <!-- historique -->
          <div v-if="showHistory" class="vw__panel">
            <div class="card-eb" style="margin-bottom: 6px">historique des versions</div>
            <p v-if="!revisions.length" class="dim" style="font-size: 12px">aucune version antérieure.</p>
            <div v-for="r in revisions" :key="r.id" class="vw__rev">
              <div style="flex: 1; min-width: 0">
                <span style="color: var(--color-ink)">{{ r.title }}</span>
                <span class="dim" style="font-size: 11px; margin-left: 6px">{{ fmtDate(r.created_at) }}<template v-if="r.edited_by"> · {{ r.edited_by }}</template></span>
              </div>
              <button v-if="!readOnly" class="vw__x" @click="restoreRevision(r)">Restaurer</button>
            </div>
          </div>
        </template>
      </template>

      <!-- ═══ CONNECTEUR ═══ -->
      <div v-else-if="kind === 'connecteur' && link" class="vw__block">
        <div class="vw__sub">résolution — compte utilisé</div>
        <OtoSelect v-if="identities.length || identLoading" v-model="chosenIdentity" :options="identityOpts"
          :none-label="identLoading ? 'chargement…' : '(défaut du compte)'"
          :disabled="readOnly || identLoading" trigger-class="w-full max-w-[340px]" />
        <p v-else class="dim" style="font-size: 12.5px">Ce connecteur n'a pas de sélecteur de compte — il résout la clé perso / d'org / plateforme.</p>

        <template v-if="toolsLoading || connectorTools.length">
          <div class="vw__sub" style="margin-top: 18px">outils exposés</div>
          <p v-if="toolsLoading" class="dim" style="font-size: 12.5px">{{ $t('common.loading') }}</p>
          <div v-else class="vw__tools">
            <span v-for="t in connectorTools" :key="t.name" class="vw__tool" :title="t.description">{{ t.name }}</span>
          </div>
        </template>

        <div class="vw__sub" style="margin-top: 18px">surcharge — instructions pour ce projet</div>
        <textarea v-model="surcharge" class="vw__area" rows="3" :disabled="readOnly"
          placeholder="ex. n'utiliser que le compte Alexandra pour ce projet…"></textarea>
        <div v-if="!readOnly" class="vw__editact"><Btn kind="mini" icon="check" :disabled="cfgSaving" @click="saveConnector">Enregistrer</Btn></div>

        <RouterLink class="vw__open" :to="`/connectors?tab=marketplace&connector=${encodeURIComponent(link.target_ref)}`">
          Voir la fiche du connecteur <Icon name="ext" :size="12" />
        </RouterLink>
      </div>

      <!-- ═══ CONNECTEUR REQUIS PAR UNE PROCÉDURE (non déclaré) ═══ -->
      <div v-else-if="kind === 'connecteur' && item?.derived" class="vw__block">
        <p class="dim" style="font-size: 13px; line-height: 1.6">
          <strong>Requis par une procédure</strong>, pas déclaré au niveau projet. Il résout via la
          cascade normale (perso &gt; équipe &gt; org &gt; plateforme) — <strong>déclare-le</strong>
          (via « + » ci-contre) pour lui préconfigurer une identité ou une surcharge.
        </p>
        <div class="vw__sub" style="margin-top: 14px">source</div>
        <div class="vw__tools">
          <span v-for="s in item.derived" :key="s" class="vw__tool">{{ s.startsWith('procedure:') ? `procédure · ${s.slice(10)}` : s }}</span>
        </div>
        <RouterLink class="vw__open" :to="`/connectors?tab=marketplace&connector=${encodeURIComponent(item.label)}`">
          Voir la fiche du connecteur <Icon name="ext" :size="12" />
        </RouterLink>
      </div>

      <!-- ═══ TABLEAU : vue COMPLÈTE inline (lignes + tri/filtres/pagination + édition) ═══ -->
      <!-- ⚠️ On adresse par l'IDENTIFIANT servi (`datastore_id`), jamais par `target_ref` :
           un lien posé par un agent porte un NOM (#117), et à nom égal la résolution
           préfère le tableau PERSONNEL du lecteur — le projet aurait peint les lignes
           d'un homonyme à soi sous le bon libellé (oto#160). Sans identifiant, le
           serveur dit qu'il ne sait pas lequel : on ne le devine pas à sa place. -->
      <div v-else-if="kind === 'tableau' && link" class="vw__block">
        <DatastoreTable v-if="link.datastore_id != null" :ns-ref="String(link.datastore_id)" :govern="false" />
        <p v-else class="dim vw__novalue">
          Aucun tableau résolu pour ce lien — il a pu être supprimé, ou il désigne son
          tableau par un nom que ce projet ne sait pas rattacher à un seul. Relie-le à
          nouveau pour le fixer sur un tableau précis.
        </p>
      </div>

      <!-- ═══ PROCÉDURE (son contenu + ses dernières exécutions) ═══ -->
      <div v-else-if="kind === 'procedure'" class="vw__block">
        <!-- Résumé visible en tête quand il existe, le détail dessous. -->
        <p v-if="procSummary" class="vw__procsum">{{ procSummary }}</p>
        <!-- Le CONTENU, montré et non remplacé par un lien. Déplié par défaut, mais dans
             un cadre qui DÉFILE : les corps réels vont jusqu'à ~15 000 caractères et
             étireraient la page. -->
        <template v-if="procBody">
          <button type="button" class="vw__procfold" :aria-expanded="procOpen"
                  @click="procOpen = !procOpen">
            <Icon :name="procOpen ? 'chevron-down' : 'chevron-right'" :size="12" />
            {{ procOpen ? 'Replier le détail' : 'Afficher le détail' }}
          </button>
          <div v-show="procOpen" class="vw__procbody"><MarkdownView :source="procBody" /></div>
        </template>
        <p v-else-if="procLoading" class="dim" style="font-size: 12.5px">{{ $t('common.loading') }}</p>
        <!-- Ni contenu ni chargement : le titre de la carte porte l'information à lui
             seul. On n'ajoute NI phrase explicative (qui ferait passer un échec de
             lecture pour un choix de conception) NI case vide. -->
        <template v-if="runs.length">
          <div class="vw__sub" style="margin-top: 16px">dernières exécutions</div>
          <div class="vw__runs">
            <template v-for="r in runs" :key="r.run_id">
              <button type="button" class="vw__run vw__run--btn" @click="toggleFil(r)">
                <span class="vw__rundot" :style="{ background: runDot(r.outcome) }"></span>
                <span class="vw__runt">{{ fmtDate(r.started_at) }}</span>
                <span class="vw__runl">{{ r.label }}</span>
                <span class="vw__runo" :class="{ dim: !r.outcome }">{{ r.outcome || 'en cours' }}</span>
              </button>
              <div v-if="filOuvert === r.run_id" class="vw__fil">
                <p v-if="filLoading" class="dim" style="font-size: 12px">chargement du fil…</p>
                <p v-else-if="filErreur" class="dim" style="font-size: 12px">{{ filErreur }}</p>
                <p v-else-if="!filMessages.length" class="dim" style="font-size: 12px">
                  Cette exécution a été menée par un agent externe : son détail vit dans le
                  journal, pas ici.
                </p>
                <div v-else class="vw__filmsgs">
                  <div v-for="m in filMessages" :key="m.seq" class="vw__filmsg">
                    <span class="vw__filrole" :data-role="m.role">{{ m.role }}</span>
                    <span class="vw__filtxt">{{ filTexte(m) }}</span>
                  </div>
                </div>
                <form v-if="!filLoading && !filErreur" class="vw__filcont"
                      @submit.prevent="continuerRun(r)">
                  <input v-model="filSaisie" class="inp sm vw__filin" type="text"
                         placeholder="continuer ce run — le message s'appose au fil"
                         :disabled="filEnvoi" />
                  <button class="vw__filbtn" type="submit"
                          :disabled="filEnvoi || !filSaisie.trim()">
                    {{ filEnvoi ? '…' : 'Continuer' }}
                  </button>
                </form>
                <p v-if="filEnvoiNote" class="dim" style="font-size: 12px; margin: 6px 0 0">
                  {{ filEnvoiNote }}
                </p>
              </div>
            </template>
          </div>
        </template>
        <p v-else-if="runsLoading" class="dim" style="font-size: 12.5px; margin-top: 12px">{{ $t('common.loading') }}</p>
        <!-- Aucune exécution : on ne dit RIEN. « Aucun run enregistré » se lisait comme
             une panne alors que la procédure est simplement en attente d'être jouée. -->
        <!-- Le lien vers la fiche complète n'a de sens que si on a PU lire le corps :
             sinon il mène à une page que le même jeton n'ouvrira pas davantage. -->
        <RouterLink v-if="openHref && procBody" class="vw__open" :to="openHref">Ouvrir la fiche complète <Icon name="ext" :size="12" /></RouterLink>
      </div>

      <!-- ═══ DOCUMENT lié ═══ -->
      <div v-else-if="kind === 'doc'" class="vw__block">
        <p class="dim" style="font-size: 13px; line-height: 1.6">Page Documents liée — elle vit dans son projet d'origine.</p>
        <RouterLink v-if="openHref" class="vw__open" :to="openHref">Ouvrir le document <Icon name="ext" :size="12" /></RouterLink>
        <p v-else class="dim" style="font-size: 12px">Document non navigable.</p>
      </div>

      <!-- ═══ FICHIER importé ═══ -->
      <div v-else-if="kind === 'file' && file" class="vw__block" style="max-width: 640px">
        <button class="vw__filebox" type="button" @click="preview = file">
          <Icon name="file-text" :size="26" />
          <span class="vw__filehint">aperçu du document</span>
        </button>
        <div v-if="file.description" style="font-size: 13px; color: var(--color-ink-soft); line-height: 1.55; margin-bottom: 10px">{{ file.description }}</div>
        <div class="vw__filemeta"><span class="vw__filek">taille</span><span>{{ fmtSize(file.size_bytes) }}</span></div>
        <div class="vw__fileact">
          <button class="vw__x" @click="preview = file"><Icon name="file-text" :size="12" /> Prévisualiser</button>
          <a v-if="file.download_url" class="vw__x" :href="file.download_url" target="_blank" rel="noopener"><Icon name="download" :size="12" /> Télécharger</a>
          <a v-if="file.public && file.public_url" class="vw__x" :href="file.public_url" target="_blank" rel="noopener"><Icon name="ext" :size="12" /> Lien public</a>
          <button v-if="!readOnly" class="vw__x" @click="toggleFilePublic"><Icon name="ext" :size="12" /> {{ file.public ? 'Rendre privé' : 'Partager ce fichier' }}</button>
          <button v-if="!readOnly" class="vw__x vw__x--danger" @click="removeFile">Supprimer</button>
        </div>
      </div>
    </template>
    <AttachmentViewer :file="preview" @close="preview = null" />
  </div>
</template>

<style scoped>
.vw { min-width: 0; background: var(--color-surface); padding: 26px 30px; }
.vw__empty, .vw__novalue { font-size: 13px; }
.vw__hd { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 10px 12px; margin-bottom: 18px; }
.vw__hdic { flex: none; display: grid; place-items: center; width: 40px; height: 40px; border-radius: var(--radius-md); background: var(--color-paper-2); border: 1px solid var(--color-hair); color: var(--color-ink-soft); }
.vw__hdtxt { flex: 1 1 240px; min-width: 0; }
.vw__hdrow { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.vw__title { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -.02em; color: var(--color-ink); }
.vw__eb { font-family: var(--font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: .16em; text-transform: uppercase; color: var(--color-faint); margin-top: 5px; }
.vw__hint { font-size: 12.5px; color: var(--color-mute); line-height: 1.5; margin-top: 4px; font-style: italic; }
.vw__hdact { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }

.vw__x { display: inline-flex; align-items: center; gap: 5px; height: 30px; border: 1px solid var(--color-hair); background: var(--color-surface); border-radius: var(--radius-pill); padding: 0 12px; font-family: var(--font-sans); font-size: 11.5px; font-weight: 600; color: var(--color-ink-soft); cursor: pointer; text-decoration: none; }
.vw__x:hover { background: var(--color-paper-2); }
.vw__x--danger { color: var(--color-terra-ink); border-color: var(--color-terra-soft); }

.vw__page { max-width: 720px; margin-inline: auto; }
.vw__page--editable { cursor: text; }
.vw__editopts { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
.vw__editopts .vw__descin { margin: 0; flex: 1; }
.vw__embed { margin: 18px 0; }
.vw__pageact { display: flex; gap: 7px; flex-wrap: wrap; margin-top: 16px; }
.vw__titlein { width: 100%; max-width: 720px; border: 1px solid var(--color-hair); border-radius: var(--radius-md); padding: 8px 11px; font: inherit; font-size: 16px; font-weight: 700; color: var(--color-ink); background: var(--color-surface); margin-bottom: 10px; margin-inline: auto; }
.vw__descin { width: 100%; max-width: 720px; display: block; border: 1px solid var(--color-hair); border-radius: var(--radius-md); padding: 7px 11px; font: inherit; font-size: 12.5px; color: var(--color-ink-soft); background: var(--color-surface); margin-bottom: 10px; margin-inline: auto; }
.vw__area { width: 100%; max-width: 720px; border: 1px solid var(--color-hair); border-radius: var(--radius-md); padding: 11px 13px; font-family: var(--font-sans); font-size: 13.5px; line-height: 1.6; color: var(--color-ink-soft); background: var(--color-surface); resize: vertical; box-sizing: border-box; margin-inline: auto; }
.vw__editact { display: flex; align-items: center; gap: 9px; margin-top: 10px; }
.vw__kind { border: 1px solid var(--color-hair); border-radius: var(--radius-md); padding: 4px 8px; font: inherit; font-size: 11.5px; background: var(--color-surface); }
.vw__panel { margin-top: 16px; border-top: 1px solid var(--color-hair-soft); padding-top: 10px; max-width: 720px; margin-inline: auto; }
.vw__citedby { display: inline-flex; align-items: center; gap: 6px; margin: 0 6px 6px 0; padding: 4px 10px; border: 1px solid var(--color-hair); border-radius: var(--radius-pill); background: var(--color-surface); color: var(--color-ink-soft); font: inherit; font-size: 12px; cursor: pointer; }
.vw__citedby:hover { background: var(--color-paper-2); color: var(--color-ink); }
.vw__rev { display: flex; align-items: center; gap: 8px; padding: 5px 0; }

.vw__block { max-width: 660px; display: flex; flex-direction: column; align-items: flex-start; gap: 0; }
.vw__sub { font-family: var(--font-mono); font-size: 9.5px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--color-faint); margin-bottom: 7px; }
.vw__select { width: 100%; max-width: 340px; border: 1px solid var(--color-hair); border-radius: var(--radius-md); padding: 8px 11px; font-family: var(--font-sans); font-size: 13px; color: var(--color-ink); background: var(--color-surface); }
.vw__open { display: inline-flex; align-items: center; gap: 5px; margin-top: 16px; font-size: 12.5px; font-weight: 600; color: var(--color-cobalt); text-decoration: none; }
.vw__open:hover { text-decoration: underline; }

/* outils exposés (connecteur) */
.vw__tools { display: flex; gap: 6px; flex-wrap: wrap; }
.vw__tool { font-family: var(--font-mono); font-size: 10.5px; padding: 3px 10px; border: 1px solid var(--color-hair); border-radius: var(--radius-pill); background: var(--color-paper); color: var(--color-ink-soft); }

/* aperçu tableau */
.vw__tbl { width: 100%; border: 1px solid var(--color-hair); border-radius: var(--radius-md); overflow: hidden; }
.vw__tblhd, .vw__tblr { display: flex; gap: 12px; padding: 8px 14px; }
.vw__tblhd { background: var(--color-paper); border-bottom: 1px solid var(--color-hair); }
.vw__tblr { border-bottom: 1px solid var(--color-hair-soft); font-size: 12.5px; color: var(--color-ink-soft); }
.vw__tblr:last-child { border-bottom: 0; }
.vw__tblhd .vw__tblc { font-family: var(--font-mono); font-size: 9.5px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--color-faint); }
.vw__tblc { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* contenu d'une procédure : résumé en tête, corps replié dans un cadre qui défile */
.vw__procsum { font-size: 13.5px; line-height: 1.6; color: var(--color-ink-soft); margin: 0 0 12px; max-width: 660px; }
.vw__procfold { display: inline-flex; align-items: center; gap: 6px; padding: 0; border: 0; background: none; cursor: pointer;
  font-family: var(--font-mono); font-size: 9.5px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--color-faint); }
.vw__procfold:hover { color: var(--color-ink-soft); }
/* Le corps va jusqu'à ~15 000 caractères : il DÉFILE au lieu d'étirer la page. */
.vw__procbody { margin-top: 10px; max-height: 460px; overflow-y: auto; padding: 12px 14px;
  border: 1px solid var(--color-hair); border-radius: var(--radius-md); background: var(--color-paper); }

/* dernières exécutions (procédure) */
.vw__runs { display: flex; flex-direction: column; width: 100%; max-width: 560px; }
.vw__run { display: flex; align-items: center; gap: 9px; padding: 7px 0; border-bottom: 1px solid var(--color-hair-soft); }
.vw__run:last-child { border-bottom: 0; }
.vw__rundot { width: 7px; height: 7px; border-radius: var(--radius-pill); flex: none; }
.vw__runt { font-family: var(--font-mono); font-size: 10px; color: var(--color-faint); width: 62px; flex: none; }
.vw__runl { flex: 1; min-width: 0; font-size: 12.5px; color: var(--color-ink-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vw__runo { font-family: var(--font-mono); font-size: 10px; color: var(--color-mute); flex: none; }
/* La ligne de run est cliquable : elle déplie le FIL du run hébergé (lecture neutre).
   Bouton nu pour l'accessibilité clavier, même dessin que la ligne inerte. */
.vw__run--btn { width: 100%; background: none; border: 0; border-bottom: 1px solid var(--color-hair-soft); text-align: left; cursor: pointer; font: inherit; }
.vw__run--btn:hover .vw__runl { color: var(--color-ink); }
.vw__fil { margin: 2px 0 8px 16px; padding: 8px 10px; border-left: 2px solid var(--color-hair); }
.vw__filmsgs { display: flex; flex-direction: column; gap: 6px; }
.vw__filmsg { display: flex; gap: 8px; align-items: baseline; }
.vw__filrole { font-family: var(--font-mono); font-size: 10px; color: var(--color-mute); flex: none; width: 62px; text-transform: uppercase; letter-spacing: 0.04em; }
.vw__filrole[data-role="assistant"] { color: var(--color-ink-soft); }
.vw__filtxt { font-size: 12.5px; color: var(--color-ink-soft); line-height: 1.5; white-space: pre-wrap; word-break: break-word; min-width: 0; }
.vw__filcont { display: flex; gap: 8px; margin-top: 10px; }
.vw__filin { flex: 1; min-width: 0; }
.vw__filbtn { border: 1px solid var(--color-hair); background: none; color: var(--color-ink-soft); font: inherit; font-size: 12.5px; padding: 4px 14px; border-radius: var(--radius-pill); cursor: pointer; }
.vw__filbtn:hover:not(:disabled) { color: var(--color-ink); border-color: var(--color-mute); }
.vw__filbtn:disabled { opacity: 0.5; cursor: default; }

.vw__filebox { display: grid; place-items: center; height: 190px; width: 100%; background: var(--color-paper-2); border: 1px dashed var(--color-hair); border-radius: var(--radius-md); margin-bottom: 14px; color: var(--color-mute); gap: 7px; grid-auto-flow: row; cursor: pointer; font: inherit; }
.vw__filebox:hover { border-color: var(--color-ink-soft); color: var(--color-ink-soft); }
.vw__filehint { font-family: var(--font-mono); font-size: 10px; letter-spacing: .12em; text-transform: uppercase; }
.vw__filemeta { display: flex; gap: 14px; padding: 10px 0; border-bottom: 1px solid var(--color-hair-soft); font-size: 13px; color: var(--color-ink-soft); width: 100%; }
.vw__filek { flex: none; width: 104px; font-family: var(--font-mono); font-size: 9.5px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--color-faint); }
.vw__fileact { display: flex; gap: 7px; flex-wrap: wrap; margin-top: 13px; }
.card-eb { font-family: var(--font-mono); font-size: 10px; font-weight: 600; letter-spacing: .16em; text-transform: uppercase; color: var(--color-mute); }
</style>
