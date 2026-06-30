<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import Icon from './Icon.vue'
import Dot from './Dot.vue'
import ConsoleIdentity from './ConsoleIdentity.vue'
import ConsoleUserMenu from './ConsoleUserMenu.vue'
import { NAV } from '@/lib/consoleNav'
import { useMe, isPlatformOperator, isSuperAdmin } from '@/composables/useMe'
import { useNav } from '@/composables/useNav'
import { useScope } from '@/composables/useScope'

const route = useRoute()
const { me } = useMe()
const { navOpen, closeNav } = useNav()
// Niveau dérivé de la route : il filtre les groupes de nav ci-dessous. Le CHOIX
// du niveau (mon espace / org / plateforme) a migré dans le menu profil du pied.
const { level } = useScope()

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
      <ConsoleIdentity />
      <button class="sb-close" aria-label="fermer le menu" @click="closeNav">
        <Icon name="close" :size="18" />
      </button>
    </div>
    <nav class="sb-nav">
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
      <ConsoleUserMenu />
    </div>
  </aside>
</template>

<style scoped>
/* Plus de styles spécifiques ici : le menu profil (pied) porte les siens
   (ConsoleUserMenu), le reste du chrome sidebar vit dans console.css. */
</style>
