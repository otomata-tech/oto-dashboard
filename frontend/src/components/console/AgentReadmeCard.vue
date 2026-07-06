<script setup lang="ts">
// Carte « agent readme » — UN niveau du concept agent_readme (prose markdown libre
// injectée à chaque session, cumulée plateforme → org → équipe → user). Le composant
// est générique : le niveau vient des handlers passés en props (load/save). Le readme
// est de la PROSE PLATE (ADR 0042 : stocké dans `guides`, sans versioning) — ≠ procédures
// (/procedures), versionnées et chargées à la demande.
import { onMounted, ref } from 'vue'
import ConsoleCard from './ConsoleCard.vue'
import Btn from './Btn.vue'
import Tag from './Tag.vue'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'
import { useToast } from '@/composables/useToast'

const props = defineProps<{
  title: string
  sub: string
  canEdit: boolean
  placeholder?: string
  /** false = un corps vide est refusé à la sauvegarde. */
  allowEmpty?: boolean
  load: () => Promise<{ body_md: string; updated_at: string | null }>
  save: (body: string) => Promise<unknown>
}>()

const { toast } = useToast()
const body = ref('')
const draft = ref('')
const updatedAt = ref<string | null>(null)
const editing = ref(false)
const busy = ref(false)
const loaded = ref(false)

async function reload() {
  try {
    const r = await props.load()
    body.value = r.body_md || ''
    updatedAt.value = r.updated_at ?? null
  } catch {
    body.value = ''   // pas encore écrit (404) → état vide
  }
  loaded.value = true
}
onMounted(reload)

function edit() {
  draft.value = body.value
  editing.value = true
}
async function saveDraft() {
  const b = draft.value.trim()
  if (!b && !props.allowEmpty) { toast('readme vide — rien à publier'); return }
  busy.value = true
  try {
    await props.save(b)
    toast('agent readme publié — injecté aux prochaines sessions')
    editing.value = false
    await reload()
  } catch (e) { toast(humanize(e)) }
  finally { busy.value = false }
}
</script>

<template>
  <ConsoleCard :title="title" :sub="sub">
    <template v-if="canEdit && !editing" #actions>
      <Btn kind="mini" icon="pen" @click="edit">{{ body ? 'Éditer' : 'Écrire' }}</Btn>
    </template>

    <p v-if="!loaded" class="dim-note">chargement…</p>

    <template v-else-if="editing">
      <textarea v-model="draft" rows="10" class="rd-edit"
        :placeholder="placeholder || 'markdown libre — injecté au début de chaque session.'" />
      <div class="rd-actions">
        <Btn kind="mini" :disabled="busy" @click="editing = false">Annuler</Btn>
        <Btn :disabled="busy" @click="saveDraft">Publier</Btn>
      </div>
    </template>

    <template v-else>
      <div class="rd-meta">
        <Tag :tone="body ? 'olive' : undefined">{{ body ? 'injecté à chaque session' : 'vide' }}</Tag>
        <span v-if="updatedAt" class="dim-note">maj {{ fmtDate(updatedAt) }}</span>
      </div>
      <pre v-if="body" class="rd-body">{{ body }}</pre>
      <p v-else class="dim-note">
        rien d'écrit — l'agent démarre sans ce niveau de readme.
        {{ canEdit ? 'écris ici ce qu’il doit toujours savoir : contexte, règles, ton.' : '' }}
      </p>
    </template>
  </ConsoleCard>
</template>

<style scoped>
.dim-note { font-size: 12px; color: var(--color-mute); }
.rd-meta { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.rd-body {
  white-space: pre-wrap; word-break: break-word; font-size: 12.5px; line-height: 1.55;
  max-height: 320px; overflow: auto; margin: 0;
  background: var(--color-paper-3, #f5f1e8); border: 1px solid var(--color-hair-soft, #e3dccd);
  border-radius: 8px; padding: 12px 14px; color: var(--color-ink-soft, #4a463d);
  font-family: var(--font-sans);
}
.rd-edit {
  width: 100%; box-sizing: border-box; font-family: var(--font-mono); font-size: 12.5px;
  line-height: 1.55; color: var(--color-ink); background: var(--color-bg);
  border: 1px solid var(--color-hair); border-radius: 9px; padding: 10px 12px;
  outline: none; resize: vertical;
}
.rd-edit:focus-visible { outline: 2px solid var(--color-cobalt); outline-offset: 2px; }
.rd-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 10px; }
</style>
