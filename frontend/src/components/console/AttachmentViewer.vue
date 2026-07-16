<script setup lang="ts">
// Viewer de document joint — lightbox plein cadre rendue DANS le dashboard (pas
// d'onglet navigateur). Route par type MIME/extension vers un rendu natif ou une
// brique déjà présente :
//   pdf              → <iframe> (viewer PDF natif du navigateur)
//   image/*          → <img>
//   html             → <iframe sandbox> (contenu non fiable isolé)
//   markdown         → MarkdownView (marked + DOMPurify)
//   csv              → table
//   json / text      → <pre>
//   autre / échec    → carte fallback + bouton télécharger (jamais de rendu muet)
// Les URLs viennent présignées S3 (download_url) : <iframe>/<img> ne demandent ni
// auth ni CORS. Les types texte exigent un fetch() du contenu → dépend du CORS du
// bucket ; en cas d'échec on dégrade proprement (état erreur + téléchargement).
import { computed, ref, watch } from 'vue'
import Icon from '@/components/console/Icon.vue'
import MarkdownView from '@/components/console/MarkdownView.vue'
import type { ProjectFile } from '@/types/api'

const props = defineProps<{ file: ProjectFile | null }>()
const emit = defineEmits<{ (e: 'close'): void }>()

type Kind = 'pdf' | 'image' | 'html' | 'markdown' | 'csv' | 'json' | 'text' | 'other'

const src = computed(() => props.file?.download_url || props.file?.public_url || null)

function kindOf(f: ProjectFile): Kind {
  const mime = (f.mime || '').toLowerCase()
  const name = (f.filename || '').toLowerCase()
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : ''
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp'].includes(ext)) return 'image'
  if (mime === 'text/html' || ['html', 'htm'].includes(ext)) return 'html'
  if (mime === 'text/markdown' || ['md', 'markdown'].includes(ext)) return 'markdown'
  if (mime === 'text/csv' || ext === 'csv') return 'csv'
  if (mime === 'application/json' || ext === 'json') return 'json'
  if (mime.startsWith('text/') || ['txt', 'log'].includes(ext)) return 'text'
  return 'other'
}

const kind = computed<Kind>(() => (props.file ? kindOf(props.file) : 'other'))
const needsFetch = computed(() => ['markdown', 'csv', 'json', 'text'].includes(kind.value))

// Contenu texte récupéré à la demande (uniquement pour les types textuels).
const text = ref<string | null>(null)
const loading = ref(false)
const fetchError = ref(false)

watch(
  () => props.file?.id,
  async () => {
    text.value = null
    fetchError.value = false
    if (!props.file || !needsFetch.value || !src.value) return
    loading.value = true
    try {
      const res = await fetch(src.value)
      if (!res.ok) throw new Error(String(res.status))
      text.value = await res.text()
    } catch {
      fetchError.value = true   // CORS bucket / réseau — dégradation explicite
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

// Parse CSV minimal (guillemets + séparateur ,) pour un aperçu tabulaire.
const csv = computed<{ head: string[]; rows: string[][] } | null>(() => {
  if (kind.value !== 'csv' || text.value == null) return null
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const s = text.value
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  const clean = rows.filter((r) => r.some((v) => v !== ''))
  const head = clean[0]
  if (!head) return null
  return { head, rows: clean.slice(1, 501) }   // borne l'aperçu
})

const prettyJson = computed(() => {
  if (kind.value !== 'json' || text.value == null) return ''
  try { return JSON.stringify(JSON.parse(text.value), null, 2) }
  catch { return text.value }   // JSON invalide → brut
})

const title = computed(() => props.file?.title || props.file?.filename || '')

function onKey(e: KeyboardEvent) { if (e.key === 'Escape') emit('close') }
</script>

<template>
  <div v-if="file" class="av-scrim" @click.self="emit('close')" @keydown="onKey" tabindex="-1">
    <div class="av-panel" role="dialog" aria-modal="true">
      <header class="av-head">
        <Icon :name="kind === 'image' ? 'image' : 'file-text'" :size="17" class="av-head__ic" />
        <div class="av-head__id">
          <div class="av-head__title">{{ title }}</div>
          <div v-if="file.description" class="av-head__desc">{{ file.description }}</div>
        </div>
        <div class="av-head__act">
          <a v-if="src" :href="src" target="_blank" rel="noopener" class="av-iconbtn" title="Ouvrir dans un onglet">
            <Icon name="external-link" :size="16" />
          </a>
          <a v-if="src" :href="src" :download="file.filename" class="av-iconbtn" title="Télécharger">
            <Icon name="download" :size="16" />
          </a>
          <button class="av-iconbtn" title="Fermer" @click="emit('close')">
            <Icon name="x" :size="17" />
          </button>
        </div>
      </header>

      <div class="av-body" :class="{ 'av-body--pad': kind !== 'pdf' && kind !== 'image' }">
        <!-- pdf : viewer natif -->
        <iframe v-if="kind === 'pdf' && src" :src="src" class="av-frame" title="Aperçu PDF"></iframe>

        <!-- image -->
        <div v-else-if="kind === 'image' && src" class="av-imgwrap">
          <img :src="src" :alt="title" class="av-img" />
        </div>

        <!-- html : isolé -->
        <iframe v-else-if="kind === 'html' && src" :src="src" class="av-frame"
          sandbox="allow-same-origin" title="Aperçu HTML"></iframe>

        <!-- états de récupération pour les types texte -->
        <p v-else-if="loading" class="av-note">chargement de l'aperçu…</p>
        <div v-else-if="fetchError" class="av-fallback">
          <Icon name="triangle-alert" :size="28" class="av-fallback__ic" />
          <p class="av-fallback__t">aperçu indisponible</p>
          <p class="av-fallback__d">impossible de charger le contenu ici — ouvre ou télécharge le fichier.</p>
          <a v-if="src" :href="src" target="_blank" rel="noopener" class="btn ghost av-fallback__btn">
            <Icon name="external-link" :size="15" /> ouvrir
          </a>
        </div>

        <!-- markdown -->
        <MarkdownView v-else-if="kind === 'markdown' && text != null" :source="text" />

        <!-- csv -->
        <div v-else-if="kind === 'csv'" class="av-tablewrap">
          <table v-if="csv" class="av-table">
            <thead><tr><th v-for="(h, i) in csv.head" :key="i">{{ h }}</th></tr></thead>
            <tbody>
              <tr v-for="(r, ri) in csv.rows" :key="ri">
                <td v-for="(c, ci) in r" :key="ci">{{ c }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else class="av-note">csv vide.</p>
        </div>

        <!-- json / texte -->
        <pre v-else-if="kind === 'json'" class="av-pre">{{ prettyJson }}</pre>
        <pre v-else-if="kind === 'text' && text != null" class="av-pre">{{ text }}</pre>

        <!-- format non rendable -->
        <div v-else class="av-fallback">
          <Icon name="file-text" :size="28" class="av-fallback__ic" />
          <p class="av-fallback__t">aperçu non disponible pour ce format</p>
          <p class="av-fallback__d">{{ file.mime || file.filename }}</p>
          <a v-if="src" :href="src" :download="file.filename" class="btn ghost av-fallback__btn">
            <Icon name="download" :size="15" /> télécharger
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.av-scrim {
  position: fixed; inset: 0; z-index: var(--z-modal);
  display: flex; align-items: center; justify-content: center;
  padding: 24px; background: rgba(44, 33, 18, 0.44);
  animation: av-in 160ms var(--ease-out);
}
@keyframes av-in { from { opacity: 0; } to { opacity: 1; } }
.av-panel {
  display: flex; flex-direction: column;
  width: min(1080px, 94vw); height: min(88vh, 900px);
  background: var(--color-surface); border: 1px solid var(--color-hair);
  border-radius: var(--radius-md); box-shadow: var(--shadow-card); overflow: hidden;
}
.av-head {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 13px 16px; border-bottom: 1px solid var(--color-hair-soft); flex: none;
}
.av-head__ic { color: var(--color-mute); margin-top: 1px; flex: none; }
.av-head__id { flex: 1; min-width: 0; }
.av-head__title {
  font-size: 14px; font-weight: 600; color: var(--color-ink);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.av-head__desc { font-size: 11.5px; color: var(--color-mute); margin-top: 2px; }
.av-head__act { display: flex; align-items: center; gap: 4px; flex: none; }
.av-iconbtn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border: 0; background: none; border-radius: var(--radius-md);
  color: var(--color-ink-soft); cursor: pointer; transition: background var(--t-fast);
}
.av-iconbtn:hover { background: var(--color-hair-soft); color: var(--color-ink); }

.av-body { flex: 1; min-height: 0; overflow: auto; background: var(--color-paper-2); }
.av-body--pad { padding: 18px 20px; background: var(--color-surface); }
.av-frame { width: 100%; height: 100%; border: 0; display: block; }
.av-imgwrap { min-height: 100%; display: flex; align-items: center; justify-content: center; padding: 18px; }
.av-img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: var(--radius-md); }

.av-note { font-size: 12.5px; color: var(--color-mute); padding: 6px 0; }
.av-pre {
  margin: 0; font-family: var(--font-mono); font-size: 12px; line-height: 1.55;
  color: var(--color-ink); white-space: pre-wrap; word-break: break-word;
}
.av-tablewrap { overflow: auto; }
.av-table { border-collapse: collapse; font-size: 12.5px; }
.av-table th, .av-table td {
  border: 1px solid var(--color-hair-soft); padding: 5px 10px;
  text-align: left; white-space: nowrap; color: var(--color-ink);
}
.av-table th { background: var(--color-paper-3); font-weight: 600; position: sticky; top: 0; }

.av-fallback { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px; padding: 48px 20px; }
.av-fallback__ic { color: var(--color-mute); }
.av-fallback__t { font-size: 14px; font-weight: 600; color: var(--color-ink); }
.av-fallback__d { font-size: 12px; color: var(--color-mute); word-break: break-word; }
.av-fallback__btn { margin-top: 10px; }
</style>
