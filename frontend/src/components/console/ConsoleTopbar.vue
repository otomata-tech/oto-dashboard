<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import Icon from './Icon.vue'
import Dot from './Dot.vue'
import Avatar from './Avatar.vue'
import IdentityDialog from './IdentityDialog.vue'
import { PAGE_META } from '@/lib/consoleNav'
import { useMe, isPlatformOperator } from '@/composables/useMe'
import { useNav } from '@/composables/useNav'
import { useScope } from '@/composables/useScope'

const route = useRoute()
const { me } = useMe()
const { toggleNav } = useNav()
const { level, goLevel } = useScope()
const meta = computed(() =>
  route.name === 'admin-user'
    ? { title: 'user fiche', crumb: 'plateforme' }
    : PAGE_META[String(route.meta.section)] ?? PAGE_META['/overview']!)

// ── badge « identité MCP » : ouvre la modale de choix d'identité (compte + org)
// La bascule d'org + la création d'espace vivent dans IdentityDialog.
const identityOpen = ref(false)
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
      <!-- Niveau de gouvernance : échelle d'élévation à 3 crans (chaque cran révélé
           selon les droits). Axe « QUOI je fais » — orthogonal au pill « profil actif ». -->
      <div class="level-switch" role="tablist" aria-label="niveau">
        <button class="lvl" :class="{ on: level === 'work' }" role="tab" :aria-selected="level === 'work'" @click="goLevel('work')">mon espace</button>
        <button v-if="me.active_org != null" class="lvl" :class="{ on: level === 'org' }" role="tab" :aria-selected="level === 'org'" @click="goLevel('org')">gérer mon org</button>
        <button v-if="isPlatformOperator(me)" class="lvl plat" :class="{ on: level === 'platform' }" role="tab" :aria-selected="level === 'platform'" @click="goLevel('platform')">gérer la plateforme</button>
      </div>
      <!-- Badge « identité MCP » : sous quelle identité (compte + org) Claude agit.
           Clic = modale de choix d'org + HOWTO de propagation vers Claude. -->
      <button class="id-badge" aria-label="identité MCP" @click="identityOpen = true">
        <Icon name="plug" :size="13" class="id-badge-ico" />
        <span class="id-badge-tag">mcp</span>
        <Avatar
          v-if="me.active_org_name && me.active_org_logo_url"
          :src="me.active_org_logo_url"
          :name="me.active_org_name"
          :size="16"
          shape="square"
        />
        <Dot v-else :tone="me.active_org_name ? 'saffron' : 'faint'" :size="6" />
        <span class="id-badge-name">{{ me.active_org_name || 'Perso' }}</span>
        <Icon name="chevd" :size="11" :style="{ color: 'var(--color-faint)' }" />
      </button>
    </div>
  </header>

  <IdentityDialog :open="identityOpen" @close="identityOpen = false" />

  <!-- Signal franc : hors « mon espace » on AGIT SUR une org / la plateforme -->
  <div v-if="me && level !== 'work'" class="gov-banner" :class="{ platform: level === 'platform' }">
    <Icon name="shield" :size="13" />
    <template v-if="level === 'platform'">
      administration plateforme — tes actions touchent <strong>toute la plateforme</strong>
    </template>
    <template v-else>
      gouvernance — tu agis sur l'organisation <strong>{{ me.active_org_name || 'Perso (aucune org active)' }}</strong>
    </template>
  </div>
</template>

<style scoped>
/* ── Niveau de gouvernance : un seul segmented control à 3 crans ── */
.level-switch {
  display: inline-flex; gap: 2px; padding: 2px;
  background: var(--color-paper-2); border: 1px solid var(--color-hair);
  border-radius: 9px;
}
.lvl {
  border: 0; background: transparent; cursor: pointer;
  padding: 5px 10px; border-radius: 7px;
  font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.02em;
  font-weight: 600; color: var(--color-mute); white-space: nowrap;
}
.lvl:hover { color: var(--color-ink); }
.lvl.on { background: var(--color-surface); color: var(--color-ink); box-shadow: 0 1px 2px rgb(0 0 0 / 0.06); }
.lvl.plat.on { color: var(--color-saffron); }

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

/* ── Badge « identité MCP » ── */
.id-badge {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 5px 10px 5px 9px; border-radius: 9px;
  background: var(--color-paper-2); border: 1px solid var(--color-hair);
  font-size: 12.5px; font-weight: 600; color: var(--color-ink);
  cursor: pointer; white-space: nowrap;
}
.id-badge:hover { border-color: var(--color-saffron); }
.id-badge-ico { color: var(--color-saffron); }
.id-badge-tag {
  font-family: var(--font-mono); font-size: 9.5px; letter-spacing: 0.1em;
  text-transform: uppercase; color: var(--color-faint);
  padding-right: 6px; margin-right: -1px; border-right: 1px solid var(--color-hair);
}
.id-badge-name { overflow: hidden; text-overflow: ellipsis; max-width: 140px; }
</style>
