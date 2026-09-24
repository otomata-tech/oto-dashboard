<script setup lang="ts">
// UN projet dans l'arbre de la barre latérale, dépliable jusqu'à ses pages et ses tableaux
// (23/09/2026 : le dashboard reste le front du produit, et le rail d'oto-frontend descendait
// jusque-là). Un clic ouvre l'objet DANS l'écran projet actuel (`?doc=` pour une page,
// `/data/<ref>` pour un tableau) : pas de fiche à part, décision d'Alexis.
//
// Deux gestes d'écriture, les seuls du rail d'origine : « + » crée une page au premier niveau
// et l'ouvre ; le crayon d'une page la renomme sur place. Offerts seulement si le projet est
// en écriture pour ce lecteur ET hors consultation (`canWriteInOrg`) — en consultation le
// serveur refuse tout, un bouton y serait un levier inerte.
//
// Chargé à la demande (au dépliage), puis tenu à jour par `docsSignal` : l'écran projet et
// l'arbre se préviennent l'un l'autre quand une page naît ou change de titre.
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import Icon from './Icon.vue'
import { createDoc, getProject, listDocs, updateDoc } from '@/api/console'
import type { Doc, Project, ProjectLink } from '@/types/api'
import { canWriteInOrg, useMe } from '@/composables/useMe'
import { useNav } from '@/composables/useNav'
import { useScopedLink } from '@/composables/useScopedLink'
import { useToast } from '@/composables/useToast'
import { humanize } from '@/lib/errors'
import { bumpDocs, docsVersion } from '@/lib/docsSignal'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{ project: Project; color: string; active: boolean }>()

const route = useRoute()
const router = useRouter()
const { me } = useMe()
const { closeNav } = useNav()
const { scoped } = useScopedLink()
const { toast } = useToast()

const pid = computed(() => props.project.id)
const canWrite = computed(() => props.project.can_write !== false && canWriteInOrg(me.value))

const open = ref(props.active)
watch(() => props.active, (a) => { if (a) open.value = true })

const docs = ref<Doc[]>([])
const tables = ref<ProjectLink[]>([])
const loaded = ref(false)
const failed = ref(false)
let ownVersion = -1

async function load() {
  try {
    const [d, p] = await Promise.all([listDocs(pid.value), getProject(pid.value)])
    docs.value = d.docs
    tables.value = (p.links ?? []).filter((l) => l.target_type === 'tableau')
    failed.value = false
  } catch { failed.value = true }
  finally { loaded.value = true }
}
watch(open, (o) => { if (o && !loaded.value) void load() }, { immediate: true })
watch(() => docsVersion(pid.value), (v) => {
  if (v === ownVersion || !loaded.value) return
  void load()
})

// Arbre des pages à plat, dans l'ordre de lecture : premier niveau puis enfants (profondeur
// bornée à trois pour tenir dans la largeur de la barre).
interface Row { doc: Doc; depth: number }
const rows = computed<Row[]>(() => {
  const byParent = new Map<number | null, Doc[]>()
  for (const d of docs.value) {
    const k = d.parent_id ?? null
    byParent.set(k, [...(byParent.get(k) ?? []), d])
  }
  const order = (a: Doc, b: Doc) => (a.position ?? 0) - (b.position ?? 0) || a.id - b.id
  const out: Row[] = []
  const walk = (parent: number | null, depth: number) => {
    for (const d of (byParent.get(parent) ?? []).sort(order)) {
      out.push({ doc: d, depth: Math.min(depth, 3) })
      walk(d.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
})

// Sur l'écran de CE projet (routes de détail `project`, nues ou préfixées org/équipe).
const here = computed(() => route.meta.detail === 'project' && String(route.params.id ?? '') === String(pid.value))
const activeDoc = computed(() => (here.value ? String(route.query.doc ?? '') : ''))
const activeTable = computed(() => (here.value ? String(route.params.nsRef ?? '') : ''))

async function newPage() {
  try {
    const d = await createDoc(pid.value, 'Sans titre')
    ownVersion = bumpDocs(pid.value)
    open.value = true
    await load()
    await router.push(scoped(`/projects/${pid.value}?doc=${d.id}`))
    closeNav()
  } catch (e) { toast(humanize(e)) }
}

// Renommer sur place : le titre devient un champ ; Entrée enregistre, Échap abandonne.
const renaming = ref<number | null>(null)
const draft = ref('')
const input = ref<HTMLInputElement[] | null>(null)
async function startRename(d: Doc) {
  renaming.value = d.id
  draft.value = d.title
  await nextTick()
  input.value?.[0]?.select()
}
async function saveRename(d: Doc) {
  const title = draft.value.trim()
  renaming.value = null
  if (!title || title === d.title) return
  try {
    await updateDoc(d.id, { title })
    ownVersion = bumpDocs(pid.value)
    await load()
  } catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="tree">
    <div class="proj" :class="{ on: active && !activeDoc && !activeTable }">
      <button class="chev" :aria-label="open ? 'replier' : 'déplier'" @click="open = !open">
        <Icon :name="open ? 'chevron-down' : 'chevron-right'" :size="12" />
      </button>
      <RouterLink class="proj-link" :to="scoped(`/projects/${project.id}`)" @click="closeNav">
        <span class="proj-dot" :style="{ background: color }" />
        <span class="proj-name">{{ project.name }}</span>
      </RouterLink>
      <button v-if="canWrite" class="act" :title="t('miscUi.tree.newPage')" @click="newPage">
        <Icon name="plus" :size="12" />
      </button>
    </div>

    <template v-if="open">
      <div v-if="!loaded" class="note">…</div>
      <div v-else-if="failed" class="note">{{ t('miscUi.tree.unreadable') }}</div>
      <template v-else>
        <div v-for="r in rows" :key="r.doc.id" class="node" :class="{ on: activeDoc === String(r.doc.id) }"
          :style="{ paddingLeft: `${40 + r.depth * 12}px` }">
          <Icon name="file-text" :size="12" class="node-ic" />
          <input v-if="renaming === r.doc.id" ref="input" v-model="draft" class="node-input"
            @keydown.enter.prevent="saveRename(r.doc)" @keydown.esc="renaming = null" @blur="saveRename(r.doc)" />
          <RouterLink v-else class="node-link" :to="scoped(`/projects/${project.id}?doc=${r.doc.id}`)" @click="closeNav">
            {{ r.doc.title || t('miscUi.tree.untitled') }}
          </RouterLink>
          <button v-if="canWrite && renaming !== r.doc.id" class="act" :title="t('miscUi.tree.rename')" @click="startRename(r.doc)">
            <Icon name="pencil" :size="11" />
          </button>
        </div>
        <RouterLink v-for="tab in tables" :key="tab.target_ref" class="node node-link-row"
          :class="{ on: activeTable === tab.target_ref }" style="padding-left: 40px"
          :to="scoped(`/projects/${project.id}/data/${tab.target_ref}`)" @click="closeNav">
          <Icon name="database" :size="12" class="node-ic" />
          <span class="node-text">{{ tab.label || tab.datastore || tab.target_ref }}</span>
        </RouterLink>
        <div v-if="!rows.length && !tables.length" class="note">{{ t('miscUi.tree.none') }}</div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.proj { display: flex; align-items: center; gap: 2px; padding-left: 14px; border-radius: var(--radius-md);
  border-left: 2px solid transparent; }
.proj:hover, .node:hover { background: var(--sidebar-hover-bg); }
.proj.on { border-left-color: var(--color-saffron); background: var(--sidebar-hover-bg); }
.proj.on .proj-name { font-weight: 700; }
.chev { flex: none; display: grid; place-items: center; width: 16px; height: 22px; padding: 0;
  background: none; border: 0; cursor: pointer; color: var(--sidebar-fg-mute); }
.proj-link { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; padding: 5px 4px;
  color: var(--sidebar-fg); font-size: 12.5px; text-decoration: none; }
.proj-dot { flex: none; width: 7px; height: 7px; border-radius: var(--radius-pill); }
.proj-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.act { flex: none; display: grid; place-items: center; width: 20px; height: 20px; margin-right: 4px; padding: 0;
  background: none; border: 0; cursor: pointer; color: var(--sidebar-fg-mute); opacity: 0;
  border-radius: var(--radius-md); }
.proj:hover .act, .node:hover .act, .act:focus-visible { opacity: 1; }
.act:hover { color: var(--sidebar-fg); }
.node { display: flex; align-items: center; gap: 6px; padding: 3px 4px 3px 40px; border-radius: var(--radius-md);
  font-size: 12px; color: var(--sidebar-fg); text-decoration: none; border-left: 2px solid transparent; }
.node.on { border-left-color: var(--color-saffron); background: var(--sidebar-hover-bg); font-weight: 600; }
.node-ic { flex: none; color: var(--sidebar-fg-mute); }
.node-link, .node-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: inherit; text-decoration: none; }
.node-input { flex: 1; min-width: 0; font: inherit; font-size: 12px; padding: 1px 4px;
  border: 1px solid var(--color-hair); border-radius: var(--radius-md); background: var(--color-bg); color: var(--color-ink); }
.note { padding: 3px 10px 5px 40px; font-size: 11.5px; font-style: italic; color: var(--sidebar-fg-mute); }
</style>
