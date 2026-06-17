<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import Icon from './Icon.vue'
import Dot from './Dot.vue'
import Avatar from './Avatar.vue'
import { PAGE_META } from '@/lib/consoleNav'
import { useMe } from '@/composables/useMe'
import { getMyOrgs, setActiveOrg } from '@/api/console'
import type { Org } from '@/types/api'
import { useNav } from '@/composables/useNav'

const route = useRoute()
const { me } = useMe()
const { toggleNav } = useNav()
const meta = computed(() =>
  route.name === 'admin-user'
    ? { title: 'user fiche', crumb: 'platform · admin' }
    : PAGE_META[String(route.params.section)] ?? PAGE_META.overview!)

// ── switcher d'org (membre) ──
const open = ref(false)
const orgs = ref<Org[]>([])
const loading = ref(false)
const switching = ref(false)

async function toggle() {
  open.value = !open.value
  if (open.value && !orgs.value.length) {
    loading.value = true
    try { orgs.value = (await getMyOrgs()).orgs } finally { loading.value = false }
  }
}

async function pick(o: Org) {
  if (switching.value) return
  if (o.id === me.value?.active_org) { open.value = false; return }
  switching.value = true
  try {
    await setActiveOrg(o.id)
    // Bascule globale : toutes les vues sont org-scopées (toolbox, doctrine, scout,
    // connecteurs, secrets…). Un reload complet garantit qu'aucune donnée d'org ne
    // reste périmée — l'action est rare, le coût est acceptable.
    location.reload()
  } catch {
    switching.value = false
  }
}
</script>

<template>
  <header class="topbar">
    <button class="nav-toggle" aria-label="ouvrir le menu" @click="toggleNav">
      <Icon name="menu" :size="18" />
    </button>
    <div class="topbar-title">
      <h1>{{ meta.title }}</h1>
      <span class="crumb">{{ meta.crumb }}</span>
    </div>
    <div v-if="me?.active_org_name" class="right">
      <div class="org-switch">
        <button class="org-pill" :aria-expanded="open" @click="toggle">
          <Avatar
            v-if="me.active_org_logo_url"
            :src="me.active_org_logo_url"
            :name="me.active_org_name"
            :size="18"
            shape="square"
          />
          <Dot v-else tone="saffron" :size="7" />
          {{ me.active_org_name }}
          <span class="role">{{ me.org_role === 'org_admin' ? 'admin' : 'member' }}</span>
          <Icon name="chevd" :size="11" :style="{ color: 'var(--color-faint)' }" />
        </button>

        <template v-if="open">
          <div class="org-backdrop" @click="open = false" />
          <div class="org-menu">
            <div class="org-menu-head">switch organization</div>
            <div v-if="loading" class="org-menu-empty">loading…</div>
            <button
              v-for="o in orgs"
              :key="o.id"
              class="org-menu-item"
              :class="{ active: o.id === me.active_org }"
              :disabled="switching"
              @click="pick(o)"
            >
              <Dot :tone="o.id === me.active_org ? 'saffron' : 'faint'" :size="6" />
              <span class="org-menu-name">{{ o.name }}</span>
              <span class="role">{{ o.my_role === 'org_admin' ? 'admin' : 'member' }}</span>
              <Icon v-if="o.id === me.active_org" name="check" :size="12" :style="{ color: 'var(--color-saffron)' }" />
            </button>
          </div>
        </template>
      </div>
    </div>
  </header>
</template>

<style scoped>
.org-switch { position: relative; }
.org-backdrop { position: fixed; inset: 0; z-index: 40; }
.org-menu {
  position: absolute; right: 0; top: calc(100% + 6px); z-index: 41;
  min-width: 220px; padding: 5px;
  background: var(--color-surface); border: 1px solid var(--color-hair);
  border-radius: 12px; box-shadow: 0 8px 28px rgb(0 0 0 / 0.10);
}
.org-menu-head {
  font-family: var(--font-mono); font-size: 9.5px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--color-faint);
  padding: 7px 9px 5px;
}
.org-menu-empty { padding: 8px 9px; font-size: 12px; color: var(--color-mute); }
.org-menu-item {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 8px 9px; border-radius: 8px; border: 0; background: transparent;
  font-size: 12.5px; font-weight: 600; color: var(--color-ink); text-align: left;
  cursor: pointer;
}
.org-menu-item:hover:not(:disabled) { background: var(--color-paper-2); }
.org-menu-item:disabled { opacity: 0.55; cursor: default; }
.org-menu-item.active { cursor: default; }
.org-menu-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
