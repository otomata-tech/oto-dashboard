<script setup lang="ts">
// Revue d'une proposition (lot 3 Ship 3) — composant PARTAGÉ, monté à deux endroits
// (accueil « À traiter » + drawer projet), sur reka Dialog (focus-trap/Esc, jamais
// le drawer maison). Porte le contexte (page/projet/proposeur/message) + un diff
// SIMPLE (avant/après ligne à ligne, LCS léger — pas de dépendance) + Accepter/
// Refuser. L'acceptation se résout par `request_id` (le backend branche create/update).
import { computed, ref, watch } from 'vue'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import Btn from '@/components/console/Btn.vue'
import { resolveDocChange, getDoc } from '@/api/console'
import { humanize } from '@/lib/errors'
import { useToast } from '@/composables/useToast'
import type { InboxReviewItem } from '@/types/api'

const props = defineProps<{ item: InboxReviewItem | null }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'resolved'): void }>()
const { toast } = useToast()

const open = computed(() => props.item != null)
const busy = ref(false)
// Contenu ACTUEL de la page (base du diff pour une modif) — chargé à l'ouverture.
const current = ref<{ title: string; body_md: string } | null>(null)
const proposed = ref<{ title: string; body_md: string } | null>(null)

watch(() => props.item, async (it) => {
  current.value = null; proposed.value = null
  if (!it) return
  // Le détail de la proposition n'est pas dans l'item d'inbox : on affiche ce qu'on a
  // (titre proposé + message) ; pour une MODIF on charge la page actuelle comme base.
  proposed.value = { title: it.proposed_title || it.doc_title || '', body_md: '' }
  if (it.kind === 'modif' && it.doc_id != null) {
    try { const d = await getDoc(it.doc_id); current.value = { title: d.title, body_md: d.body_md } }
    catch { current.value = null }
  }
}, { immediate: true })

// Diff ligne à ligne (LCS) — vert = ajout, rouge = retrait, neutre = inchangé.
type Row = { t: 'same' | 'add' | 'del'; text: string }
function lcsDiff(a: string[], b: string[]): Row[] {
  const n = a.length, m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
  const out: Row[] = []
  let i = 0, j = 0
  while (i < n && j < m) {
    const av = a[i]!, bv = b[j]!
    if (av === bv) { out.push({ t: 'same', text: av }); i++; j++ }
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) { out.push({ t: 'del', text: av }); i++ }
    else { out.push({ t: 'add', text: bv }); j++ }
  }
  while (i < n) out.push({ t: 'del', text: a[i++]! })
  while (j < m) out.push({ t: 'add', text: b[j++]! })
  return out
}
const diff = computed<Row[]>(() => {
  const it = props.item
  if (!it) return []
  // création : tout-ajout (le corps proposé n'est pas dans l'inbox → titre seulement) ;
  // modif : base = page actuelle. V1 diffe ce qu'on a sous la main (titres).
  const before = current.value ? current.value.body_md.split('\n') : []
  const after = it.kind === 'create' ? (proposed.value?.title ? [proposed.value.title] : []) : before
  return lcsDiff(before, after)
})

async function resolve(accept: boolean) {
  if (!props.item) return
  busy.value = true
  try {
    const r = await resolveDocChange(props.item.request_id, accept)
    toast(accept ? (r.reason ? `fermée — ${r.reason}` : 'proposition acceptée') : 'proposition refusée')
    emit('resolved'); emit('close')
  } catch (e) { toast(humanize(e)) } finally { busy.value = false }
}
</script>

<template>
  <Dialog :open="open" @update:open="(v) => { if (!v) emit('close') }">
    <DialogContent v-if="item" :style="{ maxWidth: '640px' }">
      <DialogTitle>
        {{ item.kind === 'create' ? 'Nouvelle page proposée' : 'Modification proposée' }}
      </DialogTitle>
      <div class="pr-meta">
        <span class="pr-tag mono">{{ item.kind === 'create' ? 'création' : 'modif' }}</span>
        <span>{{ item.proposed_title || item.doc_title }}</span>
        <span class="dim">· {{ item.project_name }}</span>
      </div>
      <p v-if="item.requested_by || item.message" class="pr-by">
        <span class="dim">proposé par {{ item.requested_by || '—' }}</span>
        <span v-if="item.message"> — « {{ item.message }} »</span>
      </p>

      <div class="pr-diff">
        <div v-for="(r, i) in diff" :key="i" class="pr-line" :class="r.t">
          <span class="pr-sign">{{ r.t === 'add' ? '+' : r.t === 'del' ? '−' : ' ' }}</span>{{ r.text }}
        </div>
        <p v-if="!diff.length" class="dim pr-empty">
          {{ item.kind === 'create' ? 'Nouvelle page « ' + (item.proposed_title || '') + ' ».' : 'Aucun changement de contenu détecté.' }}
        </p>
      </div>

      <div class="pr-actions">
        <Btn :disabled="busy" @click="resolve(true)">Accepter</Btn>
        <button class="pr-x" :disabled="busy" @click="resolve(false)">Refuser</button>
        <button class="pr-x" @click="emit('close')">Fermer</button>
      </div>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.pr-meta { display: flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 600; color: var(--color-ink); margin-top: 4px; }
.pr-tag { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: var(--color-cobalt-ink); }
.pr-by { font-size: 12px; color: var(--color-ink-soft); margin: 6px 0 0; }
.pr-diff { margin: 12px 0; max-height: 320px; overflow: auto; border: 1px solid var(--color-hair); border-radius: var(--radius-md); background: var(--color-surface); font-family: var(--font-mono); font-size: 12px; }
.pr-line { display: flex; gap: 6px; padding: 1px 10px; white-space: pre-wrap; word-break: break-word; }
.pr-line.add { background: var(--color-olive-soft); color: var(--color-olive-ink); }
.pr-line.del { background: var(--color-terra-soft); color: var(--color-terra-ink); }
.pr-sign { flex: none; opacity: .6; }
.pr-empty { padding: 14px; }
.pr-actions { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
.pr-x { border: none; background: none; font: inherit; font-size: 13px; color: var(--color-ink-soft); cursor: pointer; }
.pr-x:hover { color: var(--color-ink); }
</style>
