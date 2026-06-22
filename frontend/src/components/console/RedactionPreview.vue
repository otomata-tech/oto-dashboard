<script setup lang="ts">
// Dry-run de la rédaction (ADR 0015) : colle une VRAIE réponse de l'outil, on la passe
// dans le filtre côté serveur et on montre ce qui est masqué/retiré (clés imbriquées
// incluses) — pour voir le « behind the scene » au lieu de deviner. Remonte aussi les
// vraies clés feuilles observées (`observed`) pour que l'éditeur reflète la donnée réelle.
import { computed, ref } from 'vue'
import Btn from './Btn.vue'
import Tag from './Tag.vue'
import { previewOrgFieldFilter } from '@/api/console'
import { humanize } from '@/lib/errors'
import type { FieldRule } from '@/types/api'

const props = defineProps<{ orgId: number | null; service: string; rules?: FieldRule[] }>()
const emit = defineEmits<{ (e: 'observed', leafKeys: string[]): void }>()

const sample = ref('')
const busy = ref(false)
const error = ref('')
const changes = ref<{ path: string; kind: 'masqué' | 'retiré' }[] | null>(null)
const after = ref<string>('')
const showJson = ref(false)

const canRun = computed(() => props.orgId != null && sample.value.trim().length > 0 && !busy.value)

// Parcourt before/after en parallèle → liste des chemins masqués (valeur changée) ou
// retirés (clé absente côté after). Les non-PII inchangés ne sont pas listés.
function diff(before: unknown, after: unknown, path: string, out: { path: string; kind: 'masqué' | 'retiré' }[]) {
  if (Array.isArray(before)) {
    const a = Array.isArray(after) ? after : []
    before.forEach((b, i) => diff(b, a[i], `${path}[${i}]`, out))
    return
  }
  if (before && typeof before === 'object') {
    const ao = (after && typeof after === 'object' ? after : {}) as Record<string, unknown>
    for (const [k, bv] of Object.entries(before as Record<string, unknown>)) {
      const p = path ? `${path}.${k}` : k
      if (!(k in ao)) { out.push({ path: p, kind: 'retiré' }); continue }
      diff(bv, ao[k], p, out)
    }
    return
  }
  // feuille scalaire
  if (before !== after) out.push({ path, kind: 'masqué' })
}

function leafKeys(obj: unknown, acc: Set<string>) {
  if (Array.isArray(obj)) { obj.forEach((x) => leafKeys(x, acc)); return }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (v && typeof v === 'object') leafKeys(v, acc)
      else acc.add(k)
      // clé conteneur aussi exposée (utile pour cibler emails/phones list)
      if (Array.isArray(v) || (v && typeof v === 'object')) acc.add(k)
    }
  }
}

async function run() {
  error.value = ''; changes.value = null; after.value = ''
  let parsed: unknown
  try { parsed = JSON.parse(sample.value) }
  catch { error.value = 'JSON invalide — colle une réponse de l\'outil (objet ou tableau).'; return }
  busy.value = true
  try {
    const res = await previewOrgFieldFilter(props.orgId!, props.service, parsed, props.rules)
    const out: { path: string; kind: 'masqué' | 'retiré' }[] = []
    diff(parsed, res.redacted, '', out)
    changes.value = out
    after.value = JSON.stringify(res.redacted, null, 2)
    const ks = new Set<string>(); leafKeys(parsed, ks)
    emit('observed', [...ks])
  } catch (e) { error.value = humanize(e) }
  finally { busy.value = false }
}
</script>

<template>
  <div class="rp">
    <p class="dim rp-hint">
      colle une <strong>vraie réponse</strong> de l'outil (ex. <code class="mono">unipile_profile</code>)
      pour voir exactement ce que le filtre masque — clés imbriquées incluses.
    </p>
    <textarea v-model="sample" class="rp-ta" rows="5" spellcheck="false"
      placeholder='{ "first_name": "…", "contact_info": { "emails": ["…"] }, "skills": [{ "name": "…" }] }' />
    <div class="rp-actions">
      <Btn icon="bolt" :disabled="!canRun" @click="run">{{ busy ? 'test…' : 'tester le filtrage' }}</Btn>
      <span v-if="error" class="rp-err">{{ error }}</span>
    </div>

    <div v-if="changes" class="rp-res">
      <p v-if="!changes.length" class="dim">aucun champ traité sur cet échantillon — vérifie tes règles.</p>
      <template v-else>
        <p class="rp-sum">{{ changes.length }} champ(s) traité(s) :</p>
        <ul class="rp-list">
          <li v-for="c in changes" :key="c.path">
            <code class="mono">{{ c.path }}</code>
            <Tag :tone="c.kind === 'retiré' ? 'terra' : 'ink'">{{ c.kind }}</Tag>
          </li>
        </ul>
      </template>
      <button class="rp-toggle" @click="showJson = !showJson">{{ showJson ? '▾' : '▸' }} voir le résultat (après)</button>
      <pre v-if="showJson" class="rp-json">{{ after }}</pre>
    </div>
  </div>
</template>

<style scoped>
.rp { display: flex; flex-direction: column; gap: 8px; margin-top: 8px;
  padding-top: 10px; border-top: 1px dashed var(--color-hair-soft); }
.rp-hint { font-size: 11.5px; margin: 0; }
.rp-ta {
  font-family: var(--font-mono); font-size: 11.5px; line-height: 1.45; padding: 8px 10px;
  border: 1px solid var(--color-hair-soft); border-radius: 8px; background: var(--color-surface);
  color: var(--color-ink); resize: vertical; width: 100%; box-sizing: border-box;
}
.rp-ta:focus { outline: none; border-color: var(--color-cobalt); }
.rp-actions { display: flex; align-items: center; gap: 10px; }
.rp-err { font-size: 12px; color: var(--color-terra-ink); }
.rp-res { display: flex; flex-direction: column; gap: 6px; }
.rp-sum { font-size: 12px; font-weight: 600; margin: 4px 0 0; }
.rp-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.rp-list li { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.rp-toggle { background: none; border: 0; padding: 4px 0; cursor: pointer;
  font-size: 12px; color: var(--color-cobalt-ink); font-weight: 600; text-align: left; }
.rp-json {
  font-family: var(--font-mono); font-size: 11px; line-height: 1.4; margin: 0; padding: 10px;
  background: var(--color-paper-2); border: 1px solid var(--color-hair-soft); border-radius: 8px;
  max-height: 40vh; overflow: auto; white-space: pre-wrap; word-break: break-word;
}
</style>
