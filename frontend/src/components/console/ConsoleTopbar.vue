<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import Icon from './Icon.vue'
import Dot from './Dot.vue'
import Avatar from './Avatar.vue'
import { PAGE_META } from '@/lib/consoleNav'
import { useMe } from '@/composables/useMe'
import { getMyOrgs, setActiveOrg, clearActiveOrg } from '@/api/console'
import type { Org } from '@/types/api'
import { useNav } from '@/composables/useNav'
import { useScope } from '@/composables/useScope'

const route = useRoute()
const { me } = useMe()
const { toggleNav } = useNav()
const { registre, activeScope, goRegistre, goScope } = useScope()
const meta = computed(() =>
  route.name === 'admin-user'
    ? { title: 'user fiche', crumb: 'governance · platform' }
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

// Identité « perso » (ADR 0015) = aucune org active : profil/toolset globaux.
async function pickPerso() {
  if (switching.value) return
  if (me.value?.active_org == null) { open.value = false; return }
  switching.value = true
  try {
    await clearActiveOrg()
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
    <div v-if="me" class="right">
      <!-- Registre : consommer (« mon espace ») vs gouverner -->
      <div class="reg-switch" role="tablist" aria-label="registre">
        <button class="reg" :class="{ on: registre === 'work' }" role="tab" :aria-selected="registre === 'work'" @click="goRegistre('work')">mon espace</button>
        <button class="reg" :class="{ on: registre === 'gov' }" role="tab" :aria-selected="registre === 'gov'" @click="goRegistre('gov')">gouvernance</button>
      </div>
      <!-- Scope de gouvernance : org vs plateforme (plateforme gatée admin) -->
      <div v-if="registre === 'gov'" class="scope-switch" aria-label="scope de gouvernance">
        <button class="scope" :class="{ on: activeScope === 'org' }" @click="goScope('org')">org</button>
        <button v-if="me.role === 'admin'" class="scope plat" :class="{ on: activeScope === 'platform' }" @click="goScope('platform')">plateforme</button>
      </div>
      <div class="org-switch">
        <button class="org-pill" :aria-expanded="open" @click="toggle">
          <template v-if="me.active_org_name">
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
          </template>
          <template v-else>
            <Dot tone="faint" :size="7" />
            Perso
            <span class="role">global</span>
          </template>
          <Icon name="chevd" :size="11" :style="{ color: 'var(--color-faint)' }" />
        </button>

        <template v-if="open">
          <div class="org-backdrop" @click="open = false" />
          <div class="org-menu">
            <div class="org-menu-head">profil actif</div>
            <button
              class="org-menu-item"
              :class="{ active: me.active_org == null }"
              :disabled="switching"
              @click="pickPerso"
            >
              <Dot :tone="me.active_org == null ? 'saffron' : 'faint'" :size="6" />
              <span class="org-menu-name">Perso</span>
              <span class="role">global</span>
              <Icon v-if="me.active_org == null" name="check" :size="12" :style="{ color: 'var(--color-saffron)' }" />
            </button>
            <div class="org-menu-head">organisations</div>
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

  <!-- Signal franc : en gouvernance on AGIT SUR une org / la plateforme -->
  <div v-if="me && registre === 'gov'" class="gov-banner" :class="{ platform: activeScope === 'platform' }">
    <Icon name="shield" :size="13" />
    <template v-if="activeScope === 'platform'">
      administration plateforme — tes actions touchent <strong>toute la plateforme</strong>
    </template>
    <template v-else>
      gouvernance — tu agis sur l'organisation <strong>{{ me.active_org_name || 'Perso (aucune org active)' }}</strong>
    </template>
  </div>
</template>

<style scoped>
/* ── Registre + scope : segmented controls ── */
.reg-switch, .scope-switch {
  display: inline-flex; gap: 2px; padding: 2px;
  background: var(--color-paper-2); border: 1px solid var(--color-hair);
  border-radius: 9px;
}
.reg, .scope {
  border: 0; background: transparent; cursor: pointer;
  padding: 5px 10px; border-radius: 7px;
  font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.02em;
  font-weight: 600; color: var(--color-mute); white-space: nowrap;
}
.reg:hover, .scope:hover { color: var(--color-ink); }
.reg.on { background: var(--color-surface); color: var(--color-ink); box-shadow: 0 1px 2px rgb(0 0 0 / 0.06); }
.scope.on { background: var(--color-surface); color: var(--color-ink); }
.scope.plat.on { color: var(--color-saffron); }

/* ── Bandeau de gouvernance ── */
.gov-banner {
  display: flex; align-items: center; gap: 7px;
  padding: 7px 18px; font-size: 12px; color: var(--color-ink-soft);
  background: var(--color-saffron-soft);
  border-bottom: 1px solid var(--color-hair);
}
.gov-banner strong { font-weight: 700; color: var(--color-ink); }
.gov-banner.platform {
  color: #7a2e0e;
  background: color-mix(in srgb, var(--color-saffron) 22%, var(--color-surface));
  border-bottom-color: color-mix(in srgb, var(--color-saffron) 45%, var(--color-hair));
}
.gov-banner.platform strong { color: #7a2e0e; }

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
