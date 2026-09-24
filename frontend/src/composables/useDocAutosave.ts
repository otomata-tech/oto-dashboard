// Édition EN PLACE d'une page, enregistrée toute seule (24/09/2026, repris du front de JB).
//
// La page s'affiche rendue ; un clic dans le texte l'ouvre à l'écriture, sans bouton
// « éditer » ni « enregistrer ». Ce composable tient le brouillon et l'écrit :
//  - après une pause de frappe (`IDLE_MS`), et tout de suite quand on quitte l'écriture ;
//  - avec `expected_rev` : si la page a changé ailleurs, le serveur refuse (409 `conflict`)
//    et on NE réécrit PAS par-dessus — l'écran le dit, et propose de recharger ;
//  - jamais plus d'une écriture à la fois ; une frappe pendant l'envoi repart après.
//
// ⚠️ Pourquoi 4 s et pas 1 s comme chez JB : chaque écriture crée une VERSION dans
// l'historique, réindexe la page et recalcule ses rétroliens (oto-backend `update_doc`).
// Tant que le backend ne regroupe pas les versions d'un même auteur (oto#274), écrire à
// chaque seconde noierait l'historique.
import { computed, ref, shallowRef, watch, type Ref } from 'vue'
import { getDoc, updateDoc } from '@/api/console'
import { ApiError } from '@/api'
import { humanize } from '@/lib/errors'
import type { Doc, DocKind } from '@/types/api'

export const IDLE_MS = 4000

export interface DocDraft { title: string; body_md: string; kind: DocKind; description: string }
export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'conflict'

const fromDoc = (d: Doc): DocDraft =>
  ({ title: d.title, body_md: d.body_md, kind: d.kind, description: d.description ?? '' })
const same = (a: DocDraft, b: DocDraft) =>
  a.title === b.title && a.body_md === b.body_md && a.kind === b.kind && a.description === b.description

export function useDocAutosave(doc: Ref<Doc | null>, onSaved: () => void) {
  const editing = ref(false)
  const draft = ref<DocDraft | null>(null)
  const status = ref<SaveStatus>('idle')
  const error = ref<string | null>(null)
  // Dernier état connu écrit au serveur. RÉACTIF : `dirty` en dépend — une variable nue
  // laissait `dirty` figé à vrai après un enregistrement réussi.
  const baseline = shallowRef<DocDraft | null>(null)
  let rev: string | null = null
  let docId: number | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let inflight: Promise<void> | null = null

  const dirty = computed(() => !!draft.value && !!baseline.value && !same(draft.value, baseline.value))

  function clearTimer() { if (timer) { clearTimeout(timer); timer = null } }

  // La révision courante : lue au serveur au premier besoin (la liste des pages ne la porte
  // pas), puis tenue par le reçu de chaque écriture.
  async function ensureRev(id: number) {
    if (rev != null && docId === id) return
    const fresh = await getDoc(id) as Doc & { rev?: string }
    rev = fresh.rev ?? null
    docId = id
  }

  async function write(): Promise<void> {
    const id = doc.value?.id
    if (id == null || !draft.value || !baseline.value || status.value === 'conflict') return
    if (same(draft.value, baseline.value)) { status.value = 'saved'; return }
    const sent = { ...draft.value }
    status.value = 'saving'
    try {
      await ensureRev(id)
      const res = await updateDoc(id, { ...sent, expected_rev: rev ?? undefined }) as Doc & { rev?: string }
      rev = res.rev ?? null
      baseline.value = sent
      error.value = null
      status.value = draft.value && !same(draft.value, sent) ? 'pending' : 'saved'
      onSaved()
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) { status.value = 'conflict'; clearTimer(); return }
      status.value = 'error'
      error.value = humanize(e)
    }
  }

  // Écrire maintenant (et attendre) : une écriture en vol est attendue, puis on repart si
  // la frappe a continué pendant l'envoi.
  async function flush(): Promise<void> {
    clearTimer()
    while (inflight) await inflight
    if (!dirty.value) return
    inflight = write().finally(() => { inflight = null })
    await inflight
  }

  watch(draft, () => {
    if (!editing.value || !dirty.value || status.value === 'conflict') return
    status.value = 'pending'
    clearTimer()
    timer = setTimeout(() => { void flush() }, IDLE_MS)
  }, { deep: true })

  function start() {
    const d = doc.value
    if (!d || editing.value) return
    baseline.value = fromDoc(d)
    draft.value = fromDoc(d)
    status.value = 'idle'
    editing.value = true
  }

  // Quitter l'écriture : on écrit d'abord ; en cas d'échec ou de conflit, on RESTE en
  // écriture — le texte tapé est à l'écran, pas perdu.
  async function stop() {
    await flush()
    if (status.value === 'error' || status.value === 'conflict' || dirty.value) return
    editing.value = false
  }

  // Un seul champ changé hors écriture du corps (le titre depuis l'en-tête).
  async function saveTitle(title: string) {
    const d = doc.value
    const t = title.trim()
    if (!d || !t || t === (draft.value?.title ?? d.title)) return
    if (!editing.value) { baseline.value = fromDoc(d); draft.value = fromDoc(d) }
    draft.value!.title = t
    await flush()
  }

  // Autre page sélectionnée, ou page rechargée après un conflit : on repart de l'état servi.
  function reset() {
    clearTimer()
    editing.value = false
    draft.value = null
    baseline.value = null
    rev = null
    docId = null
    status.value = 'idle'
    error.value = null
  }

  return { editing, draft, status, error, dirty, start, stop, flush, saveTitle, reset }
}
