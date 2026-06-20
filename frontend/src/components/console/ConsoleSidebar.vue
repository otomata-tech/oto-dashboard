<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import Icon from './Icon.vue'
import Dot from './Dot.vue'
import Avatar from './Avatar.vue'
import { NAV } from '@/lib/consoleNav'
import type { NavLevel } from '@/lib/consoleNav'
import { useMe, isPlatformOperator, isSuperAdmin } from '@/composables/useMe'
import { useAuth } from '@/composables/useAuth'
import { useNav } from '@/composables/useNav'
import { useScope } from '@/composables/useScope'

const route = useRoute()
const { me } = useMe()
const { logout } = useAuth()
const { navOpen, closeNav } = useNav()
const { level, goLevel } = useScope()

// Le switch de niveau de gouvernance vit dans le topbar — mais y est masqué en
// mobile (les libellés débordent). On le rejoue ici, en tête de la nav-drawer
// mobile (seule surface de navigation à cette largeur), pour que org-admin /
// plateforme restent atteignables. Mêmes crans, même gating par droits.
const levelTabs = computed<{ key: NavLevel; label: string }[]>(() => {
  const tabs: { key: NavLevel; label: string }[] = [{ key: 'work', label: 'mon espace' }]
  if (me.value?.active_org != null) tabs.push({ key: 'org', label: 'gérer mon org' })
  if (isPlatformOperator(me.value)) tabs.push({ key: 'platform', label: 'gérer la plateforme' })
  return tabs
})

// La sidebar ne montre que le niveau actif. Le niveau plateforme reste gaté par
// le rôle plateforme (opérateur admin OU super_admin ; l'API l'impose aussi côté
// serveur, l'UI ne fait que masquer). Les items marqués `super` (ex. platform
// keys) ne sortent qu'au super_admin — les autres restent visibles à l'opérateur.
const visibleGroups = computed(() =>
  NAV.filter((g) => g.level === level.value)
     .filter((g) => g.level !== 'platform' || isPlatformOperator(me.value))
     .map((g) => ({
       ...g,
       items: g.items.filter((it) => !it.super || isSuperAdmin(me.value)),
     })))
</script>

<template>
  <aside class="sb" :class="{ open: navOpen }">
    <div class="sb-brand">
      <span class="o-medallion o-medallion-sm">o</span>
      <div>
        <div class="name">oto</div>
        <div class="env">console</div>
      </div>
      <button class="sb-close" aria-label="fermer le menu" @click="closeNav">
        <Icon name="close" :size="18" />
      </button>
    </div>
    <nav class="sb-nav">
      <!-- Switch de niveau (mobile uniquement) : le segmented control du topbar
           est masqué sous 820px → on le rejoue ici pour garder org/plateforme
           atteignables. Masqué en desktop (CSS) où le topbar le porte déjà. -->
      <div v-if="levelTabs.length > 1" class="sb-levels" role="tablist" aria-label="niveau">
        <button
          v-for="t in levelTabs"
          :key="t.key"
          class="sb-lvl"
          :class="{ on: level === t.key, plat: t.key === 'platform' }"
          role="tab"
          :aria-selected="level === t.key"
          @click="goLevel(t.key)"
        >{{ t.label }}</button>
      </div>
      <div v-for="(g, gi) in visibleGroups" :key="gi" class="sb-group">
        <div v-if="g.group" class="sb-group-label">{{ g.group }}</div>
        <RouterLink
          v-for="it in g.items"
          :key="it.path"
          class="sb-item"
          :class="{ on: route.meta.section === it.path }"
          :to="it.path"
          @click="closeNav"
        >
          <span class="ic"><Icon :name="it.icon" :size="15" /></span>
          {{ it.label }}
          <span v-if="it.warn" class="warn-dot"><Dot tone="saffron" :size="7" /></span>
          <span v-else-if="it.count" class="count">{{ it.count }}</span>
        </RouterLink>
      </div>
    </nav>
    <div class="sb-foot">
      <div class="sb-mcp"><Dot tone="olive" :size="7" /> mcp connected</div>
      <div class="sb-user">
        <Avatar :src="me?.avatar_url" :name="me?.name || me?.email" :size="26" />
        <div class="who">
          <div class="n">{{ me?.name || me?.email }}</div>
          <div class="e">{{ me?.email }}</div>
        </div>
        <button class="sb-logout" title="se déconnecter" aria-label="se déconnecter" @click="() => logout()">
          <Icon name="logout" :size="15" />
        </button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
/* Switch de niveau de gouvernance dans la drawer mobile. Masqué en desktop : le
   topbar porte déjà le segmented control à cette largeur. */
.sb-levels { display: none; }

@media (max-width: 820px) {
  .sb-levels {
    display: flex; flex-direction: column; gap: 2px;
    padding: 4px; margin-bottom: 8px;
    background: var(--color-paper-2); border: 1px solid var(--color-hair);
    border-radius: 10px;
  }
  .sb-lvl {
    border: 0; background: transparent; cursor: pointer; text-align: left;
    padding: 8px 11px; border-radius: 7px;
    font-family: var(--font-mono); font-size: 12px; letter-spacing: 0.02em;
    font-weight: 600; color: var(--color-mute);
  }
  .sb-lvl:hover { color: var(--color-ink); }
  .sb-lvl.on { background: var(--color-surface); color: var(--color-ink); box-shadow: 0 1px 2px rgb(0 0 0 / 0.06); }
  .sb-lvl.plat.on { color: var(--color-saffron); }
}
</style>
