<script setup lang="ts">
// Overlay modal STANDARD — source UNIQUE du « chrome » des modales maison :
// Teleport en fin de <body> (invariant anti-empilement, cf. règle console.css),
// Transition modal-fade, scrim plein écran à --z-modal, et fermeture au clic
// extérieur. Élimine la duplication de `position:fixed inset-0 z-index:var(--z-modal)`
// + du Teleport recopiés dans chaque modale (code smell). Le panneau (`.modal`)
// reste au slot, stylé par le parent.
//
// Usage :
//   <ModalOverlay :open="open" @close="emit('close')">
//     <div class="modal">…</div>
//   </ModalOverlay>
//
// `align` : center (défaut) ou top (pickers/command-palette). Le z-index vit ICI et
// nulle part ailleurs → plus de dérive possible.
withDefaults(defineProps<{ open?: boolean; align?: 'center' | 'top' }>(), {
  open: false, align: 'center',
})
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="open" class="modal-overlay" :class="`modal-overlay--${align}`"
        @mousedown.self="emit('close')">
        <slot />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; z-index: var(--z-modal); display: flex; justify-content: center;
  padding: 24px; background: var(--scrim); backdrop-filter: blur(var(--blur-overlay));
}
.modal-overlay--center { align-items: center; }
.modal-overlay--top { align-items: flex-start; padding-top: 90px; }
.modal-fade-enter-active, .modal-fade-leave-active { transition: opacity .16s ease; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; }
</style>
