<script setup lang="ts">
// Édition du bloc d'instructions PLATEFORME (#50) — secret sauce (A). Injecté à TOUS
// les comptes au handshake MCP, inviolable par l'org. Réservé à l'admin plateforme (le
// backend l'impose ; l'UI vit sous /platform). Bloc A = posture + boucle d'usage +
// catalogue de namespaces dérivé, toujours injecté. (L'onboarding n'est plus un bloc :
// c'est un projet « Découverte », ADR 0032 §7.)
import { onMounted, reactive, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import GuidesCard from '@/components/console/GuidesCard.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import { getPlatformInstructions, setPlatformInstruction } from '@/api/console'
import type { PlatformInstrBlock } from '@/types/api'
import { useToast } from '@/composables/useToast'
import { humanize } from '@/lib/errors'

const { toast } = useToast()

const META: Record<string, { title: string; sub: string; tag: string }> = {
  secret_sauce: {
    title: 'bloc A · secret sauce',
    sub: 'posture + boucle d’usage + catalogue de namespaces (dérivé, ajouté automatiquement). toujours injecté, en tête du contexte de chaque agent.',
    tag: 'toujours injecté',
  },
}

const blocks = ref<PlatformInstrBlock[]>([])
const loaded = ref(false)
const error = ref<string | null>(null)
// Brouillon éditable + état de sauvegarde, par clé.
const draft = reactive<Record<string, string>>({})
const saving = reactive<Record<string, boolean>>({})

function meta(key: string) {
  return META[key] ?? { title: key, sub: '', tag: '' }
}
function dirty(b: PlatformInstrBlock): boolean {
  return (draft[b.key] ?? '') !== b.body_md
}
function isDefault(b: PlatformInstrBlock): boolean {
  return (draft[b.key] ?? '') === b.default_md
}

async function load() {
  try {
    const res = await getPlatformInstructions()
    blocks.value = res.blocks
    for (const b of res.blocks) draft[b.key] = b.body_md
  } catch (e) {
    error.value = humanize(e)
  } finally {
    loaded.value = true
  }
}

async function save(b: PlatformInstrBlock) {
  if (!dirty(b) || saving[b.key]) return
  saving[b.key] = true
  try {
    const updated = await setPlatformInstruction(b.key, draft[b.key] ?? '')
    const i = blocks.value.findIndex((x) => x.key === b.key)
    if (i >= 0) blocks.value[i] = updated
    draft[b.key] = updated.body_md
    toast(`bloc « ${meta(b.key).title} » enregistré`)
  } catch (e) {
    toast(humanize(e))
  } finally {
    saving[b.key] = false
  }
}

function revert(b: PlatformInstrBlock) {
  draft[b.key] = b.body_md
}
function restoreDefault(b: PlatformInstrBlock) {
  draft[b.key] = b.default_md
}

onMounted(load)
</script>

<template>
  <div class="content-inner fadein">
    <ConsoleCard title="server instructions"
      sub="le niveau PLATEFORME de l'agent readme : les blocs que TOUT agent oto reçoit au handshake MCP, avant les readme org/équipe/user. édités ici par la plateforme, inviolables par les orgs. le readme d'org s'édite sur /org, les procédures sur /procedures.">
      <template #actions><Tag tone="cobalt">plateforme</Tag></template>
      <p v-if="error" class="dim" style="font-size: 13px">{{ error }}</p>
      <p v-else-if="!loaded" class="dim" style="font-size: 13px">chargement…</p>
    </ConsoleCard>

    <ConsoleCard v-for="b in blocks" :key="b.key" :title="meta(b.key).title" :sub="meta(b.key).sub">
      <template #actions>
        <Tag tone="saffron">{{ meta(b.key).tag }}</Tag>
        <Tag :tone="b.is_seed ? undefined : 'olive'">{{ b.is_seed ? 'défaut (jamais édité)' : 'édité' }}</Tag>
      </template>

      <textarea v-model="draft[b.key]" class="instr-area" spellcheck="false"></textarea>

      <div class="instr-bar">
        <span class="dim" style="font-size: 12px">
          {{ (draft[b.key] ?? '').length }} caractères<template v-if="b.updated_by"> · maj par {{ b.updated_by }}</template>
        </span>
        <span style="flex: 1"></span>
        <Btn v-if="!isDefault(b)" kind="mini" @click="restoreDefault(b)">Rétablir le défaut</Btn>
        <Btn v-if="dirty(b)" kind="mini" @click="revert(b)">Annuler</Btn>
        <Btn :disabled="!dirty(b) || saving[b.key]" @click="save(b)">
          {{ saving[b.key] ? 'Enregistrement…' : 'Enregistrer' }}
        </Btn>
      </div>
    </ConsoleCard>

    <!-- Guides plateforme on-demand (ADR 0042, tout-DB) : les how-to que TOUT agent
         peut charger via oto_guide. Éditables ici (platform_admin, le backend l'impose) ;
         les fichiers guides/*.md du repo ne sont que les seeds du premier boot. -->
    <GuidesCard scope="platform" :can-edit="true" title="guides plateforme"
      sub="how-to chargés à la demande par l'agent (oto_guide), servis à TOUS les comptes. distincts des blocs injectés ci-dessus : l'agent les lit quand la tâche le demande." />
  </div>
</template>

<style scoped>
.instr-area {
  width: 100%;
  min-height: 320px;
  resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--color-ink-soft, #4a463d);
  background: var(--color-paper-3, #f5f1e8);
  border: 1px solid var(--color-hair-soft, #e3dccd);
  border-radius: 8px;
  padding: 12px 14px;
  box-sizing: border-box;
}
.instr-area:focus {
  outline: none;
  border-color: var(--color-cobalt, #3b5bdb);
}
.instr-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}
</style>
