<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import Icon from './Icon.vue'
import Avatar from './Avatar.vue'
import { useMe, isPlatformOperator } from '@/composables/useMe'
import { useAuth } from '@/composables/useAuth'
import { useNav } from '@/composables/useNav'
import { useScope } from '@/composables/useScope'

// Menu profil (pied de sidebar) = point d'entrée unique des destinations de
// GESTION, à la place de l'ancien level-switch du topbar. On *entre* dans une
// zone (profil / org / plateforme) puis on en *sort* — plus un cran de bascule
// contextuelle. L'axe « sous quelle org j'agis » reste l'identité (en-tête,
// ConsoleIdentity) ; ici c'est « qu'est-ce que je gère ». Gating par droits :
// org = org_admin de l'org courante, plateforme = opérateur plateforme.
const route = useRoute()
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

const entries = computed<Entry[]>(() => {
  const onAccount = section.value.startsWith('/account')
  const onActivity = section.value.startsWith('/activity')
  const out: Entry[] = [
    {
      key: 'work',
      label: 'mon espace',
      icon: 'home',
      to: '/overview',
      active: level.value === 'work' && !onAccount && !onActivity,
    },
    {
      key: 'profile',
      label: 'gérer mon profil',
      icon: 'user',
      to: '/account',
      active: onAccount,
    },
    {
      key: 'activity',
      label: 'activity',
      icon: 'pulse',
      to: '/activity',
      active: onActivity,
    },
  ]
  if (me.value?.org_role === 'org_admin')
    out.push({
      key: 'org',
      label: 'gérer mon org',
      icon: 'building',
      to: '/org',
      active: level.value === 'org',
    })
  if (isPlatformOperator(me.value))
    out.push({
      key: 'platform',
      label: 'gérer la plateforme',
      icon: 'shield',
      to: '/platform/monitoring',
      active: level.value === 'platform',
      tone: 'platform',
    })
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
      <template v-for="e in entries" :key="e.key">
        <div v-if="e.tone === 'platform'" class="um-sep" />
        <RouterLink
          class="um-item"
          :class="{ on: e.active, plat: e.tone === 'platform' }"
          role="menuitem"
          :to="e.to"
          @click="go"
        >
          <span class="ic"><Icon :name="e.icon" :size="15" /></span>
          {{ e.label }}
        </RouterLink>
      </template>
      <div class="um-sep" />
      <button class="um-item danger" role="menuitem" @click="() => { open = false; logout() }">
        <span class="ic"><Icon name="logout" :size="15" /></span>
        se déconnecter
      </button>
    </div>

    <!-- déclencheur : avatar + identité + chevron -->
    <button
      class="um-trigger"
      :aria-expanded="open"
      aria-haspopup="menu"
      aria-label="menu du compte"
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
  padding: 6px 8px; border-radius: 10px;
  border: 1px solid transparent; background: transparent;
  cursor: pointer; text-align: left;
  transition: background var(--t-fast), border-color var(--t-fast);
}
.um-trigger:hover,
.usermenu.open .um-trigger { background: var(--color-paper-2); border-color: var(--color-hair); }

.who { flex: 1; min-width: 0; }
.who .n {
  font-weight: 600; font-size: 13px; color: var(--color-ink); line-height: 1.2;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.who .e {
  font-size: 11px; color: var(--color-mute); line-height: 1.2;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.um-chev { flex: none; color: var(--color-faint); transform: rotate(180deg); }

.um-pop {
  position: absolute; bottom: calc(100% + 6px); left: 0; right: 0; z-index: 50;
  display: flex; flex-direction: column; gap: 2px; padding: 6px;
  background: var(--color-surface); border: 1px solid var(--color-hair);
  border-radius: 12px; box-shadow: 0 8px 28px rgb(0 0 0 / 0.12);
}
.um-item {
  display: flex; align-items: center; gap: 9px;
  padding: 8px 9px; border-radius: 8px; width: 100%;
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
