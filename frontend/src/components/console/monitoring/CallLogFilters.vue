<script setup lang="ts">
// Filtres d'investigation du journal plateforme (server-side — le backend porte
// les axes, cf. capacité `monitoring.calls`). Sans eux, le journal ne montrait que
// les 100 derniers appels tous confondus : impossible d'isoler « les erreurs de
// folk_search de jb depuis 3 jours » ou « tout ce qui a dépassé 5 s ».
//
// Les champs texte sont débouncés (frappe → une requête, pas une par touche) ; les
// axes ponctuels (déroulé, conversation) arrivent par clic depuis une fiche d'appel
// et s'affichent en chips retirables — ils ne se tapent pas à la main.
import { ref, watch } from 'vue'

export interface CallFilters {
  tool?: string
  sub?: string
  error_contains?: string
  min_duration_ms?: number
  run_id?: string
  session_id?: string
}

const props = defineProps<{ modelValue: CallFilters }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: CallFilters): void }>()

// Paliers de lenteur : cale la chasse aux gels d'event loop (≥1 s = suspect sur un
// serveur mono-loop, ≥10 s = ce que loop_watch remonte déjà à Sentry).
const SLOW = [
  { v: 0, label: 'toutes durées' },
  { v: 1000, label: '≥ 1 s' },
  { v: 5000, label: '≥ 5 s' },
  { v: 30000, label: '≥ 30 s' },
]

const tool = ref(props.modelValue.tool ?? '')
const sub = ref(props.modelValue.sub ?? '')
const errText = ref(props.modelValue.error_contains ?? '')
const slow = ref(props.modelValue.min_duration_ms ?? 0)

// Les chips (run/session) sont pilotées par le parent (clic depuis une fiche) :
// on les relit à chaque changement plutôt que d'en tenir une copie locale.
function push(patch: Partial<CallFilters>) {
  const next: CallFilters = { ...props.modelValue, ...patch }
  for (const k of Object.keys(next) as (keyof CallFilters)[]) {
    if (next[k] === '' || next[k] === 0 || next[k] == null) delete next[k]
  }
  emit('update:modelValue', next)
}

let timer: ReturnType<typeof setTimeout> | undefined
function debounced(patch: Partial<CallFilters>) {
  clearTimeout(timer)
  timer = setTimeout(() => push(patch), 350)
}

watch(tool, (v) => debounced({ tool: v.trim() }))
watch(sub, (v) => debounced({ sub: v.trim() }))
watch(errText, (v) => debounced({ error_contains: v.trim() }))
watch(slow, (v) => push({ min_duration_ms: v }))

// Le parent peut poser un filtre lui-même (clic sur un axe d'une fiche) → resynchroniser.
// On ne réécrit un champ que s'il DIVERGE de la saisie en cours (comparaison sur la
// valeur trimmée) : sinon un espace en cours de frappe serait effacé sous les doigts.
watch(() => props.modelValue, (m) => {
  if ((m.tool ?? '') !== tool.value.trim()) tool.value = m.tool ?? ''
  if ((m.sub ?? '') !== sub.value.trim()) sub.value = m.sub ?? ''
  if ((m.error_contains ?? '') !== errText.value.trim()) errText.value = m.error_contains ?? ''
  slow.value = m.min_duration_ms ?? 0
})
</script>

<template>
  <div class="clf">
    <input v-model="tool" class="inp sm mono" type="search" placeholder="outil (ex. folk_search)" />
    <input v-model="sub" class="inp sm" type="search" placeholder="appelant (email ou sub)" />
    <input v-model="errText" class="inp sm" type="search" placeholder="message d’erreur contient…" />
    <select v-model.number="slow" class="inp sm">
      <option v-for="s in SLOW" :key="s.v" :value="s.v">{{ s.label }}</option>
    </select>

    <!-- Axes posés par clic depuis une fiche d'appel : visibles et retirables,
         sinon le journal reste filtré sans que rien ne le dise. -->
    <button v-if="modelValue.run_id" type="button" class="btn-mini"
      @click="push({ run_id: undefined })">
      déroulé <code class="mono">{{ modelValue.run_id }}</code> ✕
    </button>
    <button v-if="modelValue.session_id" type="button" class="btn-mini"
      @click="push({ session_id: undefined })">
      conversation ✕
    </button>
  </div>
</template>

<style scoped>
.clf {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.clf .inp.sm { max-width: 210px; }
</style>
