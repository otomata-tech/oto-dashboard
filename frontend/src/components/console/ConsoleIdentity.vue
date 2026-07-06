<script setup lang="ts">
import { computed, ref } from 'vue'
import Avatar from './Avatar.vue'
import Icon from './Icon.vue'
import WorkspaceSwitcher from './WorkspaceSwitcher.vue'
import { useMe } from '@/composables/useMe'
import { useMyOrgs } from '@/composables/useMyOrgs'
import { useScope } from '@/composables/useScope'

// En-tête de la sidebar = l'axe IDENTITÉ (org + équipe active) ET le déclencheur du
// SWITCH d'org : cliquer le bloc org/logo ouvre le WorkspaceSwitcher (consultation
// pure ADR 0023, zéro effet MCP — jamais de bascule d'identité Claude depuis le FE).
// La GESTION (« gérer mon org / profil / plateforme ») reste dans la popin compte au
// pied de la sidebar (ConsoleUserMenu). Le bloc s'adapte au niveau : en « org » il se
// recompose en bannière centrée sur l'organisation gérée.
const { me } = useMe()
const { level } = useScope()
const { prefetch } = useMyOrgs()   // orgs+équipes préchargées au survol → popin instantanée

const open = ref(false)

const orgName = computed(() => me.value?.active_org_name || '…')
const hasLogo = computed(() => !!(me.value?.active_org_name && me.value?.active_org_logo_url))

const orgRoleLabel = computed(() =>
  me.value?.active_org == null ? null
    : me.value?.org_role === 'org_admin' ? 'admin' : 'membre')
const groupRoleLabel = computed(() =>
  me.value?.group_role === 'group_admin' ? 'chef' : 'membre')

// On « consulte » quand l'org/équipe affichée (view-as) ≠ la maison (ADR 0023).
const isConsulting = computed(() =>
  !!me.value && (me.value.active_org !== me.value.home_org
    || me.value.active_group !== me.value.home_group))

// Sous-titre selon le niveau : en org/platform on annonce le mode, sinon le contexte
// (ou « consultation » si on regarde une org autre que sa maison).
const kicker = computed(() => {
  if (level.value === 'org') return 'gérer mon org'
  if (level.value === 'platform') return 'plateforme'
  return isConsulting.value ? 'consultation' : 'votre contexte'
})
</script>

<template>
  <div class="identity" :class="{ open }">
    <!-- backdrop : un clic dehors referme -->
    <div v-if="open" class="id-backdrop" @click="open = false" />

    <!-- déclencheur : le bloc org/logo ouvre le switcher d'org -->
    <button
      class="ident"
      :class="{ org: level === 'org', platform: level === 'platform' }"
      :aria-expanded="open"
      aria-haspopup="menu"
      aria-label="changer d'organisation"
      @pointerenter="prefetch"
      @focus="prefetch"
      @click="open = !open"
    >
      <Avatar
        v-if="hasLogo"
        :src="me!.active_org_logo_url"
        :name="orgName"
        :size="level === 'org' ? 38 : 34"
        shape="square"
      />
      <span v-else class="o-medallion" :class="level === 'org' ? 'o-medallion-md' : 'o-medallion-sm'">o</span>

      <div class="ident-txt">
        <div class="ident-kicker">{{ kicker }}</div>
        <div class="ident-name">{{ orgName }}</div>
        <div class="ident-meta">
          <span v-if="orgRoleLabel" class="pill">{{ orgRoleLabel }}</span>
          <span v-else class="pill faint">global</span>
          <span v-if="me?.active_group" class="ident-team">
            · {{ me.active_group_name }}
            <span class="pill">{{ groupRoleLabel }}</span>
          </span>
        </div>
      </div>

      <Icon name="chevd" :size="13" class="ident-chev" />
    </button>

    <!-- popin switch d'org : surface CLAIRE, s'ouvre vers le BAS depuis l'en-tête -->
    <div v-if="open" class="id-pop" role="menu">
      <WorkspaceSwitcher @switched="open = false" />
    </div>
  </div>
</template>

<style scoped>
.identity { position: relative; flex: 1; min-width: 0; }

.id-backdrop { position: fixed; inset: 0; z-index: 40; }

.ident {
  position: relative; z-index: 10;
  width: 100%;
  display: flex; align-items: center; gap: 10px;
  padding: 6px 8px; border-radius: var(--radius-md);
  border: 1px solid transparent; background: transparent;
  text-align: left; cursor: pointer; font-family: inherit;
  transition: background var(--t-fast), border-color var(--t-fast);
}
.ident:hover,
.identity.open .ident { background: var(--sidebar-hover-bg); border-color: var(--sidebar-hair); }
/* En mode « org », le bloc devient une bannière claire (saffron doux) sur l'encre. */
.ident.org { background: var(--color-saffron-soft); border-color: var(--color-hair); }
.ident.org:hover,
.identity.open .ident.org { border-color: var(--color-saffron-ink); }

.ident-txt { flex: 1; min-width: 0; }
.ident-kicker {
  font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--sidebar-fg-mute); line-height: 1.2;
}
.ident.org .ident-kicker { color: var(--color-saffron-ink); }
.ident-name {
  font-weight: 700; font-size: 15px; letter-spacing: -0.02em; color: var(--sidebar-fg-strong);
  line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ident.org .ident-name { color: var(--color-ink); }
.ident-meta {
  display: flex; align-items: center; gap: 5px; margin-top: 2px;
  font-size: 11px; color: var(--sidebar-fg-mute); min-width: 0;
}
.ident.org .ident-meta { color: var(--color-mute); }
.ident-team { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pill {
  font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.04em;
  padding: 1px 6px; border-radius: var(--radius-pill); margin-left: 3px;
  background: rgba(255, 255, 255, 0.08); border: 1px solid var(--sidebar-hair); color: var(--sidebar-fg);
}
.ident.org .pill {
  background: var(--color-surface); border-color: var(--color-hair); color: var(--color-ink-soft);
}
.ident-meta > .pill:first-child { margin-left: 0; }
.pill.faint { color: var(--sidebar-fg-mute); }
.ident.org .pill.faint { color: var(--color-faint); }

.ident-chev {
  flex: none; color: var(--sidebar-fg-mute);
  transition: transform var(--t-fast);
}
.ident.org .ident-chev { color: var(--color-saffron-ink); }
.identity.open .ident-chev { transform: rotate(180deg); }

/* popin CLAIRE (menu flottant), s'ouvre vers le BAS depuis l'en-tête de la sidebar */
.id-pop {
  position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 50;
  display: flex; flex-direction: column; gap: 2px; padding: 6px;
  background: var(--color-surface); border: 1px solid var(--color-hair);
  border-radius: var(--radius-md); box-shadow: var(--shadow-pop);
  max-height: min(72vh, 560px); overflow-y: auto;
}
</style>
