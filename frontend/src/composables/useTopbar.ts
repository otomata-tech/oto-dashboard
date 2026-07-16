import { computed, ref } from 'vue'

// Prises du topbar par une page (via TopbarPage). >0 ⇒ une page injecte son propre
// en-tête dans le topbar → ConsoleTopbar masque son titre statique générique (fin
// du double en-tête, lot 1 retour 8).
const claims = ref(0)

export function useTopbar() {
  return {
    claimed: computed(() => claims.value > 0),
    claim: () => { claims.value++ },
    release: () => { claims.value = Math.max(0, claims.value - 1) },
  }
}
