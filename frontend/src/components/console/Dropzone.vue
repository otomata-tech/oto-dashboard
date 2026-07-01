<script setup lang="ts">
// Dropzone — dépôt de fichier glisser-déposer + clic, themé « Manuscrit chaud ».
// S'appuie sur @vueuse/core (useDropZone/useFileDialog) — pas de lib d'upload tierce.
// Valide type (accept) + taille (maxSizeMb) AVANT d'émettre `select` ; sinon `error`
// (pas de fallback silencieux — le parent affiche le toast). Le transfert réseau
// reste au parent (busy piloté par prop).
import { ref } from 'vue'
import { useDropZone, useFileDialog } from '@vueuse/core'

const props = withDefaults(defineProps<{
  accept?: string        // ex. '.pdf,.html,image/*' — '*' = tout
  maxSizeMb?: number
  disabled?: boolean
  busy?: boolean
  label?: string
  hint?: string
}>(), {
  accept: '*',
  maxSizeMb: 25,
  disabled: false,
  busy: false,
  label: 'Déposer un fichier',
  hint: '',
})

const emit = defineEmits<{
  (e: 'select', file: File): void
  (e: 'error', message: string): void
}>()

const zone = ref<HTMLElement | null>(null)

function accepts(file: File): boolean {
  const a = props.accept
  if (!a || a === '*' || a === '*/*') return true
  const name = file.name.toLowerCase()
  const mime = file.type.toLowerCase()
  return a.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).some((t) => {
    if (t.startsWith('.')) return name.endsWith(t)
    if (t.endsWith('/*')) return mime.startsWith(t.slice(0, -1))
    return mime === t
  })
}

function handle(files: File[] | FileList | null) {
  if (props.disabled || props.busy) return
  const file = files?.[0]
  if (!file) return
  if (!accepts(file)) { emit('error', `Type de fichier non accepté (attendu : ${props.accept}).`); return }
  if (file.size > props.maxSizeMb * 1024 * 1024) { emit('error', `Fichier trop lourd (max ${props.maxSizeMb} Mo).`); return }
  emit('select', file)
}

const { isOverDropZone } = useDropZone(zone, { onDrop: handle, multiple: false })
const { open, onChange, reset } = useFileDialog({ accept: props.accept, multiple: false })
onChange((files) => { handle(files); reset() })

function browse() { if (!props.disabled && !props.busy) open() }
</script>

<template>
  <div
    ref="zone"
    class="dz"
    :class="{ 'dz--over': isOverDropZone, 'dz--busy': busy, 'dz--disabled': disabled }"
    role="button"
    :tabindex="disabled ? -1 : 0"
    :aria-disabled="disabled"
    @click="browse"
    @keydown.enter.prevent="browse"
    @keydown.space.prevent="browse"
  >
    <svg v-if="!busy" class="dz__ic" width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
    <span v-else class="dz__spin" aria-hidden="true" />
    <div class="dz__text">
      <strong class="dz__label">{{ busy ? 'envoi en cours…' : label }}</strong>
      <span v-if="!busy" class="dz__hint">{{ hint || `glisser-déposer ou cliquer · max ${maxSizeMb} Mo` }}</span>
    </div>
  </div>
</template>

<style scoped>
.dz {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 16px; border: 1px dashed var(--color-hair); border-radius: 11px;
  background: color-mix(in srgb, var(--color-paper-2) 40%, var(--color-surface));
  color: var(--color-mute); cursor: pointer; text-align: left;
  transition: border-color var(--t-fast) var(--ease-out), background var(--t-fast) var(--ease-out), transform var(--t-fast) var(--ease-out);
}
.dz:hover:not(.dz--disabled):not(.dz--busy) { border-color: var(--color-saffron); background: var(--color-saffron-soft); color: var(--color-saffron-ink); }
.dz:focus-visible { outline: 2px solid var(--color-saffron); outline-offset: 2px; }
.dz--over { border-color: var(--color-saffron); border-style: solid; background: var(--color-saffron-soft); color: var(--color-saffron-ink); transform: translateY(-1px); }
.dz--busy, .dz--disabled { cursor: not-allowed; opacity: .75; }
.dz__ic { flex: none; color: currentColor; }
.dz__text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.dz__label { font-size: 12.5px; font-weight: 600; color: var(--color-ink-soft); }
.dz--over .dz__label, .dz:hover:not(.dz--disabled):not(.dz--busy) .dz__label { color: var(--color-saffron-ink); }
.dz__hint { font-size: 11px; color: var(--color-faint); }
.dz__spin {
  flex: none; width: 18px; height: 18px; border-radius: 999px;
  border: 2px solid var(--color-hair); border-top-color: var(--color-saffron);
  animation: dz-spin .7s linear infinite;
}
@keyframes dz-spin { to { transform: rotate(360deg); } }
</style>
