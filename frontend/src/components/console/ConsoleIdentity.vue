<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Avatar from './Avatar.vue'
import Icon from './Icon.vue'
import WorkspaceSwitcher from './WorkspaceSwitcher.vue'
import { useMe, isPlatformOperator } from '@/composables/useMe'
import { useMyOrgs } from '@/composables/useMyOrgs'
import { useScope } from '@/composables/useScope'

// En-tête de la sidebar = l'axe IDENTITÉ (org + équipe active) ET le déclencheur du
// SWITCH d'org : cliquer le bloc org/logo ouvre le WorkspaceSwitcher dans un POPOVER
// ANCRÉ sous le bouton (refonte nav zone 1, JB) — téléporté au body pour échapper au
// clip de la sidebar, position capturée à l'ouverture. Consultation pure ADR 0023, zéro
// effet MCP — jamais de bascule d'identité Claude depuis le FE. La GESTION (« gérer mon
// org / profil / plateforme ») reste pour l'instant dans la popin compte au pied
// (ConsoleUserMenu) ; sa remontée dans ce popover = tranche suivante. Le bloc s'adapte
// au niveau : en « org » il se recompose en bannière sur l'organisation gérée.
const { me } = useMe()
const { level } = useScope()
const { prefetch } = useMyOrgs()   // orgs+équipes préchargées au survol → modale instantanée

const open = ref(false)
const identBtn = ref<HTMLButtonElement>()
// Popover ancré (refonte nav zone 1) : position capturée à l'ouverture (sous le bouton,
// aligné à gauche), téléporté au body pour échapper au clip de la sidebar.
const anchor = ref({ left: 0, top: 0 })
function toggle() {
  if (!open.value) {
    const r = identBtn.value?.getBoundingClientRect()
    if (r) anchor.value = { left: r.left, top: r.bottom + 6 }
  }
  open.value = !open.value
}

// Échap referme le popover (listener posé seulement quand il est ouvert).
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
      ref="identBtn"
      class="ident"
      :class="{ org: level === 'org', team: level === 'group', platform: level === 'platform' }"
      :aria-expanded="open"
      aria-haspopup="dialog"
      aria-label="changer d'organisation"
      @pointerenter="prefetch"
      @focus="prefetch"
      @click="toggle"
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

    <!-- popover switch d'org : téléporté au body, ancré sous le bouton, surface CLAIRE -->
    <Teleport to="body">
      <div v-if="open" class="id-pop-root">
        <div class="id-pop-backdrop" @click="open = false" />
        <div
          class="id-pop"
          role="dialog"
          aria-label="changer d'organisation"
          :style="{ left: `${anchor.left}px`, top: `${anchor.top}px` }"
        >
          <div class="id-pop-body">
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

/* ── Popover de switch d'org (téléporté au body, ancré sous le bouton) ──────── */
.id-pop-root { position: fixed; inset: 0; z-index: 200; }
.id-pop-backdrop { position: absolute; inset: 0; }
.id-pop {
  position: absolute;
  width: min(320px, calc(100vw - 24px));
  display: flex; flex-direction: column;
  max-height: min(70vh, 560px);
  background: var(--color-surface); border: 1px solid var(--color-hair);
  border-radius: var(--radius-md); box-shadow: var(--shadow-pop);
  overflow: hidden;
}
.id-pop-body { padding: 8px; overflow-y: auto; }
</style>
