import { ref, computed } from 'vue'

// Compteur d'activité réseau global. Incrémenté/décrémenté par le client API
// (src/api.ts) → pilote la présence « réfléchit » d'Oto (favicon dynamique).
const count = ref(0)

export const isBusy = computed(() => count.value > 0)
export function beginBusy() { count.value++ }
export function endBusy() { count.value = Math.max(0, count.value - 1) }
