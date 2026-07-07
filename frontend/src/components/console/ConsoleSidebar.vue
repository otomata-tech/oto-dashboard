<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Icon from './Icon.vue'
import Dot from './Dot.vue'
import ConsoleIdentity from './ConsoleIdentity.vue'
import ConsoleUserMenu from './ConsoleUserMenu.vue'
import { NAV } from '@/lib/consoleNav'
import { listProjects } from '@/api/console'
import type { Project } from '@/types/api'
import { useMe, isPlatformOperator, isSuperAdmin } from '@/composables/useMe'
import { useNav } from '@/composables/useNav'
import { useScopedLink } from '@/composables/useScopedLink'

const route = useRoute()
const { scoped } = useScopedLink()
const { t } = useI18n()

// Projet en exergue (ADR 0032 §1 / réunion 30/06) : les 5 derniers projets affichés
// directement sous l'entrée « projects ». La liste est déjà triée par récence côté
// backend. Best-effort : la sidebar reste fonctionnelle si le fetch échoue.
const recentProjects = ref<Project[]>([])
onMounted(async () => {
  try { recentProjects.value = (await listProjects()).projects.slice(0, 5) }
  catch { /* no-op */ }
})
const { me } = useMe()
const { navOpen, closeNav } = useNav()
// « Gestion Entreprise » (oto-dashboard#51) : plus de level-switch — la gouvernance
// (équipe / org / plateforme) est montrée par les DROITS du user, dans UNE zone
// adaptative sous l'espace de travail. Le user voit ce qu'il gouverne : chef → son
// équipe, org_admin → l'org (+ équipes), opérateur plateforme → la plateforme. Les
// items `super` (ex. clés plateforme) restent réservés au super_admin.
const withSuper = (g: (typeof NAV)[number]) =>
  ({ ...g, items: g.items.filter((it) => !it.super || isSuperAdmin(me.value)) })
const workGroups = computed(() => NAV.filter((g) => g.level === 'work').map(withSuper))
const canGovern = (lvl: string): boolean =>
  lvl === 'group' ? me.value?.active_group != null
    : lvl === 'org' ? me.value?.org_role === 'org_admin'
    : lvl === 'platform' ? isPlatformOperator(me.value)
    : false
const govGroups = computed(() => NAV.filter((g) => g.level !== 'work' && canGovern(g.level)).map(withSuper))
// Rendu à plat : espace de travail, puis la zone gouvernance sous l'umbrella.
const renderGroups = computed(() => [...workGroups.value, ...govGroups.value])
const govStart = computed(() => workGroups.value.length)
</script>

<template>
  <aside class="sb" :class="{ open: navOpen }">
    <div class="sb-brand">
      <ConsoleIdentity />
      <button class="sb-close" :aria-label="t('common.close')" @click="closeNav">
        <Icon name="close" :size="18" />
      </button>
    </div>
    <nav class="sb-nav">
      <template v-for="(g, gi) in renderGroups" :key="gi">
        <div v-if="gi === govStart && govGroups.length" class="sb-ent-label">{{ t('nav.section.enterprise') }}</div>
        <div class="sb-group">
        <div v-if="g.group" class="sb-group-label">{{ t(g.group) }}</div>
        <template v-for="it in g.items" :key="it.path">
          <RouterLink
            class="sb-item"
            :class="{ on: route.meta.section === it.path }"
            :to="scoped(it.path)"
            @click="closeNav"
          >
            <span class="ic"><Icon :name="it.icon" :size="15" /></span>
            {{ t(it.label) }}
            <span v-if="it.warn" class="warn-dot"><Dot tone="saffron" :size="7" /></span>
            <span v-else-if="it.count" class="count">{{ it.count }}</span>
          </RouterLink>
          <!-- Projet en exergue : les 5 derniers projets juste sous l'entrée « projects ». -->
          <RouterLink
            v-for="p in (it.path === '/projects' ? recentProjects : [])"
            :key="`p${p.id}`"
            class="sb-item sb-subitem"
            :class="{ on: route.path.endsWith(`/projects/${p.id}`) }"
            :to="scoped(`/projects/${p.id}`)"
            @click="closeNav"
          >
            <span class="ic"></span>{{ p.name }}
          </RouterLink>
        </template>
        </div>
      </template>
    </nav>
    <div class="sb-foot">
      <div class="sb-mcp"><Dot tone="olive" :size="7" /> {{ t('nav.mcpConnected') }}</div>
      <ConsoleUserMenu />
    </div>
  </aside>
</template>

<style scoped>
/* Projet en exergue : sous-liens des 5 derniers projets sous l'entrée « projects ».
   Le reste du chrome sidebar vit dans console.css. */
.sb-subitem { padding-left: 30px; font-size: 12.5px; color: var(--sidebar-fg); }
.sb-subitem .ic { width: 15px; }
/* état actif : couleurs portées par .sb-item.on (aplat saffron) ; on garde juste le poids. */
.sb-subitem.on { font-weight: 700; }
</style>
