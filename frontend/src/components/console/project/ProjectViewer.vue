<script setup lang="ts">
// Viewer POLYMORPHE d'un projet (refonte UX, ADR 0032) — colonne GAUCHE du navigateur.
// Rend l'entité/page sélectionnée dans le rail selon son `kind` (6 formes). Réutilise la
// logique de câblage existante (ProjectWiki pour les pages, ProjectEntities pour la
// surcharge connecteur) — même appels API, remontés au parent par events.
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Icon from '@/components/console/Icon.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import OtoSelect from '@/components/console/OtoSelect.vue'
import MarkdownView from '@/components/console/MarkdownView.vue'
// Éditeur TipTap en chunk séparé : chargé au premier passage en mode édition seulement.
const MarkdownEditor = defineAsyncComponent(() => import('@/components/console/MarkdownEditor.vue'))
import AttachmentViewer from '@/components/console/AttachmentViewer.vue'
import DatastoreTable from '@/components/console/DatastoreTable.vue'
import {
  updateDoc, deleteDoc, setDocPublic, getDocRevisions, getBacklinks,
  requestDocChange, listDocChanges, resolveDocChange,
  getConnectorIdentities, linkProject, unlinkProject,
  setProjectFilePublic, deleteProjectFile,
  getToolRegistry, getConnectors, getProjectRuns,
} from '@/api/console'
import type {
  Doc, DocKind, DocRevision, DocChangeRequest, ProjectLink, ConnectorIdentity,
  ToolRegistryEntry, ConnectorMeta, ProjectRun, ProjectFile,
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
import type { RailItem } from './rail'

const props = defineProps<{
  item: RailItem | null
  projectId: number
  projectName: string
  brief?: string | null
  readOnly?: boolean
  docTitleMap?: Record<string, number>   // casefold(titre)→id (résolution [[…]], Ship 4)
}>()
const emit = defineEmits<{
  'save-brief': [string]
  'reload-docs': []
  'reload-files': []
  changed: []
  'open-doc': [number]
  'add-subpage': [number]
  'reload-links': []
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
  procedure: 'procédure · déroulé chargé à la demande', doc: 'document lié',
  file: 'fichier importé',
}
const eyebrow = computed(() => {
  if (isHome.value) return "brief · point d'entrée de l'agent"
  // Chapô (Ship 2) : le sous-titre curé de la page remplace le générique « page ».
  if (kind.value === 'page') return doc.value?.description || 'page'
  return KIND_EYEBROW[kind.value] ?? ''
})

// ═══════════ PAGE (accueil = brief, ou page Documents) ═══════════
const editing = ref(false)
const briefDraft = ref(props.brief ?? '')
const draft = ref<{ title: string; body_md: string; kind: DocKind; description: string } | null>(null)
const revisions = ref<DocRevision[]>([])
const showHistory = ref(false)
const changeRequests = ref<DocChangeRequest[]>([])
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
  showHistory.value = false; revisions.value = []; changeRequests.value = []
  briefDraft.value = props.brief ?? ''
  const d = doc.value
  draft.value = d ? { title: d.title, body_md: d.body_md, kind: d.kind, description: d.description ?? '' } : null
  backlinks.value = []
  if (d && !props.readOnly) void loadRequests(d.id)
  if (d) void loadBacklinks(d.id)
}
async function loadBacklinks(id: number) {
  try { backlinks.value = (await getBacklinks(id)).backlinks } catch { backlinks.value = [] }
}

// brief
function editBrief() { briefDraft.value = props.brief ?? ''; editing.value = true }
function cancelBrief() { briefDraft.value = props.brief ?? ''; editing.value = false }
function saveBrief() { emit('save-brief', briefDraft.value); editing.value = false }

// doc page
function editDoc() { const d = doc.value; if (d) { draft.value = { title: d.title, body_md: d.body_md, kind: d.kind, description: d.description ?? '' }; editing.value = true } }
function cancelDoc() { const d = doc.value; if (d) draft.value = { title: d.title, body_md: d.body_md, kind: d.kind, description: d.description ?? '' }; editing.value = false }
async function saveDoc() {
  const d = doc.value
  if (!d || !draft.value) return
  try { await updateDoc(d.id, { ...draft.value }); editing.value = false; emit('reload-docs'); emit('changed'); toast('page enregistrée') }
  catch (e) { toast(humanize(e)) }
}
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
function proposeChange() {
  const d = doc.value
  if (!d || !draft.value) return
  const dr = draft.value
  void requestDocChange(d.id, { title: dr.title, body_md: dr.body_md, message: '' })
    .then(() => { editing.value = false; toast('demande de modification envoyée') })
    .catch((e) => toast(humanize(e)))
}
async function loadRequests(id: number) {
  try { changeRequests.value = (await listDocChanges(id)).requests } catch { /* pas le droit */ }
}
async function resolveRequest(req: DocChangeRequest, accept: boolean) {
  const d = doc.value
  if (!d) return
  if (accept && !await confirmAction({ title: 'Accepter cette modification', message: "Le contenu proposé remplacera la version actuelle (conservée dans l'historique)." })) return
  try { await resolveDocChange(req.id, accept); emit('reload-docs'); emit('changed'); await loadRequests(d.id); toast(accept ? 'modification appliquée' : 'demande refusée') }
  catch (e) { toast(humanize(e)) }
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

const body = computed(() => (isHome.value ? props.brief : doc.value?.body_md) ?? '')
const hasBody = computed(() => !!body.value && body.value.trim().length > 0)

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

// Charge les extras de l'entité sélectionnée (identités+outils / runs) selon son type.
watch(item, async () => {
  identities.value = []; connectorTools.value = []; runs.value = []
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
          <div class="vw__hdrow">
            <h3 class="vw__title">{{ title }}</h3>
            <Tag v-if="kind === 'page' && doc && doc.kind !== 'doc'">{{ KIND_LABEL[doc.kind] }}</Tag>
            <Tag v-if="kind === 'page' && doc?.public" tone="cobalt">public</Tag>
            <Tag v-if="link?.cross_project" tone="saffron">partagé</Tag>
          </div>
          <div v-if="eyebrow" class="vw__eb">{{ eyebrow }}</div>
          <div v-if="link?.role" class="vw__hint">{{ link.role }}</div>
        </div>
        <!-- actions d'en-tête (pages) -->
        <div v-if="kind === 'page'" class="vw__hdact">
          <template v-if="!editing">
            <button v-if="!isHome && !readOnly" class="vw__x" @click="emit('add-subpage', doc!.id)"><Icon name="plus" :size="12" /> sous-page</button>
            <button v-if="!readOnly" class="vw__x" @click="isHome ? editBrief() : editDoc()"><Icon name="pencil" :size="12" /> éditer</button>
            <button v-else-if="!isHome" class="vw__x" @click="editDoc"><Icon name="pencil" :size="12" /> proposer une modif</button>
          </template>
          <template v-else>
            <template v-if="isHome"><Btn kind="mini" @click="saveBrief">Enregistrer</Btn><button class="vw__x" @click="cancelBrief">Annuler</button></template>
            <template v-else-if="!readOnly">
              <OtoSelect v-if="draft" v-model="draft.kind" :options="KIND_OPTIONS" size="sm" aria-label="type de page" />
              <Btn kind="mini" @click="saveDoc">Enregistrer</Btn><button class="vw__x" @click="cancelDoc">Annuler</button>
            </template>
            <template v-else><Btn kind="mini" @click="proposeChange">Proposer une modif</Btn><button class="vw__x" @click="cancelDoc">Annuler</button></template>
          </template>
        </div>
      </header>

      <!-- ═══ PAGE ═══ -->
      <template v-if="kind === 'page'">
        <!-- édition (brief ou doc) -->
        <template v-if="editing">
          <input v-if="!isHome && draft" v-model="draft.title" class="vw__titlein" placeholder="Titre de la page" />
          <input v-if="!isHome && draft" v-model="draft.description" class="vw__descin"
            placeholder="Sous-titre (une ligne — aide à repérer la page dans l'arbre et la recherche)" />
          <MarkdownEditor v-if="isHome" v-model="briefDraft"
            placeholder="Le but du projet, le contexte, ce que l'agent doit savoir au démarrage…" />
          <MarkdownEditor v-else-if="draft" v-model="draft.body_md" placeholder="Contenu de la page…" />
        </template>

        <!-- lecture -->
        <template v-else>
          <div class="vw__page">
            <MarkdownView v-if="hasBody" :source="body"
              :resolve-link="kind === 'page' ? resolveLink : undefined"
              @navigate-doc="(id) => emit('open-doc', id)"
              @create-stub="(t) => emit('create-page', t)" />
            <p v-else class="dim vw__novalue">{{ readOnly ? 'aucun contenu.' : (isHome ? 'aucun brief — clique « éditer » pour le rédiger.' : 'page vide — clique « éditer ».') }}</p>
          </div>

          <!-- actions secondaires page (doc) -->
          <div v-if="!isHome && doc" class="vw__pageact">
            <button class="vw__x" @click="toggleHistory">{{ showHistory ? "Masquer l'historique" : 'Historique' }}</button>
            <button v-if="!readOnly" class="vw__x" @click="toggleDocPublic">{{ doc.public ? 'Rendre privé' : 'Partager par lien' }}</button>
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

          <!-- demandes de modif (propriétaire) -->
          <div v-if="!readOnly && changeRequests.length" class="vw__panel">
            <div class="card-eb" style="margin-bottom: 6px">demandes de modification · {{ changeRequests.length }}</div>
            <div v-for="req in changeRequests" :key="req.id" class="vw__rev">
              <div style="flex: 1; min-width: 0">
                <span class="dim" style="font-size: 11px">{{ req.requested_by || '—' }} · {{ fmtDate(req.created_at) }}</span>
                <div v-if="req.message" style="font-size: 12px; color: var(--color-ink-soft)">{{ req.message }}</div>
              </div>
              <button class="vw__x" @click="resolveRequest(req, true)">Accepter</button>
              <button class="vw__x" @click="resolveRequest(req, false)">Refuser</button>
            </div>
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
          <p v-if="toolsLoading" class="dim" style="font-size: 12.5px">chargement…</p>
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
      <div v-else-if="kind === 'tableau' && link" class="vw__block">
        <DatastoreTable :ns-ref="link.target_ref" :govern="false" />
      </div>

      <!-- ═══ PROCÉDURE (déroulé + derniers runs) ═══ -->
      <div v-else-if="kind === 'procedure'" class="vw__block">
        <p class="dim" style="font-size: 13px; line-height: 1.6">Procédure (déroulé opératoire) liée à ce projet — chargée à la demande par l'agent.</p>
        <template v-if="runs.length">
          <div class="vw__sub" style="margin-top: 16px">derniers runs</div>
          <div class="vw__runs">
            <div v-for="r in runs" :key="r.run_id" class="vw__run">
              <span class="vw__rundot" :style="{ background: runDot(r.outcome) }"></span>
              <span class="vw__runt">{{ fmtDate(r.started_at) }}</span>
              <span class="vw__runl">{{ r.label }}</span>
              <span class="vw__runo" :class="{ dim: !r.outcome }">{{ r.outcome || 'en cours' }}</span>
            </div>
          </div>
        </template>
        <p v-else-if="runsLoading" class="dim" style="font-size: 12.5px; margin-top: 12px">chargement des runs…</p>
        <p v-else class="dim" style="font-size: 12.5px; margin-top: 12px">Aucun run enregistré pour cette procédure dans ce projet.</p>
        <RouterLink v-if="openHref" class="vw__open" :to="openHref">Ouvrir la procédure <Icon name="ext" :size="12" /></RouterLink>
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
          <button v-if="!readOnly" class="vw__x" @click="toggleFilePublic">{{ file.public ? 'Rendre privé' : 'Partager par lien public' }}</button>
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

/* derniers runs (procédure) */
.vw__runs { display: flex; flex-direction: column; width: 100%; max-width: 560px; }
.vw__run { display: flex; align-items: center; gap: 9px; padding: 7px 0; border-bottom: 1px solid var(--color-hair-soft); }
.vw__run:last-child { border-bottom: 0; }
.vw__rundot { width: 7px; height: 7px; border-radius: var(--radius-pill); flex: none; }
.vw__runt { font-family: var(--font-mono); font-size: 10px; color: var(--color-faint); width: 62px; flex: none; }
.vw__runl { flex: 1; min-width: 0; font-size: 12.5px; color: var(--color-ink-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vw__runo { font-family: var(--font-mono); font-size: 10px; color: var(--color-mute); flex: none; }

.vw__filebox { display: grid; place-items: center; height: 190px; width: 100%; background: var(--color-paper-2); border: 1px dashed var(--color-hair); border-radius: var(--radius-md); margin-bottom: 14px; color: var(--color-mute); gap: 7px; grid-auto-flow: row; cursor: pointer; font: inherit; }
.vw__filebox:hover { border-color: var(--color-ink-soft); color: var(--color-ink-soft); }
.vw__filehint { font-family: var(--font-mono); font-size: 10px; letter-spacing: .12em; text-transform: uppercase; }
.vw__filemeta { display: flex; gap: 14px; padding: 10px 0; border-bottom: 1px solid var(--color-hair-soft); font-size: 13px; color: var(--color-ink-soft); width: 100%; }
.vw__filek { flex: none; width: 104px; font-family: var(--font-mono); font-size: 9.5px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--color-faint); }
.vw__fileact { display: flex; gap: 7px; flex-wrap: wrap; margin-top: 13px; }
.card-eb { font-family: var(--font-mono); font-size: 10px; font-weight: 600; letter-spacing: .16em; text-transform: uppercase; color: var(--color-mute); }
</style>
