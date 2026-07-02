<script setup lang="ts">
// Carte « contexte agent » (otomata-private#49) — transparence : ce que le Claude
// de l'utilisateur reçoit d'oto au handshake, en 3 couches étiquetées par PROVENANCE
// (plateforme-statique / readme cumulés org→équipe→user / dérivé). Lecture seule ;
// l'édition des readme se fait sur /org (org), /org/departments (équipe) et /account
// (user) ; les procédures sur /procedures. Vit comme section de la page Account.
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from './ConsoleCard.vue'
import Tag from './Tag.vue'
import Btn from './Btn.vue'
import { getAgentContext } from '@/api/console'
import type { AgentContext } from '@/types/api'
import { humanize } from '@/lib/errors'

const ctx = ref<AgentContext | null>(null)
const loaded = ref(false)
const error = ref<string | null>(null)
const showInstructions = ref(false)

const doctrine = computed(() => ctx.value?.doctrine ?? null)
const hasBaseDoctrine = computed(() => !!doctrine.value?.doctrine?.trim())
const namedDoctrines = computed(() => doctrine.value?.doctrines ?? [])
const tools = computed(() => ctx.value?.tools ?? null)
// Namespaces où au moins un outil est visible en premier (l'agent les voit).
const nsRows = computed(() =>
  [...(tools.value?.namespaces ?? [])].sort(
    (a, b) => Number(b.visible > 0) - Number(a.visible > 0) || a.namespace.localeCompare(b.namespace),
  ),
)

async function load() {
  try { ctx.value = await getAgentContext() }
  catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
}
onMounted(load)
</script>

<template>
  <ConsoleCard title="agent context" flush
    sub="exactement ce que ton Claude reçoit d'oto à la connexion : instructions de la plateforme, agent readme cumulés, et les outils visibles sous ton org active. lecture seule.">
    <p v-if="error" class="dim" style="font-size: 13px; padding: 0 16px 12px">{{ error }}</p>
    <p v-else-if="!loaded" class="dim" style="font-size: 13px; padding: 0 16px 12px">chargement…</p>

    <template v-else-if="ctx">
      <!-- Couche 1 — instructions serveur (plateforme, statique) -->
      <section class="ctx-layer">
        <header class="ctx-head">
          <div>
            <div class="ctx-title">server instructions</div>
            <div class="ctx-sub">injectées au handshake MCP. posture + bootstrap + boucle d'usage + catalogue de namespaces dérivé du registre.</div>
          </div>
          <Tag tone="cobalt">plateforme · statique</Tag>
        </header>
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px">
          <Btn kind="mini" @click="showInstructions = !showInstructions">
            {{ showInstructions ? 'masquer' : 'voir le texte intégral' }}
          </Btn>
          <span class="dim" style="font-size: 12px">{{ ctx.instructions.length }} caractères</span>
        </div>
        <pre v-if="showInstructions" class="ctx-pre">{{ ctx.instructions }}</pre>
      </section>

      <!-- Couche 2 — agent readme (org/équipe/user, cumulés) + procédures -->
      <section class="ctx-layer">
        <header class="ctx-head">
          <div>
            <div class="ctx-title">agent readme & procédures</div>
            <div class="ctx-sub">les readme cumulés (org → équipe → toi), injectés à chaque session, + les procédures de ton org (chargées à la demande). readme org : /org · readme perso : ci-dessus · procédures : /procedures.</div>
          </div>
          <Tag tone="olive">{{ doctrine?.org || 'aucune org active' }}</Tag>
        </header>
        <div v-if="!doctrine?.org_id" class="dim" style="font-size: 13px">
          aucune org active → ton agent démarre généraliste, sans readme d'org.
        </div>
        <template v-else>
          <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 10px">
            <Tag :tone="hasBaseDoctrine ? 'olive' : undefined">
              readme org · {{ hasBaseDoctrine ? 'défini' : 'vide' }}
            </Tag>
            <Tag tone="cobalt">{{ namedDoctrines.length }} procédure(s)</Tag>
            <Tag v-if="doctrine?.group" tone="saffron">équipe : {{ doctrine.group }}</Tag>
            <RouterLink to="/procedures"><Btn kind="mini">les procédures →</Btn></RouterLink>
          </div>
          <table v-if="namedDoctrines.length" class="tbl">
            <thead><tr><th>slug</th><th>titre</th><th>portée</th></tr></thead>
            <tbody>
              <tr v-for="d in namedDoctrines" :key="d.scope + d.slug">
                <td style="font-weight: 600; color: var(--color-ink)">{{ d.slug }}</td>
                <td>{{ d.title }}</td>
                <td><Tag :tone="d.scope === 'group' ? 'saffron' : 'cobalt'">{{ d.scope }}</Tag></td>
              </tr>
            </tbody>
          </table>
          <p v-else-if="!hasBaseDoctrine" class="dim" style="font-size: 13px">
            rien d'écrit pour l'instant — l'agent ne reçoit que les instructions plateforme + les outils.
          </p>
        </template>
      </section>

      <!-- Couche 3 — outils visibles (dérivé) -->
      <section class="ctx-layer">
        <header class="ctx-head">
          <div>
            <div class="ctx-title">visible tools</div>
            <div class="ctx-sub">les outils que ton agent voit RÉELLEMENT sous ton org active (après activation des connecteurs + tes presets) — ton sous-ensemble effectif du catalogue.</div>
          </div>
          <Tag v-if="tools?.available" tone="olive">
            {{ tools.total_visible }} visibles · {{ tools.total_hidden }} masqués
          </Tag>
        </header>
        <p v-if="!tools?.available" class="dim" style="font-size: 13px">calcul de visibilité indisponible.</p>
        <table v-else class="tbl">
          <thead><tr><th>namespace</th><th style="width: 120px">visibles</th><th style="width: 90px"></th></tr></thead>
          <tbody>
            <tr v-for="n in nsRows" :key="n.namespace">
              <td style="font-weight: 600; color: var(--color-ink)">{{ n.namespace }}_*</td>
              <td>{{ n.visible }} / {{ n.total }}</td>
              <td style="text-align: right">
                <Tag :tone="n.visible > 0 ? 'olive' : undefined">{{ n.visible > 0 ? 'actif' : 'masqué' }}</Tag>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </ConsoleCard>
</template>

<style scoped>
.ctx-layer { padding: 14px 16px; border-top: 1px solid var(--color-hair-soft); }
.ctx-layer:first-child { border-top: 0; }
.ctx-head {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
  margin-bottom: 10px;
}
.ctx-title { font-weight: 600; font-size: 14px; color: var(--color-ink); }
.ctx-sub { font-size: 12px; color: var(--color-mute); line-height: 1.5; margin-top: 2px; }
.ctx-pre {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.5;
  max-height: 420px;
  overflow: auto;
  background: var(--color-paper-3, #f5f1e8);
  border: 1px solid var(--color-hair-soft, #e3dccd);
  border-radius: 8px;
  padding: 12px 14px;
  color: var(--color-ink-soft, #4a463d);
}
</style>
