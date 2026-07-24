<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Icon from './Icon.vue'
import Avatar from './Avatar.vue'
import { useMe } from '@/composables/useMe'
import { useAuth } from '@/composables/useAuth'
import { useNav } from '@/composables/useNav'
import { useScopedLink } from '@/composables/useScopedLink'

// Menu PERSO du pied de sidebar (refonte nav zone 5, JB : « bas = PERSO ») : moi /
// mon compte. Le SWITCH d'org ET la GOUVERNANCE (gérer org / équipe / plateforme)
// ont migré dans le popover d'org du HAUT (ConsoleIdentity). Ici, perso pur.
const route = useRoute()
const { t } = useI18n()
const { scoped } = useScopedLink()
const { me } = useMe()
const { logout } = useAuth()
const { closeNav } = useNav()

const open = ref(false)
const section = computed(() => String(route.meta.section || '/overview'))
const onAccount = computed(() => section.value.startsWith('/account'))

const entries = computed(() => [
  { key: 'account', label: 'Gérer mon compte', icon: 'user', to: '/account', active: onAccount.value },
  { key: 'prefs', label: 'Préférences', icon: 'gear', to: '/account/preferences',
    active: section.value === '/account/preferences' },
])

function go() {
  open.value = false
  closeNav()
}
</script>

<template>
  <div class="usermenu" :class="{ open }">
    <!-- backdrop : un clic dehors referme -->
    <div v-if="open" class="um-backdrop" @click="open = false" />

    <!-- menu perso (s'ouvre vers le haut depuis le pied de sidebar) -->
    <div v-if="open" class="um-pop" role="menu">
      <RouterLink
        v-for="e in entries" :key="e.key"
        class="um-item" :class="{ on: e.active }"
        role="menuitem" :to="scoped(e.to)" @click="go"
      >
        <span class="ic"><Icon :name="e.icon" :size="15" /></span>
        {{ e.label }}
      </RouterLink>
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

.um-backdrop { position: fixed; inset: 0; z-index: var(--z-menu); }

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
  position: absolute; bottom: calc(100% + 6px); left: 0; right: 0; z-index: var(--z-menu);
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
</style>
