<script setup lang="ts">
import { computed, watch, type Component } from 'vue'
import { useRoute } from 'vue-router'
import ConsoleSidebar from '@/components/console/ConsoleSidebar.vue'
import ConsoleTopbar from '@/components/console/ConsoleTopbar.vue'
import PromptDialog from '@/components/console/PromptDialog.vue'
import StateError from '@/components/console/StateError.vue'
import SkeletonOverview from '@/components/console/SkeletonOverview.vue'
import WelcomeOrg from './WelcomeOrg.vue'
import LoginGate from './LoginGate.vue'
import { useToast } from '@/composables/useToast'
import { useAuth } from '@/composables/useAuth'
import { useMe } from '@/composables/useMe'

import OverviewView from './OverviewView.vue'
import ConnectorsView from './ConnectorsView.vue'
import ToolboxView from './ToolboxView.vue'
import DoctrineView from './DoctrineView.vue'
import DataView from './DataView.vue'
import ScoutView from './ScoutView.vue'
import ActivityView from './ActivityView.vue'
import OrgView from './OrgView.vue'
import GroupsView from './GroupsView.vue'
import MonitoringView from './MonitoringView.vue'
import AdminUsersView from './AdminUsersView.vue'
import AdminUserView from './AdminUserView.vue'
import AdminOrgsView from './AdminOrgsView.vue'
import PlatformKeysView from './PlatformKeysView.vue'
import AdminConnectorsView from './AdminConnectorsView.vue'

const VIEWS: Record<string, Component> = {
  overview: OverviewView,
  connectors: ConnectorsView,
  toolbox: ToolboxView,
  doctrine: DoctrineView,
  data: DataView,
  scout: ScoutView,
  activity: ActivityView,
  org: OrgView,
  groups: GroupsView,
  monitoring: MonitoringView,
  adminusers: AdminUsersView,
  adminorgs: AdminOrgsView,
  platformkeys: PlatformKeysView,
  adminconnectors: AdminConnectorsView,
}

const route = useRoute()
const { isAuthenticated } = useAuth()
const { message } = useToast()
const { me, error, load } = useMe()

// Charge le profil dès qu'on est authentifié (pilote identité + gating admin).
watch(isAuthenticated, (ok) => { if (ok) load() }, { immediate: true })

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
    <div class="shell">
      <ConsoleSidebar />
      <div class="main">
        <ConsoleTopbar />
        <div class="content">
          <StateError v-if="error" :message="error" @retry="load(true)" />
          <WelcomeOrg v-else-if="me && me.active_org == null && me.role !== 'admin'" />
          <component :is="current" v-else-if="me" :key="viewKey" />
          <SkeletonOverview v-else />
        </div>
      </div>
    </div>
    <div v-if="message" class="toast">{{ message }}</div>
    <PromptDialog />
  </div>
</template>
