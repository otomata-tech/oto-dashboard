<script setup lang="ts">
// Viewer PUBLIC d'un document partagé (#4a) — route /p/d/:token, sans auth.
// Récupère le doc par token (endpoint public) et rend le markdown (sanitizé).
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { apiPublic } from '@/api'
import MarkdownView from '@/components/console/MarkdownView.vue'

const route = useRoute()
const doc = ref<{ title: string; body_md: string; updated_at?: string | null } | null>(null)
const loaded = ref(false)
const error = ref(false)

onMounted(async () => {
  try {
    doc.value = await apiPublic(`/api/public/docs/${encodeURIComponent(String(route.params.token))}`)
  } catch { error.value = true }
  finally { loaded.value = true }
})
</script>

<template>
  <div class="pubdoc">
    <main class="pubdoc-card">
      <p v-if="!loaded" class="dim">chargement…</p>
      <p v-else-if="error" class="dim">Document introuvable ou plus partagé.</p>
      <article v-else-if="doc">
        <h1 class="pubdoc-title">{{ doc.title }}</h1>
        <MarkdownView :source="doc.body_md" />
      </article>
    </main>
    <footer class="pubdoc-foot dim">partagé via oto</footer>
  </div>
</template>

<style scoped>
.pubdoc { min-height: 100vh; background: var(--color-bg, #faf9f7); padding: 32px 16px; }
.pubdoc-card { max-width: 760px; margin: 0 auto; background: #fff; border: 1px solid var(--color-hair-soft, #e6e6e3); border-radius: 12px; padding: 32px 36px; }
.pubdoc-title { font-size: 1.8em; margin: 0 0 .6em; color: var(--color-ink, #2a2a2a); }
.pubdoc-foot { max-width: 760px; margin: 12px auto 0; text-align: center; font-size: 11px; }
.dim { color: var(--color-faint, #9a9a9a); }
</style>
