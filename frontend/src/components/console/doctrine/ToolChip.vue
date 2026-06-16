<script setup lang="ts">
import { computed } from 'vue'
import { resolveTool, type ToolReg } from './tools'

const props = defineProps<{ name: string; reg: ToolReg }>()
const r = computed(() => resolveTool(props.reg, props.name))
</script>

<template>
  <span class="oto-chip" :class="`oto-chip--${r.state}`">
    <span class="oto-chip__dot" />
    <span>{{ name }}</span>
    <span v-if="r.state === 'fed'" class="oto-chip__fed">féd</span>
    <span class="oto-tip">
      <span>
        <span class="oto-tip__name">{{ name }}</span>
        <span class="oto-tip__src" :class="{ 'oto-tip__srcd': r.state === 'dead' }">{{ r.srcLabel }}</span>
      </span>
      <span class="oto-tip__desc">{{ r.desc }}</span>
    </span>
  </span>
</template>

<style scoped>
.oto-chip {
  position: relative; display: inline-flex; align-items: center; gap: 5px;
  padding: 1px 7px 1px 6px; margin: 0 1px; border-radius: 999px;
  font-family: var(--font-mono); font-size: 0.82em; font-weight: 500; line-height: 1.5;
  border: 1px solid transparent; vertical-align: baseline; cursor: default; white-space: nowrap;
}
.oto-chip__dot { width: 6px; height: 6px; border-radius: 999px; flex: none; }
.oto-chip__fed {
  font-size: 8px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.65;
}
.oto-chip--ok, .oto-chip--fed {
  background: var(--color-olive-soft); border-color: #d7e398; color: var(--color-olive-ink);
}
.oto-chip--ok .oto-chip__dot, .oto-chip--fed .oto-chip__dot { background: var(--color-olive); }
.oto-chip--dead {
  background: var(--color-terra-soft); border-color: #eeb39c; color: var(--color-terra-ink);
}
.oto-chip--dead .oto-chip__dot { background: var(--color-terra); }

.oto-tip {
  position: absolute; left: 50%; transform: translateX(-50%) translateY(5px);
  bottom: calc(100% + 9px); width: 234px; background: var(--color-ink); color: var(--color-bg);
  border-radius: 10px; padding: 10px 12px; opacity: 0; pointer-events: none;
  transition: opacity 150ms var(--ease-out), transform 150ms var(--ease-out); z-index: 50;
  box-shadow: 0 10px 28px -10px rgba(0, 0, 0, 0.4); white-space: normal; text-align: left;
}
.oto-chip:hover .oto-tip { opacity: 1; transform: translateX(-50%) translateY(0); }
.oto-tip::after {
  content: ''; position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
  border: 5px solid transparent; border-top-color: var(--color-ink);
}
.oto-tip__name { font-family: var(--font-mono); font-size: 11.5px; font-weight: 600; color: var(--color-bg); }
.oto-tip__src {
  font-family: var(--font-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.1em;
  text-transform: uppercase; color: var(--color-saffron); margin-left: 6px;
}
.oto-tip__srcd { color: var(--color-terra-soft); }
.oto-tip__desc {
  display: block; font-family: var(--font-sans); font-size: 11.5px; line-height: 1.45;
  color: rgba(254, 252, 245, 0.78); margin-top: 5px;
}
</style>
