<script setup lang="ts">
// Bloc étiqueté DANS un ConfigPanel : libellé mono uppercase + aide + slot contrôle.
// Reprend le pattern .ocfield/.oclabel/.ochelp de ConnectorOrgCard (redéclaré
// localement plutôt que couplé à ses styles scopés). `inline` = label et contrôle
// sur une ligne ; sinon empilés. `divider` = filet supérieur de séparation.
withDefaults(defineProps<{
  label?: string
  help?: string
  divider?: boolean
  inline?: boolean
}>(), {})
</script>

<template>
  <div class="cfg-sect" :class="{ divider, inline }">
    <div v-if="label || $slots.status || help || $slots.help" class="cfg-sect-head">
      <div class="cfg-sect-labels">
        <div class="cfg-row">
          <span v-if="label" class="cfg-label">{{ label }}</span>
          <span v-if="$slots.status" class="cfg-status"><slot name="status" /></span>
        </div>
        <span v-if="help || $slots.help" class="cfg-help"><slot name="help">{{ help }}</slot></span>
      </div>
    </div>
    <div class="cfg-ctrl"><slot /></div>
  </div>
</template>

<style scoped>
.cfg-sect { display: flex; flex-direction: column; gap: 8px; padding: 4px 0; }
.cfg-sect.divider { border-top: 1px solid var(--color-hair-soft); padding-top: 14px; margin-top: 6px; }
.cfg-sect.inline { flex-direction: row; align-items: center; justify-content: space-between; gap: 16px; }
.cfg-sect.inline .cfg-ctrl { flex-shrink: 0; }
.cfg-sect-head { display: flex; align-items: flex-start; gap: 10px; }
.cfg-sect-labels { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cfg-row { display: flex; align-items: center; gap: 8px; }
.cfg-label { font-size: 11px; font-weight: 600; color: var(--color-mute); text-transform: uppercase; letter-spacing: 0.04em; }
.cfg-help { font-size: 11px; color: var(--color-faint); line-height: 1.35; max-width: 56ch; }
</style>
