<script setup lang="ts">
// Projets — couche d'organisation (ADR 0030). Master-détail : liste à gauche, projet
// ouvert à droite (brief éditable + entités liées). Consomme la capacité oto_project
// (POST /api/me/projects). Premiers incréments : entité + liens ; le Doc arborescent
// et le partage (oto_resource) viendront.
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Btn from '@/components/console/Btn.vue'
import Tag from '@/components/console/Tag.vue'
import {
  listProjects, getProject, createProject, updateProject, archiveProject,
  linkProject, unlinkProject,
} from '@/api/console'
import type { Project, ProjectLink, ProjectLinkType } from '@/types/api'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'
import { useToast } from '@/composables/useToast'
import { usePrompt, type PromptField } from '@/composables/usePrompt'

const { toast } = useToast()
const { promptForm, confirmAction } = usePrompt()

const projects = ref<Project[]>([])
const selected = ref<Project | null>(null)
const briefDraft = ref('')
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
  try { selected.value = await getProject(id); briefDraft.value = selected.value.brief_md ?? '' }
  catch (e) { toast(humanize(e)) }
}

async function create() {
  const r = await promptForm({
    title: 'Nouveau projet', description: 'Un conteneur de travail (un but + ses entités).',
    fields: [{ key: 'name', label: 'Nom', required: true, placeholder: 'Prospection Marseille' }],
    submitLabel: 'Créer',
  })
  if (!r) return
  try {
    const p = await createProject(String(r.name))
    toast('projet créé'); await load(); await open(p.id)
  } catch (e) { toast(humanize(e)) }
}

async function saveBrief() {
  if (!selected.value) return
  try {
    selected.value = { ...selected.value, ...(await updateProject(selected.value.id, { brief_md: briefDraft.value })) }
    toast('brief enregistré')
  } catch (e) { toast(humanize(e)) }
}

async function archive() {
  if (!selected.value) return
  if (!await confirmAction({ title: 'Archiver le projet', danger: true, confirmLabel: 'Archiver',
    message: `Archiver « ${selected.value.name} » ?` })) return
  try { await archiveProject(selected.value.id); selected.value = null; await load(); toast('projet archivé') }
  catch (e) { toast(humanize(e)) }
}

async function addLink() {
  if (!selected.value) return
  const fields: PromptField[] = [
    { key: 'type', label: 'Type', type: 'select', required: true,
      options: LINK_GROUPS.map((g) => ({ value: g.type, label: g.label })) },
    { key: 'ref', label: 'Référence', required: true,
      hint: 'id du tableau · slug de procédure · nom du connecteur · id de base' },
    { key: 'label', label: 'Nom affiché', placeholder: '(optionnel)' },
  ]
  const r = await promptForm({ title: 'Lier une entité', fields, submitLabel: 'Lier' })
  if (!r) return
  try {
    const { links } = await linkProject(selected.value.id, r.type as ProjectLinkType,
      String(r.ref), r.label ? String(r.label) : undefined)
    selected.value = { ...selected.value, links }
  } catch (e) { toast(humanize(e)) }
}

async function removeLink(l: ProjectLink) {
  if (!selected.value) return
  if (!await confirmAction({ title: 'Délier', danger: true, confirmLabel: 'Délier',
    message: `Délier ${l.label || l.target_ref} ?` })) return
  try {
    const { links } = await unlinkProject(selected.value.id, l.target_type, l.target_ref)
    selected.value = { ...selected.value, links }
  } catch (e) { toast(humanize(e)) }
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
      <!-- LISTE -->
      <ConsoleCard flush title="mes projets" :sub="`${projects.length}`">
        <p v-if="!projects.length" class="dim" style="font-size: 12.5px; padding: 0 14px 12px">
          aucun projet — crée-en un.
        </p>
        <ul v-else class="pj-list">
          <li v-for="p in projects" :key="p.id" :class="{ on: selected?.id === p.id }" @click="open(p.id)">
            <div style="font-weight: 600; color: var(--color-ink)">{{ p.name }}</div>
            <div class="dim" style="font-size: 11px">
              {{ p.owner_type === 'org' ? 'org' : 'perso' }} · maj {{ fmtDate(p.updated_at) }}
            </div>
          </li>
        </ul>
      </ConsoleCard>

      <!-- DÉTAIL -->
      <ConsoleCard v-if="selected" :title="selected.name"
        :sub="selected.owner_type === 'org' ? 'projet d\'org' : 'projet perso'">
        <template #actions><Btn kind="danger" @click="archive">Archiver</Btn></template>

        <div class="subh">Brief — point d'entrée</div>
        <textarea v-model="briefDraft" class="pj-brief" rows="6"
          placeholder="Le but du projet, le contexte, ce que l'agent doit savoir au démarrage…"></textarea>
        <div style="margin-top: 6px">
          <Btn kind="mini" :class="{ off: !briefDirty }" @click="saveBrief">Enregistrer le brief</Btn>
          <span v-if="briefDirty" class="dim" style="font-size: 11px; margin-left: 8px">modifié</span>
        </div>

        <div class="subh" style="display: flex; align-items: center">
          Entités liées
          <Btn kind="mini" style="margin-left: auto" @click="addLink">+ lier</Btn>
        </div>
        <div v-for="g in LINK_GROUPS" :key="g.type" style="margin-bottom: 6px">
          <template v-if="linksByType[g.type]?.length">
            <div class="dim" style="font-size: 11px; font-weight: 700; margin: 4px 0 2px">{{ g.label }}</div>
            <div v-for="l in linksByType[g.type]" :key="l.target_ref" class="pj-link">
              <span style="flex: 1; color: var(--color-ink)">{{ l.label || l.target_ref }}</span>
              <Tag>{{ l.target_ref }}</Tag>
              <button class="pj-x" @click="removeLink(l)">✕</button>
            </div>
          </template>
        </div>
        <p v-if="!(selected.links?.length)" class="dim" style="font-size: 12px">
          rien de lié — attache un tableau, une procédure, un connecteur ou une base.
        </p>
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
.pj-brief {
  width: 100%; border: 1px solid var(--color-hair-soft, #cfcfcf); border-radius: 8px;
  padding: 9px 11px; font: inherit; font-size: 13px; line-height: 1.5; resize: vertical;
  background: #fff; color: var(--color-ink, #2a2a2a);
}
.pj-link { display: flex; align-items: center; gap: 8px; padding: 5px 0; border-bottom: 1px solid var(--color-hair-soft, #ececec); }
.pj-x { border: 1px solid var(--color-hair-soft, #cfcfcf); background: #fff; border-radius: 6px; padding: 2px 7px; font-size: 11px; color: var(--color-ink-soft, #6b6b6b); cursor: pointer; }
.btn-mini.off { opacity: .5; }
.subh { margin: 16px 0 6px; font-size: 11px; color: var(--color-faint, #9a9a9a); text-transform: uppercase; letter-spacing: .05em; }
</style>
