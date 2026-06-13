<script setup lang="ts">
import { computed, watch, type Component } from 'vue'
import { useRoute } from 'vue-router'
import ConsoleSidebar from '@/components/console/ConsoleSidebar.vue'
import ConsoleTopbar from '@/components/console/ConsoleTopbar.vue'
import PromptDialog from '@/components/console/PromptDialog.vue'
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
import MonitoringView from './MonitoringView.vue'
import AdminUsersView from './AdminUsersView.vue'
import AdminOrgsView from './AdminOrgsView.vue'
import PlatformKeysView from './PlatformKeysView.vue'

const VIEWS: Record<string, Component> = {
  overview: OverviewView,
  connectors: ConnectorsView,
  toolbox: ToolboxView,
  doctrine: DoctrineView,
  data: DataView,
  scout: ScoutView,
  activity: ActivityView,
  org: OrgView,
  monitoring: MonitoringView,
  adminusers: AdminUsersView,
  adminorgs: AdminOrgsView,
  platformkeys: PlatformKeysView,
}

const route = useRoute()
const { isAuthenticated } = useAuth()
const { message } = useToast()
const { me, error, load } = useMe()

// Charge le profil dès qu'on est authentifié (pilote identité + gating admin).
watch(isAuthenticated, (ok) => { if (ok) load() }, { immediate: true })

const section = computed(() => String(route.params.section || 'overview'))
const current = computed(() => VIEWS[section.value] ?? OverviewView)
</script>

<template>
  <LoginGate v-if="!isAuthenticated" />
  <div v-else class="console-root">
    <div class="shell">
      <ConsoleSidebar />
      <div class="main">
        <ConsoleTopbar />
        <div class="content">
          <div v-if="error" class="content-inner">
            <section class="card" style="border-color: var(--color-terra-soft)">
              <div style="font-weight: 600; color: var(--color-terra-ink)">couldn't reach oto-mcp</div>
              <div class="helptext" style="margin-top: 4px">{{ error }}</div>
            </section>
          </div>
          <component :is="current" v-else-if="me" :key="section" />
        </div>
      </div>
    </div>
    <div v-if="message" class="toast">{{ message }}</div>
    <PromptDialog />
  </div>
</template>
