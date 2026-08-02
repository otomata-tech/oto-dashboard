<script setup lang="ts">
// Fiche d'UN appel d'outil, dépliée sous sa ligne du journal (drill-down).
// Répond aux questions qu'on se pose devant une erreur : sous quelle identité et
// quelle org l'appel a-t-il été émis, depuis quelle surface cliente, dans quel
// déroulé/conversation, avec quels arguments — et où est le traceback.
//
// Les `args` sont TRONQUÉS à l'écriture par le backend (garantie calllog) : ce
// panneau n'expose jamais un payload intégral. Les axes de corrélation sont
// cliquables → ils rechargent le journal filtré (emit `filter`).
import { computed } from 'vue'
import Tag from '@/components/console/Tag.vue'
import { sentryEventUrl } from '@/lib/sentry'
import { fmtMs } from '@/lib/monitoring'
import { fmtDateTime } from '@/types/api'
import type { ToolCallDetail } from '@/types/api'

const props = defineProps<{ call: ToolCallDetail | null; loading?: boolean }>()
const emit = defineEmits<{
  (e: 'filter', axis: 'run_id' | 'session_id' | 'sub' | 'tool', value: string): void
}>()

const sentryHref = computed(() =>
  props.call?.sentry_event_id ? sentryEventUrl(props.call.sentry_event_id) : null)

const argsText = computed(() => {
  const a = props.call?.args
  if (!a || !Object.keys(a).length) return null
  return JSON.stringify(a, null, 2)
})

const caller = computed(() => {
  const c = props.call
  return c ? (c.email || c.name || c.sub || 'anonyme') : ''
})
</script>

<template>
  <div class="cd">
    <div v-if="loading" class="sk" style="height: 64px" />

    <template v-else-if="call">
      <!-- Bandeau : ce qui s'est passé -->
      <div class="cd-head">
        <code class="mono cd-tool">{{ call.tool }}</code>
        <Tag :tone="call.ok ? 'olive' : 'terra'">{{ call.ok ? 'ok' : 'erreur' }}</Tag>
        <span class="dim">{{ fmtMs(call.duration_ms) }}</span>
        <span class="dim">{{ fmtDateTime(call.created_at) }}</span>
      </div>

      <!-- Erreur : le message complet, non tronqué à l'affichage -->
      <div v-if="call.error" class="cd-err">{{ call.error }}</div>

      <!-- Corrélation : cliquer un axe refiltre le journal dessus -->
      <dl class="cd-meta">
        <div>
          <dt>appelant</dt>
          <dd>
            <button v-if="call.sub" type="button" class="linklike"
              @click="emit('filter', 'sub', call.sub)">{{ caller }}</button>
            <span v-else class="dim">anonyme</span>
          </dd>
        </div>
        <div>
          <dt>org de l’appel</dt>
          <dd>
            <span v-if="call.org_id">{{ call.org_name || `#${call.org_id}` }}</span>
            <span v-else class="dim">hors org</span>
          </dd>
        </div>
        <div>
          <dt>surface cliente</dt>
          <dd><span v-if="call.client_id" class="mono">{{ call.client_id }}</span><span v-else class="dim">—</span></dd>
        </div>
        <div>
          <dt>déroulé</dt>
          <dd>
            <button v-if="call.run_id" type="button" class="linklike mono"
              @click="emit('filter', 'run_id', call.run_id)">{{ call.run_id }}</button>
            <span v-else class="dim">hors run</span>
          </dd>
        </div>
        <div>
          <dt>conversation</dt>
          <dd>
            <button v-if="call.session_id" type="button" class="linklike mono"
              @click="emit('filter', 'session_id', call.session_id)">{{ call.session_id }}</button>
            <span v-else class="dim">—</span>
          </dd>
        </div>
        <div>
          <dt>traceback</dt>
          <dd>
            <a v-if="sentryHref" class="linklike" :href="sentryHref" target="_blank" rel="noopener">
              voir dans Sentry
            </a>
            <code v-else-if="call.sentry_event_id" class="mono">{{ call.sentry_event_id }}</code>
            <span v-else class="dim">aucun — pas une erreur de code</span>
          </dd>
        </div>
      </dl>

      <!-- Arguments tels que journalisés (tronqués à l'écriture) -->
      <div v-if="argsText" class="cd-args">
        <div class="eyebrow">arguments (tronqués à la journalisation)</div>
        <pre class="mono">{{ argsText }}</pre>
      </div>
    </template>

    <p v-else class="dim" style="margin: 0">fiche indisponible.</p>
  </div>
</template>

<style scoped>
.cd {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.cd-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 12.5px;
}
.cd-tool { font-weight: 600; }
.cd-err {
  background: var(--color-terra-soft);
  color: var(--color-terra-ink);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  font-size: 12.5px;
  white-space: pre-wrap;
  word-break: break-word;
}
.cd-meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 10px 20px;
  margin: 0;
}
.cd-meta dt {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: .04em;
  color: var(--color-faint);
  margin-bottom: 2px;
}
.cd-meta dd {
  margin: 0;
  font-size: 12.5px;
  word-break: break-all;
}
.cd-args pre {
  margin: 4px 0 0;
  padding: 10px 12px;
  background: var(--color-paper-3);
  border-radius: var(--radius-md);
  font-size: 11.5px;
  max-height: 220px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
