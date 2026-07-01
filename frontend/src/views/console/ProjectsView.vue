<script setup lang="ts">
// Projets — couche d'organisation (ADR 0030). Cette vue = l'INDEX (grille de projets) :
// objet de premier rang. Le détail d'un projet vit sur sa PROPRE page `/projects/:id`
// (ProjectDetailView) — plus de volet de liste. Consomme oto_project (POST /api/me/projects).
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Btn from '@/components/console/Btn.vue'
import Tag from '@/components/console/Tag.vue'
import NameDialog from '@/components/console/NameDialog.vue'
import { listProjects, listProjectTemplates, createProject, copyProject } from '@/api/console'
import type { Project } from '@/types/api'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'
import { useToast } from '@/composables/useToast'

const router = useRouter()
const { toast } = useToast()

const projects = ref<Project[]>([])
const templates = ref<Project[]>([])
const loaded = ref(false)
const error = ref<string | null>(null)

// Dialog de nom validé (partagé création / copie de modèle), config posée à l'ouverture.
interface NameDialogConfig {
  title: string
  description?: string
  initial: string
  submitLabel: string
  onConfirm: (name: string) => Promise<void>
}
const nameOpen = ref(false)
const nameConfig = ref<NameDialogConfig | null>(null)

async function load() {
  try {
    const [ps, ts] = await Promise.all([listProjects(), listProjectTemplates().catch(() => ({ projects: [] }))])
    projects.value = ps.projects
    templates.value = ts.projects
  }
  catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
}
onMounted(load)

// Copie un modèle dans l'org active (ADR 0032 §7 B5a) → on ouvre la copie.
function useTemplate(t: Project) {
  nameConfig.value = {
    title: `Utiliser « ${t.name} »`,
    description: 'Copie ce modèle dans un nouveau projet (l\'original reste intact).',
    initial: t.name,
    submitLabel: 'Copier',
    onConfirm: async (name) => {
      try { const p = await copyProject(t.id, name); toast('projet créé depuis le modèle'); openProject(p.id) }
      catch (e) { toast(humanize(e)); throw e }
    },
  }
  nameOpen.value = true
}

function openProject(id: number) { router.push(`/projects/${id}`) }

function briefSnippet(p: Project): string {
  const s = (p.brief_md ?? '').replace(/[#*_`>-]/g, '').replace(/\s+/g, ' ').trim()
  return s.length > 140 ? s.slice(0, 140) + '…' : s
}

function create() {
  nameConfig.value = {
    title: 'Nouveau projet',
    description: 'Un conteneur de travail (un but + ses entités).',
    initial: '',
    submitLabel: 'Créer',
    onConfirm: async (name) => {
      try { const p = await createProject(name); toast('projet créé'); openProject(p.id) }
      catch (e) { toast(humanize(e)); throw e }
    },
  }
  nameOpen.value = true
}
</script>

<template>
  <div class="content-inner fadein">
    <ConsoleCard title="projects"
      sub="conteneurs de travail (un but + ses entités). couche d'organisation — partageable, reprenable.">
      <template #actions><Btn kind="mini" @click="create">+ Nouveau projet</Btn></template>
      <p v-if="error" class="dim" style="font-size: 13px">{{ error }}</p>
      <p v-else-if="!loaded" class="dim" style="font-size: 13px">chargement…</p>
      <p v-else-if="!projects.length" class="dim" style="font-size: 13px">aucun projet — crée-en un pour regrouper un but et ses entités.</p>
    </ConsoleCard>

    <div v-if="loaded && !error && projects.length" class="pj-cards">
      <button v-for="p in projects" :key="p.id" class="pj-card" @click="openProject(p.id)">
        <div class="pj-card__head">
          <span class="pj-card__name">{{ p.name }}</span>
          <Tag v-if="p.is_template" tone="saffron">modèle</Tag>
          <Tag :tone="p.owner_type === 'org' ? 'olive' : 'cobalt'">{{ p.owner_type === 'org' ? 'org' : 'perso' }}</Tag>
        </div>
        <p v-if="briefSnippet(p)" class="pj-card__brief">{{ briefSnippet(p) }}</p>
        <p v-else class="pj-card__brief dim" style="font-style: italic">pas encore de brief.</p>
        <div class="pj-card__foot dim">maj {{ fmtDate(p.updated_at) }}</div>
      </button>
    </div>

    <ConsoleCard v-if="loaded && !error && templates.length" title="modèles"
      sub="projets publiés comme modèles — choisis-en un pour en faire une copie prête à personnaliser."
      style="margin-top: 16px">
      <div class="pj-cards" style="margin-top: 4px">
        <div v-for="t in templates" :key="t.id" class="pj-card pj-card--tpl">
          <div class="pj-card__head">
            <span class="pj-card__name">{{ t.name }}</span>
            <Tag tone="saffron">modèle</Tag>
          </div>
          <p v-if="briefSnippet(t)" class="pj-card__brief">{{ briefSnippet(t) }}</p>
          <p v-else class="pj-card__brief dim" style="font-style: italic">pas de brief.</p>
          <div style="margin-top: 6px"><Btn kind="mini" @click="useTemplate(t)">Utiliser ce modèle</Btn></div>
        </div>
      </div>
    </ConsoleCard>

    <NameDialog v-if="nameConfig" v-model:open="nameOpen"
      :title="nameConfig.title" :description="nameConfig.description"
      :initial="nameConfig.initial" :submit-label="nameConfig.submitLabel"
      :on-confirm="nameConfig.onConfirm" placeholder="Prospection Marseille" />
  </div>
</template>

<style scoped>
.pj-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; margin-top: 12px; }
.pj-card {
  display: flex; flex-direction: column; gap: 8px; text-align: left; cursor: pointer;
  padding: 14px 15px; border: 1px solid var(--color-hair-soft, #e0ddd6); border-radius: 11px;
  background: var(--color-bg, #fff); font: inherit; transition: box-shadow .15s var(--ease-out, ease), border-color .15s ease, transform .15s ease;
}
.pj-card:hover { border-color: var(--color-hair, #cfccc4); box-shadow: 0 8px 24px -14px color-mix(in srgb, var(--color-ink, #2a2a2a) 40%, transparent); transform: translateY(-1px); }
.pj-card__head { display: flex; align-items: center; gap: 8px; }
.pj-card__name { flex: 1; font-weight: 600; font-size: 14px; color: var(--color-ink, #2a2a2a); }
.pj-card__brief { margin: 0; font-size: 12.5px; line-height: 1.45; color: var(--color-ink-soft, #4a463d); min-height: 18px; }
.pj-card__foot { font-size: 11px; }
.pj-card--tpl { cursor: default; }
.pj-card--tpl:hover { transform: none; box-shadow: none; border-color: var(--color-hair-soft, #e0ddd6); }
</style>
