<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Icon from './Icon.vue'
import Avatar from './Avatar.vue'
import { useMe, isPlatformOperator } from '@/composables/useMe'
import { useAuth } from '@/composables/useAuth'
import { useNav } from '@/composables/useNav'
import { useScope } from '@/composables/useScope'
import { useScopedLink } from '@/composables/useScopedLink'
import AccountViewAs from './AccountViewAs.vue'

// Menu profil (pied de sidebar) = point d'entrée unique des destinations de
// GESTION (profil / org / plateforme). On *entre* dans une zone puis on en *sort*.
// Le SWITCH d'org, lui, a repris sa place en HAUT (ConsoleIdentity, sur l'org/logo) —
// ici c'est « qu'est-ce que je gère », pas « sous quelle org j'agis ». Gating par
// droits : org = org_admin de l'org courante, plateforme = opérateur plateforme.
const route = useRoute()
const { t } = useI18n()
const { scoped } = useScopedLink()
const { me } = useMe()
const { logout } = useAuth()
const { closeNav } = useNav()
const { level } = useScope()

const open = ref(false)
const section = computed(() => String(route.meta.section || '/overview'))

type Entry = {
  key: string
  label: string
  icon: string
  to: string
  active: boolean
  tone?: 'platform'
}

const onAccount = computed(() => section.value.startsWith('/account'))
const onActivity = computed(() => section.value.startsWith('/activity'))

// SWITCH d'espace (3 crans) : « où je travaille ». Mon Espace (consommation, niveau
// user) · Espace Entreprise (gouvernance de l'org, org_admin) · Gérer mon compte.
// L'entreprise n'apparaît que si j'administre l'org (sinon le switch a 2 crans).
const spaces = computed<Entry[]>(() => {
  const out: Entry[] = [
    { key: 'work', label: 'userMenu.spaceMine', icon: 'home', to: '/overview',
      active: level.value === 'work' && !onAccount.value && !onActivity.value },
  ]
  if (me.value?.org_role === 'org_admin')
    out.push({ key: 'org', label: 'userMenu.spaceOrg', icon: 'building', to: '/org',
      active: level.value === 'org' })
  out.push({ key: 'account', label: 'userMenu.spaceAccount', icon: 'user', to: '/account',
    active: onAccount.value })
  return out
})

// Entrées auxiliaires (hors switch d'espace) : activité, équipe, plateforme.
const aux = computed<Entry[]>(() => {
  const out: Entry[] = [
    { key: 'activity', label: 'userMenu.activity', icon: 'pulse', to: '/activity',
      active: onActivity.value },
  ]
  // « mon équipe » : entre dans le scope team (menu dédié). Visible dès qu'une équipe
  // active est posée (repli sur me.active_group dans la vue si l'URL n'a pas de /g/).
  if (me.value?.active_group != null)
    out.push({ key: 'group', label: 'userMenu.manageTeam', icon: 'users', to: '/team/context',
      active: level.value === 'group' })
  if (isPlatformOperator(me.value))
    out.push({ key: 'platform', label: 'userMenu.managePlatform', icon: 'shield',
      to: '/platform/monitoring', active: level.value === 'platform', tone: 'platform' })
  return out
})

function go() {
  open.value = false
  closeNav()
}
</script>

<template>
  <div class="usermenu" :class="{ open }">
    <!-- backdrop : un clic dehors referme -->
    <div v-if="open" class="um-backdrop" @click="open = false" />

    <!-- menu déroulant (s'ouvre vers le haut depuis le pied de sidebar) -->
    <div v-if="open" class="um-pop" role="menu">
      <!-- Opérateur plateforme : naviguer entre comptes (view-as lecture seule) -->
      <template v-if="isPlatformOperator(me)">
        <AccountViewAs />
        <div class="um-sep" />
      </template>
      <!-- Switch d'espace : sélecteur exclusif « où je travaille » (3 crans max). -->
      <div class="um-switch" role="group">
        <RouterLink
          v-for="s in spaces" :key="s.key"
          class="um-switch-item" :class="{ on: s.active }"
          role="menuitemradio" :aria-checked="s.active"
          :to="scoped(s.to)" @click="go"
        >
          <span class="ic"><Icon :name="s.icon" :size="15" /></span>
          {{ t(s.label) }}
        </RouterLink>
      </div>
      <div class="um-sep" />
      <template v-for="e in aux" :key="e.key">
        <div v-if="e.tone === 'platform'" class="um-sep" />
        <RouterLink
          class="um-item"
          :class="{ on: e.active, plat: e.tone === 'platform' }"
          role="menuitem"
          :to="scoped(e.to)"
          @click="go"
        >
          <span class="ic"><Icon :name="e.icon" :size="15" /></span>
          {{ t(e.label) }}
        </RouterLink>
      </template>
      <div class="um-sep" />
      <button class="um-item danger" role="menuitem" @click="() => { open = false; logout() }">
        <span class="ic"><Icon name="logout" :size="15" /></span>
        {{ t('common.signOut') }}
      </button>
    </div>

    <!-- déclencheur : avatar + identité + chevron -->
    <button
      class="um-trigger"
      :aria-expanded="open"
      aria-haspopup="menu"
      :aria-label="t('userMenu.accountMenu')"
      @click="open = !open"
    >
      <Avatar :src="me?.avatar_url" :name="me?.name || me?.email" :size="26" />
      <div class="who">
        <div class="n">{{ me?.name || me?.email }}</div>
        <div class="e">{{ me?.email }}</div>
      </div>
      <Icon name="chevd" :size="13" class="um-chev" />
    </button>
  </div>
</template>

<style scoped>
.usermenu { position: relative; }

.um-backdrop { position: fixed; inset: 0; z-index: 40; }

.um-trigger {
  position: relative; z-index: 10;
  width: 100%; display: flex; align-items: center; gap: 8px;
  padding: 6px 8px; border-radius: var(--radius-md);
  border: 1px solid transparent; background: transparent;
  cursor: pointer; text-align: left;
  transition: background var(--t-fast), border-color var(--t-fast);
}
.um-trigger:hover,
.usermenu.open .um-trigger { background: var(--sidebar-hover-bg); border-color: var(--sidebar-hair); }

.who { flex: 1; min-width: 0; }
.who .n {
  font-weight: 600; font-size: 13px; color: var(--sidebar-fg-strong); line-height: 1.2;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.who .e {
  font-size: 11px; color: var(--sidebar-fg-mute); line-height: 1.2;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.um-chev { flex: none; color: var(--sidebar-fg-mute); transform: rotate(180deg); }

/* Le menu déroulant est une surface CLAIRE (menu flottant), pas sur l'encre. */
.um-pop {
  position: absolute; bottom: calc(100% + 6px); left: 0; right: 0; z-index: 50;
  display: flex; flex-direction: column; gap: 2px; padding: 6px;
  background: var(--color-surface); border: 1px solid var(--color-hair);
  border-radius: var(--radius-md); box-shadow: var(--shadow-pop);
  max-height: min(78vh, 620px); overflow-y: auto;
}
.um-item {
  display: flex; align-items: center; gap: 9px;
  padding: 8px 9px; border-radius: var(--radius-md); width: 100%;
  border: 0; background: transparent; cursor: pointer; text-align: left;
  font-family: inherit; font-size: 13px; font-weight: 600;
  color: var(--color-ink-soft); text-decoration: none;
}
.um-item:hover,
.um-item.on { background: var(--color-paper-2); color: var(--color-ink); }
.um-item .ic { display: inline-flex; color: var(--color-mute); }
.um-item.on .ic { color: var(--color-ink); }
.um-item.plat.on { color: var(--color-saffron); }
.um-item.plat.on .ic { color: var(--color-saffron); }
.um-item.danger { color: var(--color-mute); }
.um-item.danger:hover { background: var(--color-paper-2); color: var(--color-ink); }

.um-sep { height: 1px; margin: 4px 2px; background: var(--color-hair); }

/* Switch d'espace : segmented vertical (crans exclusifs, actif en aplat encre). */
.um-switch {
  display: flex; flex-direction: column; gap: 2px; padding: 3px;
  border: 1px solid var(--color-hair); border-radius: var(--radius-md);
  background: var(--color-paper); margin-bottom: 2px;
}
.um-switch-item {
  display: flex; align-items: center; gap: 9px;
  padding: 7px 9px; border-radius: var(--radius-md);
  font-size: 13px; font-weight: 600; color: var(--color-ink-soft); text-decoration: none;
  transition: background var(--t-fast), color var(--t-fast);
}
.um-switch-item .ic { display: inline-flex; color: var(--color-mute); }
.um-switch-item:hover { background: var(--color-paper-2); color: var(--color-ink); }
.um-switch-item.on { background: var(--color-ink); color: var(--color-bg); }
.um-switch-item.on .ic { color: var(--color-bg); }
</style>
