<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Avatar from './Avatar.vue'
import Icon from './Icon.vue'
import WorkspaceSwitcher from './WorkspaceSwitcher.vue'
import { useMe, isPlatformOperator } from '@/composables/useMe'
import { useMyOrgs } from '@/composables/useMyOrgs'
import { useScope } from '@/composables/useScope'

// En-tête de la sidebar = l'axe IDENTITÉ (org + équipe active) ET le déclencheur du
// SWITCH d'org : cliquer le bloc org/logo ouvre le WorkspaceSwitcher dans une MODALE
// centrée (téléportée au body → non clippée par la sidebar, largeur confortable pour
// lire les noms d'org). Consultation pure ADR 0023, zéro effet MCP — jamais de bascule
// d'identité Claude depuis le FE. La GESTION (« gérer mon org / profil / plateforme »)
// reste dans la popin compte au pied de la sidebar (ConsoleUserMenu). Le bloc s'adapte
// au niveau : en « org » il se recompose en bannière centrée sur l'organisation gérée.
const { me } = useMe()
const { level } = useScope()
const { prefetch } = useMyOrgs()   // orgs+équipes préchargées au survol → modale instantanée

const open = ref(false)

// Échap referme la modale (listener posé seulement quand elle est ouverte).
function onKey(e: KeyboardEvent) { if (e.key === 'Escape') open.value = false }
watch(open, (o) => {
  if (o) window.addEventListener('keydown', onKey)
  else window.removeEventListener('keydown', onKey)
})

const orgName = computed(() => me.value?.active_org_name || '…')
const teamName = computed(() => me.value?.active_group_name || '…')
const hasLogo = computed(() => !!(me.value?.active_org_name && me.value?.active_org_logo_url))
const isOperator = computed(() => isPlatformOperator(me.value))

// Fil d'ariane Plateforme ▸ Org ▸ Team (niveau group) : REMONTER = nav DURE qui DROPPE le
// préfixe `/g/` (une URL sans /g/ = niveau org), pour que `me`/la sidebar/l'identité se
// recomposent proprement au niveau parent. Un router.push SPA les laisserait périmés.
function goUpToOrg() {
  if (me.value?.active_org != null) window.location.assign(`/o/${me.value.active_org}/org/context`)
}
function goUpToPlatform() { window.location.assign('/platform/monitoring') }

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
  if (level.value === 'account') return 'gérer mon compte'
  if (level.value === 'group') return 'gérer mon équipe'
  if (level.value === 'org') return 'gérer mon org'
  if (level.value === 'platform') return 'plateforme'
  return isConsulting.value ? 'consultation' : 'votre contexte'
})
</script>

<template>
  <div class="identity" :class="{ open }">
    <!-- déclencheur : le bloc org/logo ouvre la modale de switch d'org -->
    <button
      class="ident"
      :class="{ org: level === 'org', team: level === 'group', platform: level === 'platform' }"
      :aria-expanded="open"
      aria-haspopup="dialog"
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
        <!-- Niveau ÉQUIPE : le fil d'ariane EST l'identité — Plateforme ▸ Org ▸ Team, les
             parents cliquables (nav dure @click.stop, ne rouvre pas le switcher), Team
             courant. Segments = <span role=link> (valides dans le <button> parent). -->
        <template v-if="level === 'group'">
          <nav class="ident-crumb" aria-label="fil d'ariane">
            <template v-if="isOperator">
              <span class="crumb-seg" role="link" tabindex="0"
                    @click.stop="goUpToPlatform" @keydown.enter.stop="goUpToPlatform">Plateforme</span>
              <span class="crumb-sep" aria-hidden="true">›</span>
            </template>
            <span class="crumb-seg" role="link" tabindex="0"
                  @click.stop="goUpToOrg" @keydown.enter.stop="goUpToOrg">{{ orgName }}</span>
            <span class="crumb-sep" aria-hidden="true">›</span>
            <span class="crumb-cur">{{ teamName }}<span class="pill">{{ groupRoleLabel }}</span></span>
          </nav>
        </template>
        <template v-else>
          <div class="ident-name">{{ orgName }}</div>
          <div class="ident-meta">
            <span v-if="orgRoleLabel" class="pill">{{ orgRoleLabel }}</span>
            <span v-else class="pill faint">global</span>
            <span v-if="me?.active_group" class="ident-team">
              · {{ me.active_group_name }}
              <span class="pill">{{ groupRoleLabel }}</span>
            </span>
          </div>
        </template>
      </div>

      <Icon name="chevd" :size="13" class="ident-chev" />
    </button>

    <!-- modale switch d'org : téléportée au body, centrée, surface CLAIRE -->
    <Teleport to="body">
      <div v-if="open" class="id-modal-root">
        <div class="id-backdrop" @click="open = false" />
        <div class="id-modal" role="dialog" aria-modal="true" aria-label="changer d'organisation">
          <div class="id-modal-head">
            <span class="id-modal-title">changer d'organisation</span>
            <button class="id-modal-close" aria-label="fermer" @click="open = false">
              <Icon name="close" :size="16" />
            </button>
          </div>
          <div class="id-modal-body">
            <WorkspaceSwitcher @switched="open = false" />
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.identity { position: relative; flex: 1; min-width: 0; }

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
/* En mode « équipe », même bannière claire mais teinte COBALT (distincte de l'org). */
.ident.team { background: var(--color-cobalt-soft); border-color: var(--color-hair); }
.ident.team:hover,
.identity.open .ident.team { border-color: var(--color-cobalt-ink); }

.ident-txt { flex: 1; min-width: 0; }
.ident-kicker {
  font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--sidebar-fg-mute); line-height: 1.2;
}
.ident.org .ident-kicker { color: var(--color-saffron-ink); }
.ident.team .ident-kicker { color: var(--color-cobalt-ink); }
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
.ident.org .pill,
.ident.team .pill {
  background: var(--color-surface); border-color: var(--color-hair); color: var(--color-ink-soft);
}
.ident-meta > .pill:first-child { margin-left: 0; }

/* Fil d'ariane (niveau équipe) : Plateforme ▸ Org ▸ Team, parents cliquables. */
.ident-crumb {
  display: flex; align-items: center; gap: 5px; margin-top: 3px;
  font-size: 11px; color: var(--color-mute); min-width: 0; flex-wrap: wrap;
}
.crumb-seg {
  color: var(--color-cobalt-ink); cursor: pointer; white-space: nowrap;
  border-radius: 4px; padding: 0 2px;
}
.crumb-seg:hover { text-decoration: underline; }
.crumb-seg:focus-visible { outline: 2px solid var(--color-cobalt); outline-offset: 1px; }
.crumb-sep { color: var(--color-faint); }
.crumb-cur {
  display: inline-flex; align-items: center; min-width: 0;
  font-weight: 700; color: var(--color-ink);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.pill.faint { color: var(--sidebar-fg-mute); }
.ident.org .pill.faint { color: var(--color-faint); }

.ident-chev {
  flex: none; color: var(--sidebar-fg-mute);
  transition: transform var(--t-fast);
}
.ident.org .ident-chev { color: var(--color-saffron-ink); }
.ident.team .ident-chev { color: var(--color-cobalt-ink); }
.identity.open .ident-chev { transform: rotate(180deg); }

/* ── Modale de switch d'org (téléportée au body, centrée) ──────────────────── */
.id-modal-root { position: fixed; inset: 0; z-index: 200; }
.id-backdrop {
  position: absolute; inset: 0;
  background: rgba(44, 33, 18, 0.42);
}
.id-modal {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  width: min(440px, calc(100vw - 32px));
  display: flex; flex-direction: column;
  max-height: min(80vh, 620px);
  background: var(--color-surface); border: 1px solid var(--color-hair);
  border-radius: var(--radius-md); box-shadow: var(--shadow-drawer);
  overflow: hidden;
}
.id-modal-head {
  flex: none; display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px; border-bottom: 1px solid var(--color-hair);
}
.id-modal-title {
  font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--color-mute);
}
.id-modal-close {
  display: inline-flex; padding: 4px; border-radius: var(--radius-pill);
  border: 0; background: transparent; color: var(--color-mute); cursor: pointer;
}
.id-modal-close:hover { background: var(--color-paper-2); color: var(--color-ink); }
.id-modal-body { padding: 8px; overflow-y: auto; }
</style>
