<script setup lang="ts">
// Fiche DÉTAIL d'un outil (ouverte depuis la fiche connecteur) : description complète +
// paramètres (dérivés du JSON Schema FastMCP). Le banc « ▶ Exécuter » a quitté le dashboard
// (oto#192, 12/09/2026 : aucune exécution depuis un dashboard en 45 jours) — un outil
// s'essaie par l'agent.
import { computed, ref, watch } from 'vue'
import {
  Dialog, DialogScrollContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { getToolDetail } from '@/api/console'
import type { ToolDetail, ToolParamSchema } from '@/types/api'

const props = defineProps<{ name: string | null }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const open = computed(() => props.name != null)

const detail = ref<ToolDetail | null>(null)
const loading = ref(false)
const loadErr = ref('')

interface Param { name: string; schema: ToolParamSchema; required: boolean; kind: string }

// Type effectif d'un paramètre (un Optional[str] arrive en anyOf string|null).
function paramKind(p: ToolParamSchema): string {
  if (p.enum && p.enum.length) return 'enum'
  let t = p.type
  if (!t && p.anyOf) t = p.anyOf.find((x) => x.type && x.type !== 'null')?.type
  if (t === 'array') return 'array'
  if (t === 'boolean') return 'boolean'
  if (t === 'integer' || t === 'number') return 'number'
  return 'string'
}

const params = computed<Param[]>(() => {
  const properties = detail.value?.input_schema?.properties ?? {}
  const req = new Set(detail.value?.input_schema?.required ?? [])
  return Object.entries(properties).map(([name, schema]) => ({
    name, schema, required: req.has(name), kind: paramKind(schema),
  }))
})

watch(() => props.name, async (name) => {
  detail.value = null; loadErr.value = ''
  if (!name) return
  loading.value = true
  try {
    detail.value = await getToolDetail(name)
  } catch (e) {
    loadErr.value = (e as Error).message || 'chargement impossible'
  } finally {
    loading.value = false
  }
}, { immediate: true })

function onOpenChange(v: boolean) { if (!v) emit('close') }
</script>

<template>
  <Dialog :open="open" @update:open="onOpenChange">
    <DialogScrollContent class="tld-content">
      <DialogHeader>
        <DialogTitle>
          <code class="mono tld-name">{{ name }}</code>
        </DialogTitle>
        <DialogDescription v-if="detail?.connector">
          {{ detail.connector.label }}
          <span class="dim"> · {{ detail.source === 'federated' ? 'MCP fédéré' : 'natif' }}</span>
        </DialogDescription>
      </DialogHeader>

      <p v-if="loading" class="tld-note">{{ $t('common.loading') }}</p>
      <p v-else-if="loadErr" class="tld-err">{{ loadErr }}</p>

      <div v-else-if="detail" class="tld-body">
        <!-- ce que fait l'outil (docstring complète = contrat LLM) -->
        <p v-if="detail.description" class="tld-desc">{{ detail.description }}</p>
        <p v-else class="tld-note">pas de description.</p>

        <!-- paramètres -->
        <section v-if="params.length" class="tld-panel">
          <h4>paramètres</h4>
          <div class="tld-fields">
            <div v-for="p in params" :key="p.name" class="tld-field">
              <span class="tld-field-head">
                <code class="mono tld-field-name">{{ p.name }}</code>
                <span class="tld-field-type">{{ p.kind }}</span>
                <span v-if="p.required" class="tld-req">requis</span>
              </span>
              <span v-if="p.schema.description" class="tld-field-help">{{ p.schema.description }}</span>
            </div>
          </div>
        </section>
        <p v-else class="tld-note">aucun paramètre.</p>
      </div>
    </DialogScrollContent>
  </Dialog>
</template>

<style scoped>
.tld-content { max-width: 620px; }
.tld-name { font-size: 14px; color: var(--color-ink); }
.tld-note { font-size: 11.5px; color: var(--color-mute); margin: 6px 0 0; }
.tld-err { font-size: 12px; color: var(--color-terra-ink); margin: 6px 0 0; }

.tld-body { display: flex; flex-direction: column; gap: 14px; margin-top: 6px; }
.tld-desc { font-size: 12.5px; line-height: 1.6; color: var(--color-ink-soft); margin: 0; white-space: pre-wrap; }

.tld-panel { border: 1px solid var(--color-hair-soft); border-radius: 10px; padding: 12px 14px; background: var(--color-surface); }
.tld-panel h4 { margin: 0 0 8px; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--color-faint); }

.tld-fields { display: flex; flex-direction: column; gap: 12px; }
.tld-field { display: flex; flex-direction: column; gap: 4px; }
.tld-field-head { display: flex; align-items: baseline; gap: 8px; }
.tld-field-name { font-size: 12px; color: var(--color-ink); }
.tld-field-type { font-family: var(--font-mono); font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-mute); }
.tld-req { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-terra-ink); }
.tld-field-help { font-size: 11.5px; color: var(--color-mute); line-height: 1.4; }
</style>
