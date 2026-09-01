<script setup lang="ts">
// Périmètre d'URL du projet (oto-backend#605, oto-dashboard#134) : la liste
// `excluded_url_prefixes` que les outils de recherche ÉCARTENT et que les outils
// d'extraction REFUSENT sous ce projet. Card autonome de la home (même patron que
// `saveConnector` dans ProjectViewer : elle porte sa propre écriture) — pose, liste,
// retrait, refus de pose rendu MOT POUR MOT (`explain`, ADR 0009 `AuthzDenied`).
import { ref, watch } from 'vue'
import Icon from '../Icon.vue'
import Btn from '../Btn.vue'
import { updateProject } from '@/api/console'
import { explain } from '@/lib/errors'

const props = defineProps<{ projectId: number; prefixes: string[]; readOnly?: boolean }>()
const emit = defineEmits<{ changed: [] }>()

// Copie locale : la réponse de pose est la forme CANONIQUE (normalisée serveur,
// cf. `url_perimeter.normalize_prefixes`) — on l'affiche telle quelle plutôt que
// de retenir ce que l'utilisateur a tapé.
const list = ref<string[]>([...props.prefixes])
watch(() => props.prefixes, (v) => { list.value = [...v] })

const draft = ref('')
const saving = ref(false)
const err = ref<string | null>(null)

async function persist(next: string[]): Promise<boolean> {
  if (saving.value) return false
  saving.value = true
  err.value = null
  try {
    const updated = await updateProject(props.projectId, { excluded_url_prefixes: next })
    list.value = [...(updated.excluded_url_prefixes ?? next)]
    emit('changed')
    return true
  } catch (e) {
    err.value = explain(e)
    return false
  } finally {
    saving.value = false
  }
}

async function add() {
  const v = draft.value.trim()
  if (!v || saving.value) return
  if (await persist([...list.value, v])) draft.value = ''
}
async function remove(p: string) {
  await persist(list.value.filter((x) => x !== p))
}
</script>

<template>
  <div class="pup">
    <div class="pup-eb">Périmètre d'URL</div>
    <p class="pup-hint">
      Les outils de recherche écartent (en le comptant) les résultats sous ces motifs ;
      les outils d'extraction refusent d'y aller.
    </p>

    <div v-if="list.length" class="pup-chips">
      <span v-for="p in list" :key="p" class="pup-chip">
        <span class="pup-chip__txt">{{ p }}</span>
        <button v-if="!readOnly" type="button" class="pup-chip__x" :disabled="saving"
          :aria-label="`retirer ${p}`" @click="remove(p)">
          <Icon name="x" :size="11" />
        </button>
      </span>
    </div>
    <p v-else class="pup-empty">aucune exclusion — tout est atteignable dans ce projet.</p>

    <form v-if="!readOnly" class="pup-add" @submit.prevent="add">
      <input v-model="draft" class="inp sm pup-in" :disabled="saving"
        placeholder="linkedin.com/in/, exemple.fr/*…" />
      <Btn kind="mini" icon="plus" :disabled="saving || !draft.trim()">Ajouter</Btn>
    </form>
    <p v-if="err" class="pup-err">{{ err }}</p>
  </div>
</template>

<style scoped>
.pup {
  display: flex; flex-direction: column; gap: 8px;
  padding: 12px 16px; margin-top: 12px;
  border: 1px solid var(--color-hair-soft); border-radius: var(--radius-card, 10px);
  background: var(--color-paper-2);
}
.pup-eb { font-family: var(--font-mono); font-size: 10px; font-weight: 600; letter-spacing: .16em; text-transform: uppercase; color: var(--color-mute); }
.pup-hint { font-size: 12px; color: var(--color-faint); line-height: 1.5; margin: 0; }
.pup-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.pup-chip {
  display: inline-flex; align-items: center; gap: 5px;
  border: 1px solid var(--color-hair); border-radius: var(--radius-pill, 999px);
  padding: 3px 4px 3px 10px; font-family: var(--font-mono); font-size: 11px;
  color: var(--color-ink-soft); background: var(--color-surface);
}
.pup-chip__txt { max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pup-chip__x {
  display: inline-flex; align-items: center; justify-content: center;
  width: 17px; height: 17px; border: 0; border-radius: var(--radius-pill, 999px);
  background: transparent; color: var(--color-mute); cursor: pointer; flex: none;
}
.pup-chip__x:hover:not(:disabled) { background: var(--color-terra-soft); color: var(--color-terra-ink); }
.pup-chip__x:disabled { opacity: .5; cursor: default; }
.pup-empty { font-size: 12px; color: var(--color-faint); margin: 0; }
.pup-add { display: flex; gap: 7px; margin-top: 2px; }
.pup-in { flex: 1; min-width: 0; }
.pup-err { font-size: 12px; color: var(--color-terra-ink); margin: 0; line-height: 1.5; }
</style>
