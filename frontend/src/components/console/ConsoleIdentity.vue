<script setup lang="ts">
import { computed } from 'vue'
import Avatar from './Avatar.vue'
import { useMe } from '@/composables/useMe'
import { useScope } from '@/composables/useScope'

// En-tête de la sidebar = l'axe IDENTITÉ (« qui je suis » : org + équipe active),
// AFFICHAGE SEUL. La bascule d'org/équipe a migré dans la popin compte (pied de
// sidebar, WorkspaceSwitcher) — pattern SaaS classique. Le bloc s'adapte au niveau :
// en « org » il se recompose en bannière centrée sur l'organisation gérée.
const { me } = useMe()
const { level } = useScope()

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
  <div
    class="ident"
    :class="{ org: level === 'org', platform: level === 'platform' }"
    aria-label="identité — organisation & équipe affichées"
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
  </div>
</template>

<style scoped>
.ident {
  flex: 1; min-width: 0;
  display: flex; align-items: center; gap: 10px;
  padding: 6px 8px; border-radius: var(--radius-md);
  border: 1px solid transparent; background: transparent;
  text-align: left;
}
/* En mode « org », le bloc devient une bannière claire (saffron doux) sur l'encre. */
.ident.org { background: var(--color-saffron-soft); border-color: var(--color-hair); }

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
</style>
