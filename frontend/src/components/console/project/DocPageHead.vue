<script setup lang="ts">
// En-tête d'une page de projet (24/09/2026, repris du front de JB) : le fil d'Ariane (le
// projet puis les pages parentes, cliquables), le titre — modifiable en place quand on
// peut écrire —, puis la date de dernière modification et l'état de l'enregistrement.
//
// « par qui » manque : une page ne sert pas son dernier auteur (oto#274). On n'invente pas
// de nom à partir de l'historique, qui dit qui a écrit la version d'AVANT.
import { computed, nextTick, ref } from 'vue'
import type { Doc } from '@/types/api'
import { fmtDay } from '@/types/api'
import type { SaveStatus } from '@/composables/useDocAutosave'

const props = defineProps<{
  projectName: string
  doc: Doc
  docs?: Doc[]
  readOnly?: boolean
  status?: SaveStatus
  error?: string | null
}>()
const emit = defineEmits<{ 'open-doc': [id: number]; rename: [title: string]; reload: [] }>()

// Les pages parentes, de la plus haute à la plus proche (bornées : un cycle en base ne
// doit pas figer l'écran).
const trail = computed(() => {
  const byId = new Map((props.docs ?? []).map((d) => [d.id, d]))
  const out: Doc[] = []
  let p = props.doc.parent_id
  while (p != null && out.length < 8) {
    const d = byId.get(p)
    if (!d) break
    out.unshift(d)
    p = d.parent_id
  }
  return out
})

const STATUS: Record<SaveStatus, string> = {
  idle: '', pending: 'modifications en cours…', saving: 'enregistrement…', saved: 'enregistré',
  error: 'non enregistré', conflict: '',
}

const renaming = ref(false)
const draft = ref('')
const input = ref<HTMLInputElement | null>(null)
async function startRename() {
  if (props.readOnly) return
  draft.value = props.doc.title
  renaming.value = true
  await nextTick()
  input.value?.select()
}
function commit() {
  if (!renaming.value) return
  renaming.value = false
  const t = draft.value.trim()
  if (t && t !== props.doc.title) emit('rename', t)
}
</script>

<template>
  <div class="dph">
    <nav class="dph__trail" aria-label="fil d'Ariane">
      <span>{{ projectName }}</span>
      <template v-for="d in trail" :key="d.id">
        <span class="dph__sep">›</span>
        <button class="dph__crumb" @click="emit('open-doc', d.id)">{{ d.title || 'Sans titre' }}</button>
      </template>
    </nav>
    <div class="dph__row">
      <input v-if="renaming" ref="input" v-model="draft" class="dph__titlein" aria-label="titre de la page"
        @keydown.enter.prevent="commit" @keydown.esc="renaming = false" @blur="commit" />
      <h3 v-else class="dph__title" :class="{ 'dph__title--edit': !readOnly }"
        :title="readOnly ? undefined : 'renommer'" @click="startRename">{{ doc.title || 'Sans titre' }}</h3>
      <slot />
    </div>
    <div v-if="doc.description" class="dph__eb">{{ doc.description }}</div>
    <div class="dph__meta">
      <span v-if="doc.updated_at">modifié le {{ fmtDay(doc.updated_at) }}</span>
      <span v-if="status && STATUS[status]" class="dph__st" :class="`dph__st--${status}`">
        · {{ STATUS[status] }}<template v-if="status === 'error' && error"> — {{ error }}</template>
      </span>
    </div>
    <!-- Conflit : le levier est dans la phrase. Recharger jette le brouillon, qui reste
         affiché d'ici là pour être copié. -->
    <p v-if="status === 'conflict'" class="dph__conflict">
      cette page a été modifiée ailleurs pendant que tu écrivais : rien n'a été écrasé.
      copie ton texte si besoin, puis <button class="dph__crumb" @click="emit('reload')">recharge la page</button>.
    </p>
  </div>
</template>

<style scoped>
.dph { min-width: 0; }
.dph__trail { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; font-size: 11.5px; color: var(--color-faint); margin-bottom: 4px; }
.dph__sep { color: var(--color-faint); }
.dph__crumb { font: inherit; background: none; border: 0; padding: 0; cursor: pointer; color: var(--color-cobalt-ink); }
.dph__crumb:hover { text-decoration: underline; }
.dph__row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.dph__title { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -.02em; color: var(--color-ink); }
.dph__title--edit { cursor: text; border-radius: var(--radius-md); }
.dph__title--edit:hover { background: var(--color-hair-soft); }
.dph__titlein { min-width: 0; flex: 1; font: inherit; font-size: 20px; font-weight: 700; letter-spacing: -.02em;
  color: var(--color-ink); background: var(--color-surface); border: 1px solid var(--color-hair);
  border-radius: var(--radius-md); padding: 0 6px; }
.dph__eb { margin-top: 3px; font-size: 12.5px; color: var(--color-mute); }
.dph__meta { margin-top: 4px; font-size: 11.5px; color: var(--color-faint); }
.dph__st--error { color: var(--color-terra-ink); }
.dph__st--saved { color: var(--color-olive); }
.dph__conflict { margin: 8px 0 0; font-size: 12px; line-height: 1.45; color: var(--color-terra-ink); }
</style>
