<script setup lang="ts">
import { computed, watch, defineAsyncComponent, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ConsoleSidebar from '@/components/console/ConsoleSidebar.vue'
import ConsoleTopbar from '@/components/console/ConsoleTopbar.vue'
import PromptDialog from '@/components/console/PromptDialog.vue'
import FormPromptHost from '@/components/console/FormPromptHost.vue'
import StateError from '@/components/console/StateError.vue'
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
const router = useRouter()
const { isAuthenticated, logout } = useAuth()
const { message } = useToast()
const { me, error, load } = useMe()
const { navOpen, closeNav } = useNav()

// Charge le profil dès qu'on est authentifié (pilote identité + gating admin).
watch(isAuthenticated, (ok) => { if (ok) load() }, { immediate: true })

// Referme le tiroir mobile à chaque navigation (sécurité si un lien ne le fait pas).
watch(() => route.fullPath, () => closeNav())

// Org de consultation portée par l'URL (`/o/:orgId/…`, ADR 0023).
const orgId = computed(() => (typeof route.params.orgId === 'string' ? route.params.orgId : null))

// L'org de l'URL change → les headers de scope changent → refetch le profil.
watch(orgId, () => { if (isAuthenticated.value) load() })

// Canonicalise une URL org-scopée NUE vers `/o/<maison>/…` une fois `me` connu (le
// backend a déjà rendu la maison sans header ; on aligne juste l'URL).
watch([me, () => route.fullPath], () => {
  if (!me.value || !route.meta.orgScoped || orgId.value != null) return
  const home = me.value.home_org ?? me.value.active_org
  if (home == null) return
  void router.replace({ path: `/o/${home}${route.path}`, query: route.query, hash: route.hash })
}, { immediate: true })

const section = computed(() => String(route.meta.section || '/overview'))
const detail = computed(() => route.meta.detail as string | undefined)
const current = computed(() => {
  if (detail.value === 'admin-user') return AdminUserView       // fiche /platform/users/:sub
  if (detail.value === 'project') return ProjectDetailView      // page /projects/:id
  return VIEWS[section.value] ?? OverviewView
})
// Clé de remount : org de l'URL + identité de la vue. Une page de détail remonte quand
// son ID (ou l'org) change, pas sa query ; admin-user reste sur fullPath. Changer d'org
// (préfixe `/o/:id`) remonte donc toujours la vue → refetch propre.
const viewKey = computed(() => {
  const o = orgId.value ?? ''
  if (detail.value === 'admin-user') return route.fullPath
  if (detail.value === 'project') return `${o}:/projects/${route.params.id}`
  return `${o}:${section.value}`
})
</script>

<template>
  <LoginGate v-if="!isAuthenticated" />
  <div v-else class="console-root">
    <div class="shell" :class="{ 'nav-open': navOpen }">
      <ConsoleSidebar />
      <div class="nav-backdrop" @click="closeNav" />
      <div class="main">
        <ConsoleTopbar />
        <div class="content">
          <StateError v-if="error" :message="error" @retry="load(true)" @relogin="logout()" />
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
