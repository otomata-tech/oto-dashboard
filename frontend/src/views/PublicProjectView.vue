<script setup lang="ts">
// Viewer PUBLIC d'un projet partagé CHIFFRÉ (ADR 0032 §3) — route /p/p/:token, sans auth.
// Zero-knowledge : le backend ne renvoie qu'un ciphertext ; la clé de déchiffrement
// vit dans le FRAGMENT de l'URL (#…), lu ici côté navigateur et jamais transmis au
// serveur. On déchiffre localement puis on rend le brief + l'arbre de pages (sanitizé).
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { getPublicProjectShare } from '@/api/console'
import { decryptShare } from '@/lib/crypto'
import MarkdownView from '@/components/console/MarkdownView.vue'

interface SnapDoc { id: number; parent_id: number | null; title: string; body_md: string; kind?: string }
interface Snapshot { v: number; name: string; brief_md: string; docs: SnapDoc[]; shared_at?: string }
// Doc + profondeur, pour l'indentation de l'arbre au rendu.
type FlatDoc = SnapDoc & { depth: number }

const route = useRoute()
const project = ref<Snapshot | null>(null)
const flatDocs = ref<FlatDoc[]>([])
const loaded = ref(false)
const error = ref<'notfound' | 'nokey' | 'baddata' | null>(null)

// Aplati l'arbre (parent_id) en liste ordonnée avec profondeur — DFS stable par ordre d'arrivée.
function flatten(docs: SnapDoc[]): FlatDoc[] {
  const byParent = new Map<number | null, SnapDoc[]>()
  for (const d of docs) {
    const k = d.parent_id ?? null
    if (!byParent.has(k)) byParent.set(k, [])
    byParent.get(k)!.push(d)
  }
  const out: FlatDoc[] = []
  const walk = (parent: number | null, depth: number) => {
    for (const d of byParent.get(parent) ?? []) {
      out.push({ ...d, depth })
      walk(d.id, depth + 1)
    }
  }
  walk(null, 0)
  // Filet : des pages orphelines (parent hors snapshot) ne doivent pas disparaître.
  if (out.length < docs.length) {
    const seen = new Set(out.map((d) => d.id))
    for (const d of docs) if (!seen.has(d.id)) out.push({ ...d, depth: 0 })
  }
  return out
}

onMounted(async () => {
  const token = String(route.params.token)
  const keyFragment = route.hash.startsWith('#') ? route.hash.slice(1) : route.hash
  if (!keyFragment) { error.value = 'nokey'; loaded.value = true; return }
  try {
    const { ciphertext } = await getPublicProjectShare(token)
    try {
      const snap = await decryptShare<Snapshot>(ciphertext, keyFragment)
      project.value = snap
      flatDocs.value = flatten(snap.docs ?? [])
    } catch { error.value = 'baddata' }   // clé fausse ou blob altéré (GCM authentifie)
  } catch { error.value = 'notfound' }
  finally { loaded.value = true }
})
</script>

<template>
  <div class="pubprj">
    <main class="pubprj-card">
      <p v-if="!loaded" class="dim">chargement…</p>
      <p v-else-if="error === 'notfound'" class="dim">Projet introuvable ou plus partagé.</p>
      <p v-else-if="error === 'nokey'" class="dim">Lien incomplet : la clé de déchiffrement manque dans l'URL.</p>
      <p v-else-if="error === 'baddata'" class="dim">Impossible de déchiffrer — la clé du lien est invalide.</p>
      <article v-else-if="project">
        <span class="pubprj-eb">projet partagé</span>
        <h1 class="pubprj-title">{{ project.name }}</h1>
        <MarkdownView v-if="project.brief_md" :source="project.brief_md" />

        <section v-for="d in flatDocs" :key="d.id" class="pubprj-doc" :style="{ marginLeft: `${d.depth * 16}px` }">
          <h2 class="pubprj-doc-title">{{ d.title }}</h2>
          <MarkdownView :source="d.body_md" />
        </section>
      </article>
    </main>
    <footer class="pubprj-foot dim">partagé via oto · chiffré de bout en bout</footer>
  </div>
</template>

<style scoped>
.pubprj { min-height: 100vh; background: var(--color-bg, #faf9f7); padding: 32px 16px; }
.pubprj-card { max-width: 820px; margin: 0 auto; background: #fff; border: 1px solid var(--color-hair-soft, #e6e6e3); border-radius: 12px; padding: 32px 36px; }
.pubprj-eb { font-family: var(--font-mono, monospace); font-size: 10px; font-weight: 600; letter-spacing: .16em; text-transform: uppercase; color: var(--color-faint, #9a9a9a); }
.pubprj-title { font-size: 1.9em; margin: .2em 0 .7em; color: var(--color-ink, #2a2a2a); }
.pubprj-doc { margin-top: 26px; padding-top: 18px; border-top: 1px solid var(--color-hair-soft, #e6e6e3); }
.pubprj-doc-title { font-size: 1.35em; margin: 0 0 .4em; color: var(--color-ink, #2a2a2a); }
.pubprj-foot { max-width: 820px; margin: 12px auto 0; text-align: center; font-size: 11px; }
.dim { color: var(--color-faint, #9a9a9a); }
</style>
