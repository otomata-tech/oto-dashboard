<script setup lang="ts">
// Projets — couche d'organisation (ADR 0030). Cette vue = l'INDEX (grille de projets) :
// objet de premier rang. Le détail d'un projet vit sur sa PROPRE page `/projects/:id`
// (ProjectDetailView) — plus de volet de liste. Consomme oto_project (POST /api/me/projects).
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Btn from '@/components/console/Btn.vue'
import Tag from '@/components/console/Tag.vue'
import { listProjects, createProject } from '@/api/console'
import type { Project } from '@/types/api'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'

const router = useRouter()
const { toast } = useToast()
const { promptForm } = usePrompt()

const projects = ref<Project[]>([])
const loaded = ref(false)
const error = ref<string | null>(null)

async function load() {
  try { projects.value = (await listProjects()).projects }
  catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
}
onMounted(load)

function openProject(id: number) { router.push(`/projects/${id}`) }

function briefSnippet(p: Project): string {
  const s = (p.brief_md ?? '').replace(/[#*_`>-]/g, '').replace(/\s+/g, ' ').trim()
  return s.length > 140 ? s.slice(0, 140) + '…' : s
}

async function create() {
  const r = await promptForm({
    title: 'Nouveau projet', description: 'Un conteneur de travail (un but + ses entités).',
    fields: [{ key: 'name', label: 'Nom', required: true, placeholder: 'Prospection Marseille' }],
    submitLabel: 'Créer',
  })
  if (!r) return
  try { const p = await createProject(String(r.name)); toast('projet créé'); openProject(p.id) }
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
      <p v-else-if="!projects.length" class="dim" style="font-size: 13px">aucun projet — crée-en un pour regrouper un but et ses entités.</p>
    </ConsoleCard>

    <div v-if="loaded && !error && projects.length" class="pj-cards">
      <button v-for="p in projects" :key="p.id" class="pj-card" @click="openProject(p.id)">
        <div class="pj-card__head">
          <span class="pj-card__name">{{ p.name }}</span>
          <Tag :tone="p.owner_type === 'org' ? 'olive' : 'cobalt'">{{ p.owner_type === 'org' ? 'org' : 'perso' }}</Tag>
        </div>
        <p v-if="briefSnippet(p)" class="pj-card__brief">{{ briefSnippet(p) }}</p>
        <p v-else class="pj-card__brief dim" style="font-style: italic">pas encore de brief.</p>
        <div class="pj-card__foot dim">maj {{ fmtDate(p.updated_at) }}</div>
      </button>
    </div>
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
</style>
