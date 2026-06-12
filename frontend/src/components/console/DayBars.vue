<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ days: [number, number][]; height?: number }>(), {
  height: 84,
})

const max = computed(() => Math.max(...props.days.map(([a, b]) => a + b), 1))

function segs([ok, err]: [number, number]) {
  const okH = Math.round((ok / max.value) * 100)
  const errH = Math.round((err / max.value) * 100)
  return {
    ok: Math.max(okH, ok > 0 ? 3 : 0),
    err,
    errH: Math.max(errH, 3),
    title: `${ok + err} calls · ${err} errors`,
  }
}
</script>

<template>
  <div class="daybars" :style="{ height: height + 'px' }">
    <div v-for="(d, i) in days" :key="i" class="db" :title="segs(d).title">
      <div class="seg-ok" :style="{ height: segs(d).ok + '%' }" />
      <div v-if="segs(d).err > 0" class="seg-err" :style="{ height: segs(d).errH + '%' }" />
    </div>
  </div>
</template>
