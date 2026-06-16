import { ref } from 'vue'

// État partagé du tiroir de navigation (sidebar off-canvas en dessous du
// breakpoint mobile). Sur desktop la sidebar est toujours visible et ce flag
// est ignoré par le CSS ; il ne pilote que l'overlay mobile.
const navOpen = ref(false)

export function useNav() {
  function toggleNav() { navOpen.value = !navOpen.value }
  function closeNav() { navOpen.value = false }
  return { navOpen, toggleNav, closeNav }
}
