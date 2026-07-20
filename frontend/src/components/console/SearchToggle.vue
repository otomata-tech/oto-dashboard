<script setup lang="ts">
// Recherche compacte réutilisable (connecteurs mine/org/team/plateforme + marketplace) :
// icône qui déplie un champ vers la gauche (row-reverse, icône ancrée à droite),
// fermeture par Échap/blur (si vide), raccourci global ⌘F/Ctrl+F (bloque la
// recherche native du navigateur tant que ce composant est monté).
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import Icon from './Icon.vue'

const q = defineModel<string>({ default: '' })
defineProps<{ placeholder?: string }>()

const searchOpen = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)
function openSearch() {
  searchOpen.value = true
  nextTick(() => inputRef.value?.focus())
}
function closeSearch() {
  searchOpen.value = false
  q.value = ''
}
function toggleSearch() {
  if (searchOpen.value) closeSearch()
  else openSearch()
}
function onBlur() {
  if (!q.value) searchOpen.value = false
}
function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
    e.preventDefault()
    openSearch()
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="cl-search">
    <button type="button" class="cc-search-btn" :class="{ on: searchOpen }"
      :aria-label="placeholder ?? 'search'" @click="toggleSearch">
      <Icon name="search" :size="14" />
    </button>
    <Transition name="cl-search-grow">
      <input v-if="searchOpen" ref="inputRef" v-model="q" class="cc-search cl-search-input"
        :placeholder="placeholder ?? 'search…'" @keydown.esc="closeSearch" @blur="onBlur" />
    </Transition>
  </div>
</template>

<style scoped>
/* row-reverse : l'icône reste ancrée à droite, le champ grandit vers la gauche. */
.cl-search { display: flex; flex-direction: row-reverse; align-items: center; gap: 6px; }
.cl-search-input { width: 200px; box-sizing: border-box; overflow: hidden; }
.cl-search-grow-enter-active, .cl-search-grow-leave-active {
  transition: width var(--t-fast) var(--ease-out), opacity var(--t-fast) var(--ease-out);
}
.cl-search-grow-enter-from, .cl-search-grow-leave-to { width: 0; opacity: 0; }
</style>
