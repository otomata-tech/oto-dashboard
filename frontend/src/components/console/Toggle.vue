<script setup lang="ts">
const props = defineProps<{ on: boolean; disabled?: boolean }>()
const emit = defineEmits<{ (e: 'change', value: boolean): void }>()
function onClick() {
  if (!props.disabled) emit('change', !props.on)
}
</script>

<template>
  <button
    :aria-pressed="on"
    :aria-disabled="disabled || undefined"
    :style="{
      width: '32px', height: '18px', borderRadius: '999px',
      border: '1px solid ' + (on ? 'var(--color-ink)' : 'var(--color-hair-classic)'),
      background: on ? 'var(--color-ink)' : 'var(--color-surface)',
      position: 'relative', padding: 0, flexShrink: 0, transition: 'background 180ms',
      opacity: disabled ? 0.45 : 1, cursor: disabled ? 'default' : 'pointer',
    }"
    @click="onClick"
  >
    <span :style="{
      position: 'absolute', top: '2px', left: on ? '16px' : '2px', width: '12px', height: '12px',
      borderRadius: '999px', background: on ? 'var(--color-saffron)' : 'var(--color-hair-classic)',
      transition: 'left 180ms var(--ease-out)',
    }" />
  </button>
</template>
