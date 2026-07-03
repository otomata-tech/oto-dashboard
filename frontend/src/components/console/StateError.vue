<script setup lang="ts">
import { computed } from 'vue'
import Dot from './Dot.vue'
import Btn from './Btn.vue'
import Squiggle from './Squiggle.vue'

const props = defineProps<{ message: string }>()
defineEmits<{ retry: []; relogin: [] }>()

// Session Logto morte (normalisée par api.ts) : le serveur va bien, c'est la
// session qu'il faut refaire — écran dédié, pas le hint « upstream hiccup ».
const isStale = computed(() => props.message === 'stale_session')
</script>

<template>
  <div class="state-error">
    <div v-if="isStale" class="se-card">
      <div class="se-head">
        <Dot tone="saffron" :size="9" />
        <div class="t">session expired</div>
      </div>
      <div class="se-msg">
        your sign-in session has expired — oto-mcp itself is fine.
        <Squiggle>sign in again</Squiggle> to pick up where you left off.
      </div>
      <div class="se-cta">
        <Btn @click="$emit('relogin')">sign in again</Btn>
      </div>
    </div>
    <div v-else class="se-card">
      <div class="se-head">
        <Dot tone="terra" :size="9" />
        <div class="t">couldn't reach oto-mcp</div>
      </div>
      <div class="se-msg">
        {{ message }} your session is still valid — this is usually an upstream hiccup, not your
        keys. it often clears on a <Squiggle>retry</Squiggle>.
      </div>
      <div class="se-cta">
        <Btn @click="$emit('retry')">retry now</Btn>
        <Btn kind="ghost" icon="ext" @click="$emit('retry')">status page</Btn>
      </div>
    </div>
  </div>
</template>
