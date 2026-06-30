<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from './Icon.vue'
import Avatar from './Avatar.vue'
import IdentityDialog from './IdentityDialog.vue'
import { useMe } from '@/composables/useMe'
import { useScope } from '@/composables/useScope'

// En-tête de la sidebar = l'axe IDENTITÉ (« qui je suis » : org + équipe active),
// déplacé ici depuis le topbar pour qu'on le voie là où on regarde — le menu.
// Clic → IdentityDialog (bascule org + équipe). L'axe NIVEAU (« quoi je fais »)
// reste le segmented control du topbar. Le bloc s'adapte au niveau : en « org »
// il se recompose en bannière centrée sur l'organisation gérée.
const { me } = useMe()
const { level } = useScope()

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
  <button
    class="ident"
    :class="{ org: level === 'org', platform: level === 'platform' }"
    aria-label="identité — changer d'organisation ou d'équipe"
    @click="open = true"
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

  <IdentityDialog :open="open" @close="open = false" />
</template>

<style scoped>
.ident {
  flex: 1; min-width: 0;
  display: flex; align-items: center; gap: 10px;
  padding: 6px 8px; border-radius: 10px;
  border: 1px solid transparent; background: transparent;
  cursor: pointer; text-align: left;
  transition: background var(--t-fast), border-color var(--t-fast);
}
.ident:hover { background: var(--color-paper-2); border-color: var(--color-hair); }
.ident.org { background: var(--color-saffron-soft); border-color: var(--color-hair); }
.ident.org:hover { border-color: var(--color-saffron); }

.ident-txt { flex: 1; min-width: 0; }
.ident-kicker {
  font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--color-faint); line-height: 1.2;
}
.ident.org .ident-kicker { color: var(--color-saffron-ink); }
.ident-name {
  font-weight: 700; font-size: 15px; letter-spacing: -0.02em; color: var(--color-ink);
  line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ident-meta {
  display: flex; align-items: center; gap: 5px; margin-top: 2px;
  font-size: 11px; color: var(--color-mute); min-width: 0;
}
.ident-team { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pill {
  font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.04em;
  padding: 1px 5px; border-radius: 5px; margin-left: 3px;
  background: var(--color-surface); border: 1px solid var(--color-hair); color: var(--color-ink-soft);
}
.ident-meta > .pill:first-child { margin-left: 0; }
.pill.faint { color: var(--color-faint); }
.ident-chev { flex: none; color: var(--color-faint); }
</style>
