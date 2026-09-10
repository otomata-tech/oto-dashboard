<script setup lang="ts">
// « Documents » n'est PLUS une entité distincte (oto-dashboard#37) : les documents
// de l'org vivent dans un PROJET d'org ordinaire, et ses pages SONT des documents —
// même substrat, même UI wiki que n'importe quel projet. Cet écran ne fait donc que
// RÉSOUDRE ce projet (ancré par id côté serveur, `/api/me/kb` — nom d'API hérité) et
// rediriger vers sa page projet ; il ne re-rend plus un second navigateur de pages.
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getKbProject } from '@/api/console'
import { humanize } from '@/lib/errors'

const router = useRouter()
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    const kb = await getKbProject()
    router.replace(`/projects/${kb.project_id}`)
  } catch (e) { error.value = humanize(e) }
})
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="dim" style="font-size: 12px; padding: 8px; color: var(--color-terra-ink)">{{ error }}</p>
    <p v-else class="dim" style="font-size: 12px; padding: 8px">ouverture des documents de ton org…</p>
  </div>
</template>
