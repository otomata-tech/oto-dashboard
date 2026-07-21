<script setup lang="ts">
// Publier un projet en endpoint MCP (retour projet R3) : formulaire dédié avec un
// PICKER D'OUTILS À CASES groupées par connecteur (fini le textarea de noms à retaper).
// Les candidats sont CURÉS depuis l'inventaire du projet (procédures liées + runs,
// `oto_project op=inventory`) ∪ les outils déjà exposés ; un champ « + ajouter » couvre
// un outil hors inventaire. Présentationnel : charge l'inventaire, gère la sélection,
// émet `publish` — le parent (ProjectShareDialog) appelle l'API + toast.
import { computed, ref, watch } from 'vue'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import Btn from '@/components/console/Btn.vue'
import Icon from '@/components/console/Icon.vue'
import OtoSelect from '@/components/console/OtoSelect.vue'
import { getProjectInventory } from '@/api/console'
import type { Project } from '@/types/api'

const props = defineProps<{ open: boolean; project: Project; defaultSlug: string }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'publish', v: { slug: string; access: 'anonymous' | 'secret' | 'org'; tools: string[] }): void
}>()

const ACCESS_OPTIONS = [
  { value: 'anonymous', label: 'Public · sans login, listé dans l’annuaire' },
  { value: 'secret', label: 'Secret · URL non devinable, navigable (non listé)' },
  { value: 'org', label: 'Org · authentifié (membres de l’org)' },
]

const slug = ref('')
const access = ref<'anonymous' | 'secret' | 'org'>('anonymous')
const checked = ref<Set<string>>(new Set())
const inventory = ref<string[]>([])
const loading = ref(false)
const extra = ref('')

// Candidats = inventaire dérivé ∪ outils déjà exposés (pour ne jamais perdre un outil
// curé absent de l'inventaire courant). Groupés par CONNECTEUR (préfixe = namespace).
const candidates = computed(() =>
  [...new Set([...inventory.value, ...(props.project.mcp_tools ?? [])])])
const namespace = (t: string) => t.split('_')[0] || t
const groups = computed(() => {
  const g: Record<string, string[]> = {}
  for (const t of candidates.value) (g[namespace(t)] ??= []).push(t)
  return Object.entries(g)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ns, tools]) => ({ ns, tools: [...tools].sort() }))
})

// Un endpoint public/org exige au moins un outil ; « secret » (lien navigable) peut tout
// exposer en lecture seule → liste vide autorisée (aligné backend).
const canPublish = computed(() => access.value === 'secret' || checked.value.size > 0)

watch(() => props.open, async (o) => {
  if (!o) return
  slug.value = props.project.mcp_slug || props.defaultSlug
  const active = !!props.project.mcp_access && props.project.mcp_access !== 'off'
  access.value = active ? (props.project.mcp_access as 'anonymous' | 'secret' | 'org') : 'anonymous'
  extra.value = ''
  loading.value = true
  try {
    inventory.value = (await getProjectInventory(props.project.id)).tools ?? []
  } catch { inventory.value = [] } finally { loading.value = false }
  // Pré-cochés : les outils déjà exposés si le projet est publié, sinon tout l'inventaire
  // (défaut « expose ce que le projet sait faire », l'utilisateur décoche).
  const pre = props.project.mcp_tools?.length ? props.project.mcp_tools : candidates.value
  checked.value = new Set(pre)
}, { immediate: true })

function toggle(t: string) {
  const s = new Set(checked.value)
  s.has(t) ? s.delete(t) : s.add(t)
  checked.value = s
}
function toggleGroup(tools: string[]) {
  const all = tools.every((t) => checked.value.has(t))
  const s = new Set(checked.value)
  tools.forEach((t) => (all ? s.delete(t) : s.add(t)))
  checked.value = s
}
function addExtra() {
  const t = extra.value.trim()
  if (!t) return
  inventory.value = [...new Set([...inventory.value, t])]
  checked.value = new Set([...checked.value, t])
  extra.value = ''
}
function submit() {
  if (!canPublish.value) return
  emit('publish', { slug: slug.value.trim(), access: access.value, tools: [...checked.value] })
}
</script>

<template>
  <Dialog :open="open" @update:open="(v) => { if (!v) emit('close') }">
    <DialogContent v-if="open" :style="{ maxWidth: '560px' }">
      <DialogTitle>Publier en endpoint MCP</DialogTitle>
      <p class="pmp-desc">Un sous-domaine dédié exposant un jeu d’outils figé, à brancher dans
        Claude/Mistral. En « secret », il est aussi une UI navigable (lecture seule).</p>

      <label class="pmp-lbl">Sous-domaine</label>
      <input v-model="slug" class="inp sm" placeholder="french-tech-marseille" />
      <p class="pmp-hint">→ &lt;slug&gt;.mcp.oto.cx (public/org) ou &lt;slug&gt;.share.oto.cx (secret). Min. 3 car., a-z 0-9 -.</p>

      <label class="pmp-lbl">Accès</label>
      <OtoSelect v-model="access" :options="ACCESS_OPTIONS" aria-label="Accès" />

      <div class="pmp-tools-hd">
        <label class="pmp-lbl" style="margin:0">Outils exposés</label>
        <span class="pmp-count mono">{{ checked.size }} sélectionné(s)</span>
      </div>
      <p v-if="access === 'secret'" class="pmp-hint">Vide = tout le projet visible, lecture seule.</p>

      <div class="pmp-picker">
        <p v-if="loading" class="pmp-empty">chargement de l’inventaire…</p>
        <p v-else-if="!groups.length" class="pmp-empty">Aucun outil déduit du projet — lie une procédure
          ou un connecteur au projet, ou ajoute un outil ci-dessous.</p>
        <div v-for="g in groups" :key="g.ns" class="pmp-grp">
          <button type="button" class="pmp-grp-hd" @click="toggleGroup(g.tools)"
            :aria-label="'tout (dé)sélectionner pour ' + g.ns">
            <span class="pmp-grp-box" :class="{ on: g.tools.every((t) => checked.has(t)) }">
              <Icon v-if="g.tools.every((t) => checked.has(t))" name="check" :size="11" />
            </span>
            <span class="pmp-grp-name mono">{{ g.ns }}</span>
            <span class="pmp-grp-n">{{ g.tools.filter((t) => checked.has(t)).length }}/{{ g.tools.length }}</span>
          </button>
          <label v-for="t in g.tools" :key="t" class="pmp-tool">
            <input type="checkbox" :checked="checked.has(t)" @change="toggle(t)" />
            <span class="pmp-tool-name">{{ t }}</span>
          </label>
        </div>
      </div>

      <div class="pmp-add">
        <input v-model="extra" class="inp sm" placeholder="ajouter un outil (ex. frenchtech_search)"
          @keyup.enter="addExtra" />
        <Btn kind="mini" icon="plus" :disabled="!extra.trim()" @click="addExtra">Ajouter</Btn>
      </div>

      <div class="pmp-actions">
        <Btn :disabled="!canPublish" @click="submit">Publier</Btn>
        <button class="pmp-x" @click="emit('close')">Annuler</button>
      </div>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.pmp-desc { font-size: 12.5px; color: var(--color-ink-soft); margin: 4px 0 14px; line-height: 1.5; }
.pmp-lbl { display: block; font-size: 12px; font-weight: 600; color: var(--color-ink); margin: 12px 0 5px; }
.pmp-hint { font-size: 11px; color: var(--color-faint); margin: 4px 0 0; }
.pmp-tools-hd { display: flex; align-items: baseline; justify-content: space-between; margin-top: 14px; }
.pmp-count { font-size: 10.5px; color: var(--color-mute); }
.pmp-picker { margin-top: 8px; max-height: 260px; overflow-y: auto; border: 1px solid var(--color-hair); border-radius: var(--radius-md); background: var(--color-surface); padding: 6px; }
.pmp-empty { font-size: 12px; color: var(--color-faint); padding: 12px; margin: 0; line-height: 1.5; }
.pmp-grp { margin-bottom: 4px; }
.pmp-grp-hd { display: flex; align-items: center; gap: 7px; width: 100%; border: 0; background: transparent; cursor: pointer; padding: 6px 6px 4px; color: var(--color-ink); }
.pmp-grp-hd:hover { background: var(--color-paper-2); border-radius: 6px; }
.pmp-grp-box { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 15px; height: 15px; border: 1px solid var(--color-hair-classic); border-radius: 4px; color: var(--color-surface); }
.pmp-grp-box.on { background: var(--color-ink); border-color: var(--color-ink); }
.pmp-grp-name { font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--color-saffron-ink); flex: 1; text-align: left; }
.pmp-grp-n { font-family: var(--font-mono); font-size: 10px; color: var(--color-faint); }
.pmp-tool { display: flex; align-items: center; gap: 8px; padding: 4px 6px 4px 24px; font-size: 12.5px; color: var(--color-ink-soft); cursor: pointer; border-radius: 6px; }
.pmp-tool:hover { background: var(--color-paper-2); }
.pmp-tool-name { font-family: var(--font-mono); font-size: 11.5px; }
.pmp-add { display: flex; gap: 7px; margin-top: 10px; }
.pmp-add .inp { flex: 1; }
.pmp-actions { display: flex; align-items: center; gap: 10px; margin-top: 16px; }
.pmp-x { border: none; background: none; font: inherit; font-size: 13px; color: var(--color-ink-soft); cursor: pointer; }
.pmp-x:hover { color: var(--color-ink); }
</style>
