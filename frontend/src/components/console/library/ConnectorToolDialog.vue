<script setup lang="ts">
// Fiche DÉTAIL d'un outil + banc de TEST (ouvert depuis la fiche connecteur).
// « En savoir plus » : description complète + paramètres (dérivés du JSON Schema
// FastMCP) + ce que ça retourne. Si l'outil est TESTABLE (open-data lecture seule,
// FOD & co — backend `is_testable`), un formulaire généré depuis le schéma permet
// de l'exécuter sous sa propre identité et d'en voir le résultat brut. Les outils
// à effet de bord (email, écriture, messagerie) affichent le détail sans bouton.
import { computed, ref, watch } from 'vue'
import {
  Dialog, DialogScrollContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import Btn from '@/components/console/Btn.vue'
import OtoSelect from '@/components/console/OtoSelect.vue'
import { callTool, getToolDetail } from '@/api/console'
import type { ToolCallResult, ToolDetail, ToolParamSchema } from '@/types/api'

const props = defineProps<{ name: string | null }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const open = computed(() => props.name != null)

const detail = ref<ToolDetail | null>(null)
const loading = ref(false)
const loadErr = ref('')
const form = ref<Record<string, string>>({})
const TOOL_BOOL_OPTS = [{ value: 'true', label: 'true' }, { value: 'false', label: 'false' }]
const running = ref(false)
const result = ref<ToolCallResult | null>(null)
const runErr = ref('')

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
  detail.value = null; result.value = null; runErr.value = ''; loadErr.value = ''; form.value = {}
  if (!name) return
  loading.value = true
  try {
    detail.value = await getToolDetail(name)
    const blank: Record<string, string> = {}
    for (const p of params.value) {
      const d = p.schema.default
      blank[p.name] = (d != null && d !== false) ? String(d) : ''
    }
    form.value = blank
  } catch (e) {
    loadErr.value = (e as Error).message || 'chargement impossible'
  } finally {
    loading.value = false
  }
}, { immediate: true })

// Convertit la saisie (string) vers le type JSON attendu ; '' = omis (→ défaut backend).
function coerce(p: Param, v: string): unknown {
  const s = v.trim()
  if (s === '') return undefined
  if (p.kind === 'number') { const n = Number(s); return Number.isNaN(n) ? s : n }
  if (p.kind === 'boolean') return s === 'true'
  if (p.kind === 'array') return s.split(',').map((x) => x.trim()).filter(Boolean)
  return v
}

async function run() {
  if (!detail.value) return
  running.value = true; runErr.value = ''; result.value = null
  const args: Record<string, unknown> = {}
  for (const p of params.value) {
    const c = coerce(p, form.value[p.name] ?? '')
    if (c !== undefined) args[p.name] = c
  }
  try {
    result.value = await callTool(detail.value.name, args)
  } catch (e) {
    runErr.value = (e as Error).message || 'échec du test'
  } finally {
    running.value = false
  }
}

const resultJson = computed(() => {
  const r = result.value
  if (!r) return ''
  return JSON.stringify(r.ok ? (r.result ?? null) : (r.error ?? null), null, 2)
})

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

      <p v-if="loading" class="tld-note">chargement…</p>
      <p v-else-if="loadErr" class="tld-err">{{ loadErr }}</p>

      <div v-else-if="detail" class="tld-body">
        <!-- ce que fait l'outil (docstring complète = contrat LLM) -->
        <p v-if="detail.description" class="tld-desc">{{ detail.description }}</p>
        <p v-else class="tld-note">pas de description.</p>

        <!-- paramètres -->
        <section v-if="params.length" class="tld-panel">
          <h4>paramètres</h4>
          <div class="tld-fields">
            <label v-for="p in params" :key="p.name" class="tld-field">
              <span class="tld-field-head">
                <code class="mono tld-field-name">{{ p.name }}</code>
                <span class="tld-field-type">{{ p.kind }}</span>
                <span v-if="p.required" class="tld-req">requis</span>
              </span>
              <span v-if="p.schema.description" class="tld-field-help">{{ p.schema.description }}</span>

              <OtoSelect v-if="p.kind === 'enum'" :model-value="form[p.name] ?? ''"
                @update:model-value="(v: string) => (form[p.name] = v)"
                :options="(p.schema.enum ?? []).map((opt) => ({ value: String(opt), label: String(opt) }))"
                none-label="— (défaut)" trigger-class="w-full" />
              <OtoSelect v-else-if="p.kind === 'boolean'" :model-value="form[p.name] ?? ''"
                @update:model-value="(v: string) => (form[p.name] = v)" :options="TOOL_BOOL_OPTS"
                none-label="— (défaut)" trigger-class="w-full" />
              <input v-else-if="p.kind === 'number'" v-model="form[p.name]" type="number" class="inp"
                :placeholder="p.schema.default != null ? String(p.schema.default) : ''" />
              <input v-else v-model="form[p.name]" type="text" class="inp"
                :placeholder="p.kind === 'array' ? 'valeurs séparées par des virgules' : ''" />
            </label>
          </div>
        </section>
        <p v-else class="tld-note">aucun paramètre.</p>

        <!-- banc de test -->
        <section class="tld-panel tld-test">
          <div class="tld-test-head">
            <h4>tester</h4>
            <Btn v-if="detail.testable" kind="mini" :disabled="running" @click="run">
              {{ running ? '…' : '▶ Exécuter' }}
            </Btn>
          </div>
          <p v-if="!detail.testable" class="tld-note">
            cet outil n'est pas testable depuis le dashboard (hors open-data lecture
            seule, ou à effet de bord). Utilise-le via l'agent.
          </p>
          <p v-else class="tld-note">
            exécution réelle sous ton identité — open-data en lecture seule, sans effet de bord.
          </p>

          <p v-if="runErr" class="tld-err">{{ runErr }}</p>

          <div v-if="result" class="tld-result">
            <div class="tld-result-head">
              <span :class="result.ok ? 'tld-ok' : 'tld-ko'">{{ result.ok ? 'ok' : 'erreur' }}</span>
              <span v-if="result.elapsed_ms != null" class="dim">{{ result.elapsed_ms }} ms</span>
            </div>
            <pre class="tld-json">{{ resultJson }}</pre>
          </div>
        </section>
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

.tld-test-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 6px; }
.tld-test-head h4 { margin: 0; }

.tld-result { margin-top: 10px; }
.tld-result-head { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; font-size: 11px; }
.tld-ok { font-weight: 700; color: var(--color-olive); text-transform: uppercase; letter-spacing: 0.05em; }
.tld-ko { font-weight: 700; color: var(--color-terra-ink); text-transform: uppercase; letter-spacing: 0.05em; }
.tld-json {
  margin: 0; font-family: var(--font-mono); font-size: 11px; line-height: 1.5;
  color: var(--color-ink-soft); background: var(--color-bg); border: 1px solid var(--color-hair-soft);
  border-radius: 8px; padding: 10px 12px; max-height: 320px; overflow: auto; white-space: pre-wrap; word-break: break-word;
}
</style>
