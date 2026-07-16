<script setup lang="ts">
// Arbre d'ESPACES de la sidebar (refonte nav JB, call 16/07 pt 5). Un espace = un
// scope owner de projet : « Mes projets » (org-owned de l'org active) + une équipe
// par groupe (group-owned) + « Partagés ». Repliable ; projet actif = barre saffron.
// Backend prêt (ADR 0049) : op=list renvoie chaque projet tagué owner_type/owner_id.
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import Icon from './Icon.vue'
import { listProjects, listGroups } from '@/api/console'
import type { Project } from '@/types/api'
import { useMe } from '@/composables/useMe'
import { useNav } from '@/composables/useNav'
import { useScopedLink } from '@/composables/useScopedLink'

const route = useRoute()
const { me } = useMe()
const { closeNav } = useNav()
const { scoped } = useScopedLink()

const projects = ref<Project[]>([])
const groupNames = ref<Record<string, string>>({})

onMounted(async () => {
  const org = me.value?.active_org
  const [pj, gr] = await Promise.all([
    listProjects().then((d) => d.projects).catch(() => []),
    org != null ? listGroups(org).then((d) => d.groups).catch(() => []) : Promise.resolve([]),
  ])
  projects.value = pj
  groupNames.value = Object.fromEntries(gr.map((g) => [String(g.id), g.name]))
})

// Les groupes n'ont pas de couleur en base → teinte déterministe par clé d'espace.
const ACCENTS = ['saffron', 'cobalt', 'olive', 'terra'] as const
function accentFor(key: string): string {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return `var(--color-${ACCENTS[h % ACCENTS.length]})`
}

interface Space { key: string; label: string; color: string; projects: Project[] }

const spaces = computed<Space[]>(() => {
  const mine: Project[] = []; const shared: Project[] = []
  const byGroup: Record<string, Project[]> = {}
  for (const p of projects.value) {
    if (p.shared) shared.push(p)
    else if (p.owner_type === 'group') (byGroup[p.owner_id] ||= []).push(p)
    else mine.push(p) // owner_type='org' de l'org active
  }
  const out: Space[] = [{ key: 'org', label: 'Mes projets', color: accentFor('org'), projects: mine }]
  for (const gid of Object.keys(byGroup).sort((a, b) =>
    (groupNames.value[a] || a).localeCompare(groupNames.value[b] || b)))
    out.push({ key: `g:${gid}`, label: groupNames.value[gid] || `Équipe ${gid}`, color: accentFor(gid), projects: byGroup[gid] ?? [] })
  if (shared.length) out.push({ key: 'shared', label: 'Partagés', color: accentFor('shared'), projects: shared })
  return out
})

const activeProjectId = computed(() => (route.path.match(/\/projects\/(\d+)/) || [])[1] ?? null)

// Ouverts : « Mes projets » + l'espace du projet courant (semé une fois au chargement).
const open = ref<Set<string>>(new Set(['org']))
let seeded = false
watch(spaces, (list) => {
  if (seeded || !list.length) return
  seeded = true
  const s = new Set(['org'])
  const act = list.find((sp) => sp.projects.some((p) => String(p.id) === activeProjectId.value))
  if (act) s.add(act.key)
  open.value = s
}, { immediate: true })

function toggle(key: string) {
  const s = new Set(open.value)
  if (s.has(key)) s.delete(key); else s.add(key)
  open.value = s
}
</script>

<template>
  <div class="spaces">
    <div v-for="s in spaces" :key="s.key" class="space">
      <button class="space-hd" @click="toggle(s.key)">
        <Icon :name="open.has(s.key) ? 'chevron-down' : 'chevron-right'" :size="13" class="space-chev" />
        <Icon name="folder" :size="14" class="space-fold" :style="{ color: s.color }" />
        <span class="space-name">{{ s.label }}</span>
        <span class="space-count">{{ s.projects.length }}</span>
      </button>
      <template v-if="open.has(s.key)">
        <RouterLink v-for="p in s.projects" :key="p.id" class="space-proj"
          :class="{ on: String(p.id) === activeProjectId }" :to="scoped(`/projects/${p.id}`)" @click="closeNav">
          <span class="proj-dot" :style="{ background: s.color }" />
          <span class="proj-name">{{ p.name }}</span>
        </RouterLink>
        <div v-if="!s.projects.length" class="space-empty">aucun projet</div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.spaces { display: flex; flex-direction: column; gap: 1px; }
.space-hd { display: flex; align-items: center; gap: 7px; width: 100%; padding: 6px 10px 6px 12px;
  background: none; border: 0; cursor: pointer; color: var(--sidebar-fg); font-family: var(--font-sans);
  font-size: 12.5px; font-weight: 600; text-align: left; border-radius: var(--radius-md); }
.space-hd:hover { background: var(--sidebar-hover-bg); }
.space-chev { flex: none; color: var(--sidebar-fg-mute); }
.space-fold { flex: none; }
.space-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.space-count { flex: none; font-family: var(--font-mono); font-size: 10px; color: var(--sidebar-fg-mute); }
.space-proj { display: flex; align-items: center; gap: 8px; padding: 5px 10px 5px 30px;
  color: var(--sidebar-fg); font-size: 12.5px; text-decoration: none; border-radius: var(--radius-md);
  border-left: 2px solid transparent; }
.space-proj:hover { background: var(--sidebar-hover-bg); }
.space-proj.on { font-weight: 700; border-left-color: var(--color-saffron); background: var(--sidebar-hover-bg); }
.proj-dot { flex: none; width: 7px; height: 7px; border-radius: 999px; }
.proj-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.space-empty { padding: 4px 10px 6px 30px; font-size: 12px; font-style: italic; color: var(--sidebar-fg-mute); }
</style>
