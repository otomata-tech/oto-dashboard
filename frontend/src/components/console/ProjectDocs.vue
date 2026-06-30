<script setup lang="ts">
// Documents d'un projet (incrément 3) : arbre de pages markdown + éditeur. Le brief
// du projet reste la page d'entrée (géré par le parent) ; ici les sous-pages.
import { computed, onMounted, ref, watch } from 'vue'
import Btn from '@/components/console/Btn.vue'
import Tag from '@/components/console/Tag.vue'
import { listDocs, createDoc, updateDoc, deleteDoc, getDocRevisions } from '@/api/console'
import type { Doc, DocKind, DocRevision } from '@/types/api'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'

const props = defineProps<{ projectId: number }>()
const emit = defineEmits<{ changed: [] }>()
const { toast } = useToast()
const { promptForm, confirmAction } = usePrompt()

const docs = ref<Doc[]>([])
const selectedId = ref<number | null>(null)
const draft = ref<{ title: string; body_md: string; kind: DocKind } | null>(null)
const revisions = ref<DocRevision[]>([])
const showHistory = ref(false)

const selected = computed(() => docs.value.find((d) => d.id === selectedId.value) ?? null)
const topLevel = computed(() => docs.value.filter((d) => d.parent_id == null))
const childrenOf = (id: number) => docs.value.filter((d) => d.parent_id === id)
const dirty = computed(() => !!selected.value && !!draft.value && (
  draft.value.title !== selected.value.title ||
  draft.value.body_md !== selected.value.body_md ||
  draft.value.kind !== selected.value.kind))
const KIND_LABEL: Record<DocKind, string> = { doc: 'doc', note: 'note agent', source: 'source' }

async function load() {
  try { docs.value = (await listDocs(props.projectId)).docs }
  catch (e) { toast(humanize(e)) }
}
onMounted(load)
watch(() => props.projectId, () => { selectedId.value = null; draft.value = null; load() })

function open(d: Doc) {
  selectedId.value = d.id
  draft.value = { title: d.title, body_md: d.body_md, kind: d.kind }
  showHistory.value = false; revisions.value = []
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
    await load()
    const d = docs.value.find((x) => x.id === id); if (d) open(d)
    revisions.value = (await getDocRevisions(id)).revisions
    showHistory.value = true
    emit('changed'); toast('version restaurée')
  } catch (e) { toast(humanize(e)) }
}

async function addDoc(parent_id: number | null) {
  const r = await promptForm({
    title: parent_id ? 'Nouvelle sous-page' : 'Nouvelle page',
    fields: [{ key: 'title', label: 'Titre', required: true }], submitLabel: 'Créer',
  })
  if (!r) return
  try { const d = await createDoc(props.projectId, String(r.title), { parent_id }); await load(); open(d); emit('changed') }
  catch (e) { toast(humanize(e)) }
}
async function save() {
  if (!selected.value || !draft.value) return
  try { await updateDoc(selected.value.id, { ...draft.value }); await load(); emit('changed'); toast('page enregistrée') }
  catch (e) { toast(humanize(e)) }
}
async function remove(d: Doc) {
  if (!await confirmAction({ title: 'Supprimer la page', danger: true, confirmLabel: 'Supprimer',
    message: `Supprimer « ${d.title} » et ses sous-pages ?` })) return
  try {
    await deleteDoc(d.id)
    if (selectedId.value === d.id) { selectedId.value = null; draft.value = null }
    await load(); emit('changed')
  } catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div>
    <div class="subh" style="display: flex; align-items: center">
      Pages <Btn kind="mini" style="margin-left: auto" @click="addDoc(null)">+ page</Btn>
    </div>
    <ul v-if="docs.length" class="doc-tree">
      <li v-for="d in topLevel" :key="d.id">
        <div class="doc-row" :class="{ on: selectedId === d.id }" @click="open(d)">
          <span style="flex: 1">{{ d.title }}</span>
          <Tag v-if="d.kind !== 'doc'">{{ KIND_LABEL[d.kind] }}</Tag>
        </div>
        <ul v-if="childrenOf(d.id).length" class="doc-sub">
          <li v-for="c in childrenOf(d.id)" :key="c.id" class="doc-row" :class="{ on: selectedId === c.id }" @click="open(c)">
            <span style="flex: 1">{{ c.title }}</span>
            <Tag v-if="c.kind !== 'doc'">{{ KIND_LABEL[c.kind] }}</Tag>
          </li>
        </ul>
      </li>
    </ul>
    <p v-else class="dim" style="font-size: 12px">aucune page — la première structure ton projet.</p>

    <!-- éditeur de la page sélectionnée -->
    <div v-if="selected && draft" class="doc-editor">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px">
        <input v-model="draft.title" class="doc-title" />
        <select v-model="draft.kind" class="doc-kind">
          <option value="doc">doc</option><option value="note">note agent</option><option value="source">source</option>
        </select>
        <button class="pj-x" title="sous-page" @click="addDoc(selected.id)">+ sous-page</button>
        <button class="pj-x" @click="toggleHistory">{{ showHistory ? 'masquer l\'historique' : 'historique' }}</button>
        <button class="pj-x" @click="remove(selected)">supprimer</button>
      </div>
      <textarea v-model="draft.body_md" class="pj-brief" rows="8" placeholder="Contenu de la page (markdown)…"></textarea>
      <div style="margin-top: 6px">
        <Btn kind="mini" @click="save">Enregistrer</Btn>
        <span v-if="dirty" class="dim" style="font-size: 11px; margin-left: 8px">modifié</span>
      </div>

      <div v-if="showHistory" class="doc-history">
        <div class="dim" style="font-size: 11px; font-weight: 700; margin-bottom: 4px">Historique des versions</div>
        <p v-if="!revisions.length" class="dim" style="font-size: 12px">aucune version antérieure.</p>
        <div v-for="r in revisions" :key="r.id" class="doc-rev">
          <div style="flex: 1; min-width: 0">
            <span style="color: var(--color-ink)">{{ r.title }}</span>
            <span class="dim" style="font-size: 11px; margin-left: 6px">{{ fmtDate(r.created_at) }}<template v-if="r.edited_by"> · {{ r.edited_by }}</template></span>
          </div>
          <button class="pj-x" @click="restoreRevision(r)">restaurer</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.doc-tree { list-style: none; margin: 0 0 8px; padding: 0; }
.doc-sub { list-style: none; margin: 0; padding-left: 16px; }
.doc-row { display: flex; align-items: center; gap: 6px; padding: 5px 8px; border-radius: 6px; cursor: pointer; font-size: 12.5px; color: var(--color-ink-soft, #4a463d); }
.doc-row:hover { background: #faf9f7; }
.doc-row.on { background: var(--color-paper-3, #f5f1e8); color: var(--color-ink, #2a2a2a); font-weight: 600; }
.doc-editor { margin-top: 8px; border-top: 1px solid var(--color-hair-soft, #e6e6e3); padding-top: 10px; }
.doc-title { flex: 1; border: 1px solid var(--color-hair-soft, #cfcfcf); border-radius: 6px; padding: 6px 9px; font: inherit; font-size: 13px; font-weight: 600; color: var(--color-ink, #2a2a2a); }
.doc-kind { border: 1px solid var(--color-hair-soft, #cfcfcf); border-radius: 6px; padding: 6px; font: inherit; font-size: 12px; background: #fff; }
.subh { margin: 16px 0 6px; font-size: 11px; color: var(--color-faint, #9a9a9a); text-transform: uppercase; letter-spacing: .05em; }
.pj-brief { width: 100%; border: 1px solid var(--color-hair-soft, #cfcfcf); border-radius: 8px; padding: 9px 11px; font: inherit; font-size: 13px; line-height: 1.5; resize: vertical; background: #fff; color: var(--color-ink, #2a2a2a); }
.pj-x { border: 1px solid var(--color-hair-soft, #cfcfcf); background: #fff; border-radius: 6px; padding: 3px 8px; font-size: 11px; color: var(--color-ink-soft, #6b6b6b); cursor: pointer; }
.doc-history { margin-top: 10px; border-top: 1px solid var(--color-hair-soft, #e6e6e3); padding-top: 8px; }
.doc-rev { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
</style>
