<script setup lang="ts">
import { computed, watch, type Component } from 'vue'
import { useRoute } from 'vue-router'
import ConsoleSidebar from '@/components/console/ConsoleSidebar.vue'
import ConsoleTopbar from '@/components/console/ConsoleTopbar.vue'
import PromptDialog from '@/components/console/PromptDialog.vue'
import StateError from '@/components/console/StateError.vue'
import SkeletonOverview from '@/components/console/SkeletonOverview.vue'
import WelcomeOrg from './WelcomeOrg.vue'
import WaitlistView from './WaitlistView.vue'
import LoginGate from './LoginGate.vue'
import { useToast } from '@/composables/useToast'
import { useAuth } from '@/composables/useAuth'
import { useMe, isPlatformOperator } from '@/composables/useMe'
import { useNav } from '@/composables/useNav'

import OverviewView from './OverviewView.vue'
import ConnectorsView from './ConnectorsView.vue'
import ConnectorLibraryView from './ConnectorLibraryView.vue'
import ToolboxView from './ToolboxView.vue'
import DoctrineView from './DoctrineView.vue'
import DoctrineLibraryView from './DoctrineLibraryView.vue'
import DataView from './DataView.vue'
import KnowledgeView from './KnowledgeView.vue'
import ScoutView from './ScoutView.vue'
import ActivityView from './ActivityView.vue'
import BillingView from './BillingView.vue'
import AccountView from './AccountView.vue'
import OrgView from './OrgView.vue'
import GroupsView from './GroupsView.vue'
import MonitoringView from './MonitoringView.vue'
import UsageView from './UsageView.vue'
import AdminUsersView from './AdminUsersView.vue'
import AdminUserView from './AdminUserView.vue'
import AdminOrgsView from './AdminOrgsView.vue'
import PlatformKeysView from './PlatformKeysView.vue'
import AdminConnectorsView from './AdminConnectorsView.vue'
import AdminAccessView from './AdminAccessView.vue'

const VIEWS: Record<string, Component> = {
  overview: OverviewView,
  connectors: ConnectorsView,
  'connector-library': ConnectorLibraryView,
  toolbox: ToolboxView,
  doctrine: DoctrineView,
  'doctrine-library': DoctrineLibraryView,
  data: DataView,
  knowledge: KnowledgeView,
  scout: ScoutView,
  activity: ActivityView,
  billing: BillingView,
  account: AccountView,
  org: OrgView,
  groups: GroupsView,
  monitoring: MonitoringView,
  usage: UsageView,
  adminusers: AdminUsersView,
  adminorgs: AdminOrgsView,
  platformkeys: PlatformKeysView,
  adminconnectors: AdminConnectorsView,
  adminaccess: AdminAccessView,
}

const route = useRoute()
const { isAuthenticated } = useAuth()
const { message } = useToast()
const { me, error, load } = useMe()
const { navOpen, closeNav } = useNav()

// Charge le profil dès qu'on est authentifié (pilote identité + gating admin).
watch(isAuthenticated, (ok) => { if (ok) load() }, { immediate: true })

// Referme le tiroir mobile à chaque navigation (sécurité si un lien ne le fait pas).
watch(() => route.fullPath, () => closeNav())

const section = computed(() => String(route.params.section || 'overview'))
const current = computed(() => {
  if (route.name === 'admin-user') return AdminUserView   // fiche /console/adminusers/user/:sub
  return VIEWS[section.value] ?? OverviewView
})
// Clé de remount : la route complète pour la fiche (change de :sub → remount),
// sinon la section.
const viewKey = computed(() => (route.name === 'admin-user' ? route.fullPath : section.value))
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
          <StateError v-if="error" :message="error" @retry="load(true)" />
          <WaitlistView v-else-if="me && me.access?.status === 'pending' && !isPlatformOperator(me)" />
          <WelcomeOrg v-else-if="me && me.active_org == null && !isPlatformOperator(me)" />
          <component :is="current" v-else-if="me" :key="viewKey" />
          <SkeletonOverview v-else />
        </div>
      </div>
    </div>
    <div v-if="message" class="toast">{{ message }}</div>
    <PromptDialog />
  </div>
</template>
