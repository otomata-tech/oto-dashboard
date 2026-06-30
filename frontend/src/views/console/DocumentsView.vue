<script setup lang="ts">
// Zone DOCUMENTS (réunion 30/06 : la base de connaissance fusionne avec Document,
// remplace Memento). Une seule base par org = LE projet « Base de connaissance »
// (résolu/créé par oto_kb). On réutilise tout le substrat docs via ProjectDocs :
// arbre de pages, versions, partage public, demande de modif.
import { onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import ProjectDocs from '@/components/console/ProjectDocs.vue'
import { getKbProject, getProject } from '@/api/console'
import { humanize } from '@/lib/errors'

const projectId = ref<number | null>(null)
const readOnly = ref(false)
const loaded = ref(false)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    const kb = await getKbProject()
    projectId.value = kb.project_id
    const p = await getProject(kb.project_id)
    readOnly.value = p.can_write === false
  } catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
})
</script>

<template>
  <div class="content-inner fadein">
    <ConsoleCard title="documents"
      sub="la base de connaissance de l'organisation — pages de référence partagées.">
      <p v-if="!loaded" class="dim" style="font-size: 12px; padding: 8px">chargement…</p>
      <p v-else-if="error" class="dim" style="font-size: 12px; padding: 8px; color: var(--color-terra-ink)">{{ error }}</p>
      <ProjectDocs v-else-if="projectId" :project-id="projectId" :read-only="readOnly" />
    </ConsoleCard>
  </div>
</template>
