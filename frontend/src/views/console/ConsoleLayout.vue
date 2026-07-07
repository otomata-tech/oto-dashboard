<script setup lang="ts">
import { computed, watch, defineAsyncComponent, type Component } from 'vue'
import { useRoute } from 'vue-router'
import ConsoleSidebar from '@/components/console/ConsoleSidebar.vue'
import ConsoleTopbar from '@/components/console/ConsoleTopbar.vue'
import PromptDialog from '@/components/console/PromptDialog.vue'
import FormPromptHost from '@/components/console/FormPromptHost.vue'
import StateError from '@/components/console/StateError.vue'
import SessionExpired from '@/components/console/SessionExpired.vue'
import SkeletonOverview from '@/components/console/SkeletonOverview.vue'
import WaitlistView from './WaitlistView.vue'
import LoginGate from './LoginGate.vue'
import { useToast } from '@/composables/useToast'
import { useAuth } from '@/composables/useAuth'
import { useMe, isPlatformOperator } from '@/composables/useMe'
import { useNav } from '@/composables/useNav'

// Vues splittées par route : chaque écran = son propre chunk, chargé à la demande
// (le chargement initial ne tire que le shell + la vue courante, pas toute la console).
const OverviewView = defineAsyncComponent(() => import('./OverviewView.vue'))
const AdminUserView = defineAsyncComponent(() => import('./AdminUserView.vue'))
const ProjectDetailView = defineAsyncComponent(() => import('./ProjectDetailView.vue'))

// Keyé par path canonique (= meta.section porté par chaque route, cf. consoleNav).
const VIEWS: Record<string, Component> = {
  '/overview': OverviewView,
  '/projects': defineAsyncComponent(() => import('./ProjectsView.vue')),
  '/connectors': defineAsyncComponent(() => import('./ConnectorsHubView.vue')),
  '/procedures': defineAsyncComponent(() => import('./DoctrineHubView.vue')),
  '/data': defineAsyncComponent(() => import('./DataView.vue')),
  '/documents': defineAsyncComponent(() => import('./DocumentsView.vue')),
  '/memento': defineAsyncComponent(() => import('./MementoView.vue')),
  '/activity': defineAsyncComponent(() => import('./ActivityView.vue')),
  '/context': defineAsyncComponent(() => import('./ContextView.vue')),
  '/org/context': defineAsyncComponent(() => import('./ContextOrgView.vue')),
  '/platform/context': defineAsyncComponent(() => import('./ContextPlatformView.vue')),
  '/account': defineAsyncComponent(() => import('./AccountView.vue')),
  '/group': defineAsyncComponent(() => import('./MyGroupView.vue')),
  '/org': defineAsyncComponent(() => import('./OrgView.vue')),
  '/org/connectors': defineAsyncComponent(() => import('./OrgConnectorsView.vue')),
  '/org/departments': defineAsyncComponent(() => import('./GroupsView.vue')),
  '/org/billing': defineAsyncComponent(() => import('./BillingView.vue')),
  '/platform/monitoring': defineAsyncComponent(() => import('./MonitoringView.vue')),
  '/platform/usage': defineAsyncComponent(() => import('./UsageView.vue')),
  '/platform/users': defineAsyncComponent(() => import('./AdminUsersView.vue')),
  '/platform/orgs': defineAsyncComponent(() => import('./AdminOrgsView.vue')),
  '/platform/objects': defineAsyncComponent(() => import('./AdminObjectsView.vue')),
  '/platform/connectors': defineAsyncComponent(() => import('./AdminConnectorsView.vue')),
  '/platform/access': defineAsyncComponent(() => import('./AdminAccessView.vue')),
  '/platform/instructions': defineAsyncComponent(() => import('./AdminPlatformInstructionsView.vue')),
}

const route = useRoute()
const { isAuthenticated } = useAuth()
const { message } = useToast()
const { me, error, load } = useMe()

// Session Logto morte : on ne rend PAS le shell (menu inerte, vues vides) — on bascule
// sur l'écran de reconnexion plein écran qui relance Logto (cf. SessionExpired.vue).
const isStale = computed(() => error.value === 'stale_session')
const { navOpen, closeNav } = useNav()

// Charge le profil dès qu'on est authentifié (pilote identité + gating admin).
watch(isAuthenticated, (ok) => { if (ok) load() }, { immediate: true })

// Referme le tiroir mobile à chaque navigation (sécurité si un lien ne le fait pas).
watch(() => route.fullPath, () => closeNav())

const section = computed(() => String(route.meta.section || '/overview'))
const current = computed(() => {
  if (route.name === 'admin-user') return AdminUserView          // fiche /platform/users/:sub
  if (route.name === 'project-detail') return ProjectDetailView  // page /projects/:id
  return VIEWS[section.value] ?? OverviewView
})
// Clé de remount : une page de détail remonte quand son ID change, pas sa query.
// (project-detail keye sur :id seul → le deep-link wiki `?doc=` ne remonte pas la vue ;
// admin-user reste sur fullPath.) Sinon = la section.
const viewKey = computed(() => {
  if (route.name === 'admin-user') return route.fullPath
  if (route.name === 'project-detail') return `/projects/${route.params.id}`
  return section.value
})
</script>

<template>
  <LoginGate v-if="!isAuthenticated" />
  <SessionExpired v-else-if="isStale" />
  <div v-else class="console-root">
    <div class="shell" :class="{ 'nav-open': navOpen }">
      <ConsoleSidebar />
      <div class="nav-backdrop" @click="closeNav" />
      <div class="main">
        <ConsoleTopbar />
        <div class="content">
          <StateError v-if="error" :message="error" @retry="load(true)" />
          <WaitlistView v-else-if="me && me.access?.status === 'pending' && !isPlatformOperator(me)" />
          <component :is="current" v-else-if="me" :key="viewKey" />
          <SkeletonOverview v-else />
        </div>
      </div>
    </div>
    <div v-if="message" class="toast">{{ message }}</div>
    <PromptDialog />
    <FormPromptHost />
  </div>
</template>
