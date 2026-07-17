<script setup lang="ts">
// Modale « lier / créer » d'une entité de projet (refonte UX, ADR 0032) — ouverte par le
// (+) d'un groupe du rail. Deux formes : RECHERCHE (connecteur/tableau/procédure/doc → lie
// une VRAIE entité via les sélecteurs réels de ProjectEntities) ou CRÉATION (page → createDoc ;
// fichier → upload). Réutilise le câblage existant ; émet vers le parent pour rafraîchir.
import { computed, ref, watch } from 'vue'
import Icon from '@/components/console/Icon.vue'
import Btn from '@/components/console/Btn.vue'
import Dropzone from '@/components/console/Dropzone.vue'
import {
  linkProject, createDoc, uploadProjectFile,
  getNamespaces, getConnectors, getDoctrine, getKbProject, listDocs, getConnectorIdentities,
} from '@/api/console'
import type { ProjectLinkType, ConnectorIdentity } from '@/types/api'
import { humanize } from '@/lib/errors'
import { useToast } from '@/composables/useToast'

const props = defineProps<{
  open: boolean
  kind: 'connecteur' | 'tableau' | 'procedure' | 'doc' | 'page' | 'file'
  projectId: number
  parentId?: number | null       // page : créer en sous-page de ce doc
}>()
const emit = defineEmits<{ close: []; linked: []; 'created-doc': [number]; 'reload-files': [] }>()

const { toast } = useToast()

const TITLE: Record<string, string> = {
  connecteur: 'Lier un connecteur', tableau: 'Lier un tableau', procedure: 'Lier une procédure',
  doc: 'Lier un document', page: 'Nouvelle page', file: 'Importer un fichier',
}
const isSearch = computed(() => ['connecteur', 'tableau', 'procedure', 'doc'].includes(props.kind))
const isPage = computed(() => props.kind === 'page')
const isFile = computed(() => props.kind === 'file')

type Opt = { value: string; label: string; meta?: string }
const options = ref<Opt[]>([])
const loading = ref(false)
const query = ref('')
const busy = ref(false)
// page
const pageTitle = ref('')
// connecteur : identité (compte) — clé de multiplicité (#57)
const pickedRef = ref('')
const identities = ref<ConnectorIdentity[]>([])
const identLoading = ref(false)
const chosenIdentity = ref('')

async function loadOptions() {
  const t = props.kind as ProjectLinkType
  loading.value = true
  try {
    if (t === 'tableau') options.value = (await getNamespaces()).namespaces.map((n) => ({ value: String(n.id), label: n.namespace }))
    else if (t === 'connecteur') options.value = (await getConnectors()).connectors.map((c) => ({ value: c.name, label: c.label || c.name, meta: c.help }))
    else if (t === 'procedure') options.value = ((await getDoctrine()).instructions ?? []).map((i) => ({ value: String(i.id), label: i.title }))
    else { const kb = await getKbProject(); options.value = (await listDocs(kb.project_id)).docs.map((d) => ({ value: String(d.id), label: d.title })) }
  } catch (e) { toast(humanize(e)); options.value = [] }
  finally { loading.value = false }
}

watch(() => props.open, (o) => {
  if (!o) return
  query.value = ''; pageTitle.value = ''; pickedRef.value = ''; chosenIdentity.value = ''; identities.value = []
  options.value = []
  if (isSearch.value) void loadOptions()
})

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return options.value
  return options.value.filter((o) => o.label.toLowerCase().includes(q) || (o.meta ?? '').toLowerCase().includes(q))
})

async function pickConnector(o: Opt) {
  // Connecteur : proposer d'abord le choix d'identité (compte) avant de lier.
  pickedRef.value = o.value
  chosenIdentity.value = ''
  identities.value = []
  identLoading.value = true
  try { const r = await getConnectorIdentities(o.value); identities.value = r.supported ? r.identities : [] }
  catch { identities.value = [] }
  finally { identLoading.value = false }
  if (!identities.value.length) await doLink(o.value, o.label)   // pas d'identités → lier direct
}

async function doLink(ref: string, label?: string, identity_ref?: string) {
  if (busy.value) return
  busy.value = true
  try {
    let lbl = label
    if (props.kind === 'connecteur' && identity_ref) {
      const idn = identities.value.find((i) => i.id === identity_ref)
      if (idn) lbl = `${label} · ${idn.label || idn.id}`
    }
    await linkProject(props.projectId, props.kind as ProjectLinkType, ref, lbl, undefined, undefined, identity_ref)
    emit('linked'); emit('close')
  } catch (e) { toast(humanize(e)) }
  finally { busy.value = false }
}
function pick(o: Opt) {
  if (props.kind === 'connecteur') void pickConnector(o)
  else void doLink(o.value, o.label)
}
function confirmConnector() {
  const o = options.value.find((x) => x.value === pickedRef.value)
  void doLink(pickedRef.value, o?.label, chosenIdentity.value || undefined)
}

async function createPage() {
  const t = pageTitle.value.trim()
  if (!t || busy.value) return
  busy.value = true
  try { const d = await createDoc(props.projectId, t, { parent_id: props.parentId ?? null }); emit('created-doc', d.id); emit('close') }
  catch (e) { toast(humanize(e)) }
  finally { busy.value = false }
}
async function onFile(file: File) {
  if (busy.value) return
  busy.value = true
  try { await uploadProjectFile(props.projectId, file); toast('fichier importé'); emit('reload-files'); emit('close') }
  catch (e) { toast(humanize(e)) }
  finally { busy.value = false }
}
</script>

<template>
  <Teleport to="body">
  <Transition name="modal-fade">
    <div v-if="open" class="ep-ov" @mousedown.self="emit('close')">
      <div class="ep" role="dialog" aria-modal="true">
        <header class="ep__hd">
          <span class="ep__hdic"><Icon name="plus" :size="16" /></span>
          <span class="ep__hdl">{{ TITLE[kind] }}</span>
          <button class="ep__close" aria-label="fermer" @click="emit('close')"><Icon name="x" :size="15" /></button>
        </header>
        <div class="ep__body">
          <!-- recherche + résultats -->
          <template v-if="isSearch && !pickedRef">
            <input v-model="query" class="ep__in" placeholder="rechercher…" />
            <p v-if="loading" class="dim" style="font-size: 12.5px; padding: 8px 2px">chargement…</p>
            <p v-else-if="!filtered.length" class="dim" style="font-size: 12.5px; padding: 8px 2px">aucune entité de ce type.</p>
            <div v-else class="ep__list">
              <button v-for="o in filtered" :key="o.value" class="ep__row" @click="pick(o)">
                <span class="ep__rowname">{{ o.label }}</span>
                <span v-if="o.meta" class="ep__rowmeta">{{ o.meta }}</span>
                <span class="ep__rowcta">Lier</span>
              </button>
            </div>
          </template>

          <!-- connecteur : choix d'identité -->
          <template v-else-if="isSearch && pickedRef">
            <p class="dim" style="font-size: 12.5px; margin: 0 0 10px">Compte à utiliser pour ce connecteur dans le projet — lie N fois pour N comptes.</p>
            <select v-model="chosenIdentity" class="ep__in" :disabled="identLoading" style="margin-bottom: 12px">
              <option value="">{{ identLoading ? 'chargement…' : '(défaut du compte)' }}</option>
              <option v-for="idn in identities" :key="idn.id" :value="idn.id">{{ idn.label || idn.id }}{{ idn.channel ? ` · ${idn.channel}` : '' }}</option>
            </select>
            <div style="display: flex; gap: 8px; justify-content: flex-end">
              <button class="ep__x" @click="pickedRef = ''">Retour</button>
              <Btn kind="mini" icon="plus" :disabled="busy" @click="confirmConnector">Lier</Btn>
            </div>
          </template>

          <!-- création de page -->
          <template v-else-if="isPage">
            <input v-model="pageTitle" class="ep__in" placeholder="Titre de la page" style="margin-bottom: 12px" @keyup.enter="createPage" />
            <div style="display: flex; justify-content: flex-end"><Btn kind="mini" icon="plus" :disabled="busy || !pageTitle.trim()" @click="createPage">Créer la page</Btn></div>
          </template>

          <!-- import de fichier -->
          <template v-else-if="isFile">
            <Dropzone :busy="busy" :max-size-mb="25" accept=".pdf,.html,.htm,.txt,.md,.csv,.json,image/*"
              label="déposer / choisir un fichier" hint="PDF, HTML, image… — glisser-déposer ou cliquer · max 25 Mo"
              @select="onFile" @error="toast" />
          </template>
        </div>
      </div>
    </div>
  </Transition>
  </Teleport>
</template>

<style scoped>
.ep-ov { position: fixed; inset: 0; z-index: var(--z-modal); background: color-mix(in srgb, var(--color-ink) 42%, transparent); display: flex; align-items: flex-start; justify-content: center; padding: 90px 24px 24px; }
.ep { width: min(460px, 100%); background: var(--color-surface); border: 1px solid var(--border-card); border-radius: var(--radius-md); box-shadow: var(--shadow-pop); }
.ep__hd { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-bottom: 1px solid var(--color-hair); background: var(--color-saffron-soft); border-radius: var(--radius-md) var(--radius-md) 0 0; }
.ep__hdic { display: inline-flex; flex: none; color: var(--color-saffron-ink); }
.ep__hdl { font-size: 14.5px; font-weight: 700; letter-spacing: -.01em; color: var(--color-saffron-ink); }
.ep__close { margin-left: auto; height: 28px; width: 28px; display: inline-flex; align-items: center; justify-content: center; border: 0; background: transparent; border-radius: var(--radius-pill); color: var(--color-mute); cursor: pointer; }
.ep__close:hover { background: var(--color-paper-2); color: var(--color-ink); }
.ep__body { padding: 15px 18px 18px; }
.ep__in { width: 100%; border: 1px solid var(--color-hair); border-radius: var(--radius-md); padding: 9px 12px; font-family: var(--font-sans); font-size: 13px; color: var(--color-ink); background: var(--color-surface); }
.ep__list { display: flex; flex-direction: column; gap: 1px; margin-top: 10px; max-height: 320px; overflow-y: auto; }
.ep__row { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; padding: 9px 10px; border: 0; border-radius: 6px; background: transparent; cursor: pointer; font-family: var(--font-sans); }
.ep__row:hover { background: var(--color-paper-2); }
.ep__rowname { font-size: 13px; font-weight: 600; color: var(--color-ink); }
.ep__rowmeta { flex: 1; min-width: 0; font-family: var(--font-mono); font-size: 10px; color: var(--color-faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ep__rowcta { flex: none; margin-left: auto; font-size: 11px; font-weight: 600; padding: 3px 10px; border: 1px solid var(--color-hair); border-radius: var(--radius-pill); color: var(--color-ink-soft); background: var(--color-surface); }
.ep__x { border: 1px solid var(--color-hair); background: var(--color-surface); border-radius: var(--radius-pill); padding: 5px 12px; font-size: 12px; font-weight: 600; color: var(--color-ink-soft); cursor: pointer; }
.ep__x:hover { background: var(--color-paper-2); }
.modal-fade-enter-active, .modal-fade-leave-active { transition: opacity .15s ease; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; }
</style>
