<script setup lang="ts">
import Dot from './Dot.vue'
import Btn from './Btn.vue'
import Squiggle from './Squiggle.vue'

// Erreur amont, session TOUJOURS valide (le cas `stale_session` est intercepté hors
// shell par ConsoleLayout → SessionExpired). Ici : « on n'a pas pu joindre oto-mcp »,
// ça se règle souvent par un retry.
defineProps<{ message: string }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div class="state-error">
    <div class="se-card">
      <div class="se-head">
        <Dot tone="terra" :size="9" />
        <div class="t">couldn't reach oto-mcp</div>
      </div>
      <div class="se-msg">
        {{ message }} your session is still valid — this is usually an upstream hiccup, not your
        keys. it often clears on a <Squiggle>retry</Squiggle>.
      </div>
      <div class="se-cta">
        <Btn @click="$emit('retry')">Retry now</Btn>
        <Btn kind="ghost" icon="ext" @click="$emit('retry')">Status page</Btn>
      </div>
    </div>
  </div>
</template>
