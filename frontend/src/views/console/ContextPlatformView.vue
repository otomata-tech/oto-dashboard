<script setup lang="ts">
// Section « Context » — projection PLATEFORME (ADR 0022). Le TRONC injecté à toutes
// les sessions de tous les users : les blocs d'instructions serveur (posture, boucle
// d'usage, catalogue de namespaces) + les masters de connecteurs. Édition réservée à
// l'opérateur plateforme (l'API l'impose ; l'UI ne fait que masquer). Absorbe à terme
// l'écran /platform/instructions (bascule B5).
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Btn from '@/components/console/Btn.vue'
import AgentReadmeCard from '@/components/console/AgentReadmeCard.vue'
import { useMe, isPlatformOperator } from '@/composables/useMe'
import { getPlatformInstructions, setPlatformInstruction } from '@/api/console'
import type { PlatformInstrBlock } from '@/types/api'
import { humanize } from '@/lib/errors'

const { me } = useMe()
const canEdit = () => isPlatformOperator(me.value)

const blocks = ref<PlatformInstrBlock[]>([])
const error = ref<string | null>(null)
const loaded = ref(false)

// Closures par bloc pour AgentReadmeCard (load re-fetch → corps frais ; save = pose).
const makeLoad = (key: string) => async () => {
  const r = await getPlatformInstructions()
  const b = r.blocks.find((x) => x.key === key)
  return { body_md: b?.body_md ?? '', updated_at: b?.updated_at ?? null }
}
const makeSave = (key: string) => (body: string) => setPlatformInstruction(key, body)

async function load() {
  try { blocks.value = (await getPlatformInstructions()).blocks }
  catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
}
onMounted(load)
</script>

<template>
  <div class="content-inner fadein">
    <header class="ctx-intro">
      <h2 class="ctx-h1">ce que voit l'agent · tronc plateforme</h2>
      <p class="ctx-lead">
        les instructions serveur injectées à <strong>toutes</strong> les sessions de tous les
        utilisateurs, avant tout readme d'org. inviolables par les orgs. + les masters de connecteurs
        qui bornent ce que chaque org peut activer.
      </p>
    </header>

    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>
    <p v-else-if="!loaded" class="helptext">chargement…</p>

    <template v-else>
      <AgentReadmeCard v-for="b in blocks" :key="b.key"
        :title="`instructions serveur · ${b.key}`"
        sub="prose injectée au handshake de toutes les sessions. posture, bootstrap, boucle d'usage. le catalogue de namespaces y est appendé automatiquement."
        :can-edit="canEdit()"
        :load="makeLoad(b.key)" :save="makeSave(b.key)" />

      <ConsoleCard title="masters de connecteurs" flush
        sub="l'interrupteur global par connecteur : ce qui est disponible à toute la plateforme (chaque org active ensuite dans cette limite).">
        <template #actions>
          <RouterLink to="/platform/connectors"><Btn kind="mini">gérer les masters →</Btn></RouterLink>
        </template>
        <p class="helptext">l'activation master + la clé plateforme se gèrent dans le cockpit connecteurs plateforme.</p>
      </ConsoleCard>
    </template>
  </div>
</template>

<style scoped>
.ctx-intro { margin-bottom: 18px; }
.ctx-h1 { font-weight: 700; font-size: 20px; color: var(--color-ink); letter-spacing: -0.01em; }
.ctx-lead { font-size: 13.5px; color: var(--color-mute); line-height: 1.6; margin-top: 6px; max-width: 720px; }
</style>
