<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import Icon from './Icon.vue'
import Dot from './Dot.vue'
import { PAGE_META } from '@/lib/consoleNav'
import { useMe } from '@/composables/useMe'

const route = useRoute()
const { me } = useMe()
const meta = computed(() => PAGE_META[String(route.params.section)] ?? PAGE_META.overview!)
</script>

<template>
  <header class="topbar">
    <div style="display: flex; align-items: baseline; gap: 10px">
      <h1>{{ meta.title }}</h1>
      <span class="crumb">{{ meta.crumb }}</span>
    </div>
    <div v-if="me?.active_org_name" class="right">
      <button class="org-pill">
        <Dot tone="saffron" :size="7" />
        {{ me.active_org_name }}
        <span class="role">{{ me.org_role === 'org_admin' ? 'admin' : 'member' }}</span>
        <Icon name="chevd" :size="11" :style="{ color: 'var(--color-faint)' }" />
      </button>
    </div>
  </header>
</template>
