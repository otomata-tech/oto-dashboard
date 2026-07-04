<script setup lang="ts">
// Atelier d'un projet en WIKI (oto-dashboard#37) : le brief est la page d'ACCUEIL,
// les pages (oto_doc) s'y rattachent en arbre et se NAVIGUENT — arbre à gauche, page
// courante à droite (lecture markdown par défaut, édition à la demande), fil d'ariane,
// deep-link `?doc=<id>` (`?doc` absent = accueil/brief). Fusion brief↔page (ADR 0032,
// « tout est une page ») : un seul espace parcourable, plus des cartes empilées.
// Remplace ProjectDocs. Le brief reste un champ du projet → persisté par le parent
// (@save-brief) ; les pages sont gérées ici (capacité oto_doc).
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Btn from '@/components/console/Btn.vue'
import Tag from '@/components/console/Tag.vue'
import MarkdownView from '@/components/console/MarkdownView.vue'
import FormDialog from '@/components/console/FormDialog.vue'
import { listDocs, createDoc, updateDoc, deleteDoc, getDocRevisions,
  requestDocChange, listDocChanges, resolveDocChange, setDocPublic } from '@/api/console'
import type { Doc, DocKind, DocRevision, DocChangeRequest } from '@/types/api'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useFormDialog } from '@/composables/useFormDialog'

const props = defineProps<{ projectId: number; projectName: string; brief?: string | null; readOnly?: boolean }>()
const emit = defineEmits<{ changed: []; 'save-brief': [value: string] }>()
const route = useRoute()
const router = useRouter()
const { toast } = useToast()
const { confirmAction } = usePrompt()
const { formDialog, formDialogOpen, openForm } = useFormDialog()

const docs = ref<Doc[]>([])
// selectedId : null = accueil (brief) ; sinon l'id du doc ouvert.
const selectedId = ref<number | null>(null)
const editing = ref(false)
const briefDraft = ref(props.brief ?? '')
const draft = ref<{ title: string; body_md: string; kind: DocKind } | null>(null)
const revisions = ref<DocRevision[]>([])
const showHistory = ref(false)
const changeRequests = ref<DocChangeRequest[]>([])

const KIND_LABEL: Record<DocKind, string> = { doc: 'doc', note: 'note agent', source: 'source' }
const selected = computed(() => docs.value.find((d) => d.id === selectedId.value) ?? null)
const topLevel = computed(() => docs.value.filter((d) => d.parent_id == null))
const childrenOf = (id: number) => docs.value.filter((d) => d.parent_id === id)
const parentOf = (d: Doc | null) => (d && d.parent_id != null ? docs.value.find((x) => x.id === d.parent_id) ?? null : null)
const briefDirty = computed(() => briefDraft.value !== (props.brief ?? ''))
const docDirty = computed(() => !!selected.value && !!draft.value && (
  draft.value.title !== selected.value.title ||
  draft.value.body_md !== selected.value.body_md ||
  draft.value.kind !== selected.value.kind))

async function load() {
  try { docs.value = (await listDocs(props.projectId)).docs }
  catch (e) { toast(humanize(e)) }
}
onMounted(async () => { await load(); applyQuery() })
// Le brief peut changer côté parent (sauvegarde) → resynchronise le brouillon hors édition.
watch(() => props.brief, (v) => { if (!editing.value || selectedId.value !== null) briefDraft.value = v ?? '' })
// Deep-link : ?doc=<id> pilote la sélection (back/forward, lien partageable).
watch(() => route.query.doc, () => applyQuery())

function applyQuery() {
  const raw = route.query.doc
  const id = raw != null ? Number(Array.isArray(raw) ? raw[0] : raw) : NaN
  if (Number.isFinite(id) && docs.value.some((d) => d.id === id)) openDoc(id)
  else selectHome()
}
function pushDoc(id: number | null) {
  const q = { ...route.query }
  if (id == null) delete q.doc
  else q.doc = String(id)
  router.replace({ query: q })
}

function selectHome() {
  selectedId.value = null
  editing.value = false
  briefDraft.value = props.brief ?? ''
  if (route.query.doc != null) pushDoc(null)
}
function openDoc(id: number) {
  const d = docs.value.find((x) => x.id === id)
  if (!d) { selectHome(); return }
  selectedId.value = id
  draft.value = { title: d.title, body_md: d.body_md, kind: d.kind }
  editing.value = false
  showHistory.value = false; revisions.value = []; changeRequests.value = []
  if (!props.readOnly) loadRequests(id)
  if (String(route.query.doc ?? '') !== String(id)) pushDoc(id)
}
function goHome() { selectHome() }
function goDoc(d: Doc) { openDoc(d.id) }

// ── brief (accueil) ──
function editBrief() { briefDraft.value = props.brief ?? ''; editing.value = true }
function cancelBrief() { briefDraft.value = props.brief ?? ''; editing.value = false }
function saveBrief() { emit('save-brief', briefDraft.value); editing.value = false }

// ── pages ──
function addDoc(parent_id: number | null) {
  openForm({
    title: parent_id ? 'Nouvelle sous-page' : 'Nouvelle page',
    fields: [{ key: 'title', label: 'Titre', required: true }], submitLabel: 'Créer',
    onConfirm: async (v) => {
      try { const d = await createDoc(props.projectId, String(v.title), { parent_id }); await load(); openDoc(d.id); emit('changed') }
      catch (e) { toast(humanize(e)); throw e }
    },
  })
}
function editDoc() {
  const d = selected.value
  if (!d) return
  draft.value = { title: d.title, body_md: d.body_md, kind: d.kind }
  editing.value = true
}
function cancelDoc() {
  const d = selected.value
  if (d) draft.value = { title: d.title, body_md: d.body_md, kind: d.kind }
  editing.value = false
}
async function saveDoc() {
  if (!selected.value || !draft.value) return
  try { await updateDoc(selected.value.id, { ...draft.value }); await load(); editing.value = false; emit('changed'); toast('page enregistrée') }
  catch (e) { toast(humanize(e)) }
}
async function remove(d: Doc) {
  if (!await confirmAction({ title: 'Supprimer la page', danger: true, confirmLabel: 'Supprimer',
    message: `Supprimer « ${d.title} » et ses sous-pages ?` })) return
  try { await deleteDoc(d.id); await load(); if (selectedId.value === d.id) selectHome(); emit('changed') }
  catch (e) { toast(humanize(e)) }
}
async function toggleDocPublic() {
  const d = selected.value
  if (!d) return
  try {
    const r = await setDocPublic(d.id, !d.public)
    const idx = docs.value.findIndex((x) => x.id === d.id)
    if (idx >= 0) docs.value[idx] = { ...d, public: r.public, public_url: r.public_url }
    if (r.public && r.public_url) { await navigator.clipboard.writeText(r.public_url).catch(() => {}); toast('lien public copié') }
    else toast('partage public retiré')
  } catch (e) { toast(humanize(e)) }
}
function proposeChange() {
  if (!selected.value || !draft.value) return
  const doc = selected.value, d = draft.value
  openForm({
    title: 'Proposer une modification',
    fields: [{ key: 'message', label: 'Message au propriétaire (optionnel)' }],
    submitLabel: 'Envoyer la demande',
    onConfirm: async (v) => {
      try { await requestDocChange(doc.id, { title: d.title, body_md: d.body_md, message: String(v.message || '') }); toast('demande de modification envoyée') }
      catch (e) { toast(humanize(e)); throw e }
    },
  })
}
async function loadRequests(id: number) {
  try { changeRequests.value = (await listDocChanges(id)).requests }
  catch { /* pas le droit : rien à afficher */ }
}
async function resolveRequest(req: DocChangeRequest, accept: boolean) {
  const id = selected.value?.id
  if (!id) return
  if (accept && !await confirmAction({ title: 'Accepter cette modification',
    message: 'Le contenu proposé remplacera la version actuelle (conservée dans l\'historique).' })) return
  try { await resolveDocChange(id, req.id, accept); await load(); openDoc(id); emit('changed'); toast(accept ? 'modification appliquée' : 'demande refusée') }
  catch (e) { toast(humanize(e)) }
}
async function toggleHistory() {
  if (!selected.value) return
  showHistory.value = !showHistory.value
  if (showHistory.value) {
    try { revisions.value = (await getDocRevisions(selected.value.id)).revisions }
    catch (e) { toast(humanize(e)) }
  }
}
async function restoreRevision(r: DocRevision) {
  const id = selected.value?.id
  if (!id) return
  if (!await confirmAction({ title: 'Restaurer cette version',
    message: `Remplacer le contenu actuel par la version du ${fmtDate(r.created_at)} ? La version actuelle est conservée dans l'historique.` })) return
  try {
    await updateDoc(id, { title: r.title, body_md: r.body_md })
    await load(); openDoc(id)
    revisions.value = (await getDocRevisions(id)).revisions; showHistory.value = true
    emit('changed'); toast('version restaurée')
  } catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="wiki surface-card">
    <!-- arbre : accueil (brief) + pages -->
    <nav class="wiki__nav">
      <div class="wiki__navhead">
        <span class="card-eb">pages</span>
        <Btn v-if="!readOnly" kind="mini" @click="addDoc(null)">+ Page</Btn>
      </div>
      <ul class="wtree">
        <li>
          <div class="wrow wrow--home" :class="{ on: selectedId === null }" @click="goHome">
            <span class="wrow__ic">⌂</span><span class="wrow__t">accueil</span>
          </div>
        </li>
        <li v-for="d in topLevel" :key="d.id">
          <div class="wrow" :class="{ on: selectedId === d.id }" @click="goDoc(d)">
            <span class="wrow__t">{{ d.title }}</span>
            <Tag v-if="d.kind !== 'doc'">{{ KIND_LABEL[d.kind] }}</Tag>
          </div>
          <ul v-if="childrenOf(d.id).length" class="wtree wtree--sub">
            <li v-for="c in childrenOf(d.id)" :key="c.id">
              <div class="wrow" :class="{ on: selectedId === c.id }" @click="goDoc(c)">
                <span class="wrow__t">{{ c.title }}</span>
                <Tag v-if="c.kind !== 'doc'">{{ KIND_LABEL[c.kind] }}</Tag>
              </div>
            </li>
          </ul>
        </li>
      </ul>
      <p v-if="!topLevel.length" class="dim wiki__empty">aucune page — « + page » pour structurer.</p>
    </nav>

    <!-- page courante -->
    <section class="wiki__main">
      <!-- ACCUEIL = brief -->
      <template v-if="selectedId === null">
        <div class="wiki__crumb"><span class="wiki__crumb-here">accueil</span></div>
        <div class="wiki__mainhead">
          <h2 class="wiki__title">{{ projectName }}</h2>
          <div class="wiki__acts">
            <button v-if="!editing && !readOnly" class="pj-x" @click="editBrief">Éditer</button>
          </div>
        </div>
        <p class="card-eb" style="margin-bottom: 8px">brief — point d'entrée de l'agent</p>
        <template v-if="editing">
          <textarea v-model="briefDraft" class="wiki__area" rows="14"
            placeholder="Le but du projet, le contexte, ce que l'agent doit savoir au démarrage…"></textarea>
          <div class="wiki__editact">
            <Btn kind="mini" @click="saveBrief">Enregistrer</Btn>
            <button class="pj-x" @click="cancelBrief">Annuler</button>
            <span v-if="briefDirty" class="dim" style="font-size: 11px">modifié</span>
          </div>
        </template>
        <template v-else>
          <MarkdownView v-if="brief && brief.trim()" :source="brief" />
          <p v-else class="dim" style="font-size: 12px">{{ readOnly ? 'aucun brief.' : 'aucun brief — clique « éditer » pour le rédiger.' }}</p>
        </template>
      </template>

      <!-- PAGE -->
      <template v-else-if="selected && draft">
        <div class="wiki__crumb">
          <a class="wiki__crumb-lnk" @click="goHome">accueil</a>
          <template v-if="parentOf(selected)"><span class="wiki__crumb-sep">›</span><a class="wiki__crumb-lnk" @click="goDoc(parentOf(selected)!)">{{ parentOf(selected)!.title }}</a></template>
          <span class="wiki__crumb-sep">›</span><span class="wiki__crumb-here">{{ selected.title }}</span>
        </div>
        <div class="wiki__mainhead">
          <input v-if="editing" v-model="draft.title" class="wiki__titlein" />
          <h2 v-else class="wiki__title">{{ selected.title }}</h2>
          <div class="wiki__acts">
            <Tag v-if="selected.public" tone="cobalt">public</Tag>
            <select v-if="editing" v-model="draft.kind" class="wiki__kind">
              <option value="doc">doc</option><option value="note">note agent</option><option value="source">source</option>
            </select>
            <template v-if="!editing">
              <button v-if="!readOnly" class="pj-x" @click="editDoc">Éditer</button>
              <button v-if="!readOnly" class="pj-x" @click="addDoc(selected.id)">+ Sous-page</button>
              <button class="pj-x" @click="toggleHistory">{{ showHistory ? 'Masquer l\'historique' : 'Historique' }}</button>
              <button v-if="!readOnly" class="pj-x" @click="toggleDocPublic">{{ selected.public ? 'Rendre privé' : 'Partager' }}</button>
              <button v-if="!readOnly" class="pj-x pj-x--danger" @click="remove(selected)">Supprimer</button>
            </template>
          </div>
        </div>

        <template v-if="editing">
          <textarea v-model="draft.body_md" class="wiki__area" rows="16" placeholder="Contenu de la page (markdown)…"></textarea>
          <div class="wiki__editact">
            <Btn v-if="!readOnly" kind="mini" @click="saveDoc">Enregistrer</Btn>
            <Btn v-else kind="mini" @click="proposeChange">Proposer une modif</Btn>
            <button class="pj-x" @click="cancelDoc">Annuler</button>
            <span v-if="docDirty" class="dim" style="font-size: 11px">{{ readOnly ? 'lecture seule — propose une modif' : 'modifié' }}</span>
          </div>
        </template>
        <template v-else>
          <MarkdownView v-if="selected.body_md && selected.body_md.trim()" :source="selected.body_md" />
          <p v-else class="dim" style="font-size: 12px">page vide — {{ readOnly ? 'rien à afficher.' : 'clique « éditer ».' }}</p>
        </template>

        <div v-if="!readOnly && changeRequests.length" class="wiki__panel">
          <div class="dim wiki__panelh">Demandes de modification ({{ changeRequests.length }})</div>
          <div v-for="req in changeRequests" :key="req.id" class="wiki__rev" style="align-items: flex-start">
            <div style="flex: 1; min-width: 0">
              <span class="dim" style="font-size: 11px">{{ req.requested_by || '—' }} · {{ fmtDate(req.created_at) }}</span>
              <div v-if="req.message" style="font-size: 12px; color: var(--color-ink-soft)">{{ req.message }}</div>
            </div>
            <button class="pj-x" @click="resolveRequest(req, true)">Accepter</button>
            <button class="pj-x" @click="resolveRequest(req, false)">Refuser</button>
          </div>
        </div>

        <div v-if="showHistory" class="wiki__panel">
          <div class="dim wiki__panelh">Historique des versions</div>
          <p v-if="!revisions.length" class="dim" style="font-size: 12px">aucune version antérieure.</p>
          <div v-for="r in revisions" :key="r.id" class="wiki__rev">
            <div style="flex: 1; min-width: 0">
              <span style="color: var(--color-ink)">{{ r.title }}</span>
              <span class="dim" style="font-size: 11px; margin-left: 6px">{{ fmtDate(r.created_at) }}<template v-if="r.edited_by"> · {{ r.edited_by }}</template></span>
            </div>
            <button class="pj-x" @click="restoreRevision(r)">Restaurer</button>
          </div>
        </div>
      </template>
    </section>

    <FormDialog v-if="formDialog" v-model:open="formDialogOpen"
      :title="formDialog.title" :description="formDialog.description"
      :fields="formDialog.fields" :submit-label="formDialog.submitLabel" :on-confirm="formDialog.onConfirm" />
  </div>
</template>

<style scoped>
.wiki { display: grid; grid-template-columns: 220px 1fr; gap: 0; padding: 0; overflow: hidden; }
@media (max-width: 720px) { .wiki { grid-template-columns: 1fr; } }

/* ── arbre ── */
.wiki__nav { border-right: 1px solid var(--color-hair); padding: 14px 12px; min-width: 0; }
@media (max-width: 720px) { .wiki__nav { border-right: none; border-bottom: 1px solid var(--color-hair); } }
.wiki__navhead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.wtree { list-style: none; margin: 0; padding: 0; }
.wtree--sub { padding-left: 12px; border-left: 1px solid var(--color-hair-soft); margin-left: 6px; }
.wrow { display: flex; align-items: center; gap: 6px; padding: 5px 8px; border-radius: 6px; cursor: pointer; font-size: 12.5px; color: var(--color-ink-soft); }
.wrow:hover { background: var(--color-paper-2); }
.wrow.on { background: var(--color-paper-3); color: var(--color-ink); font-weight: 600; }
.wrow__t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wrow__ic { font-size: 12px; opacity: .7; }
.wrow--home { font-weight: 600; }
.wiki__empty { font-size: 12px; margin-top: 8px; }

/* ── page courante ── */
.wiki__main { padding: 16px 18px; min-width: 0; }
.wiki__crumb { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--color-mute); margin-bottom: 8px; flex-wrap: wrap; }
.wiki__crumb-lnk { cursor: pointer; color: var(--color-mute); }
.wiki__crumb-lnk:hover { color: var(--color-ink); text-decoration: underline; }
.wiki__crumb-sep { color: var(--color-faint); }
.wiki__crumb-here { color: var(--color-ink-soft); font-weight: 600; }
.wiki__mainhead { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 10px; }
.wiki__title { flex: 1; min-width: 0; font-size: 19px; font-weight: 700; letter-spacing: -0.02em; color: var(--color-ink); margin: 0; }
.wiki__titlein { flex: 1; min-width: 0; border: 1px solid var(--color-hair); border-radius: 7px; padding: 6px 10px; font: inherit; font-size: 16px; font-weight: 700; color: var(--color-ink); background: var(--color-surface); }
.wiki__acts { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.wiki__kind { border: 1px solid var(--color-hair); border-radius: 6px; padding: 4px 6px; font: inherit; font-size: 11.5px; background: var(--color-surface); }
.wiki__area { width: 100%; border: 1px solid var(--color-hair); border-radius: 10px; padding: 11px 13px; font-family: var(--font-sans); font-size: 13.5px; line-height: 1.6; color: var(--color-ink-soft); background: var(--color-surface); resize: vertical; box-sizing: border-box; }
.wiki__editact { display: flex; align-items: center; gap: 9px; margin-top: 8px; }
.pj-x { border: 1px solid var(--color-hair); background: var(--color-surface); border-radius: 6px; padding: 3px 9px; font-size: 11px; color: var(--color-ink-soft); cursor: pointer; }
.pj-x:hover { background: var(--color-paper-2); }
.pj-x--danger { color: var(--color-terra-ink); border-color: var(--color-terra-soft); }
.wiki__panel { margin-top: 12px; border-top: 1px solid var(--color-hair-soft); padding-top: 9px; }
.wiki__panelh { font-size: 11px; font-weight: 700; margin-bottom: 4px; }
.wiki__rev { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
</style>
