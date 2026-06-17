<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import Icon from './Icon.vue'
import Dot from './Dot.vue'
import Avatar from './Avatar.vue'
import { NAV } from '@/lib/consoleNav'
import { useMe } from '@/composables/useMe'
import { useAuth } from '@/composables/useAuth'
import { useNav } from '@/composables/useNav'

const route = useRoute()
const { me } = useMe()
const { logout } = useAuth()
const { navOpen, closeNav } = useNav()

const visibleGroups = computed(() => NAV.filter((g) => !g.admin || me.value?.role === 'admin'))
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
      <div v-for="(g, gi) in visibleGroups" :key="gi" class="sb-group">
        <div v-if="g.group" class="sb-group-label">{{ g.group }}</div>
        <RouterLink
          v-for="it in g.items"
          :key="it.id"
          class="sb-item"
          :class="{ on: route.params.section === it.id }"
          :to="`/console/${it.id}`"
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
        <button class="sb-logout" title="se déconnecter" aria-label="se déconnecter" @click="logout">
          <Icon name="logout" :size="15" />
        </button>
      </div>
    </div>
  </aside>
</template>
