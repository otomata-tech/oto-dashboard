<script setup lang="ts">
// Section « Context » — projection PLATEFORME (ADR 0022/0041/0042). Le TRONC injecté à
// toutes les sessions de tous les users : les blocs d'instructions serveur (posture,
// boucle d'usage, catalogue de namespaces) + les guides plateforme on-demand + le
// pointeur vers les masters de connecteurs. Absorbe l'ex-écran /platform/instructions
// (bascule B5 faite le 2026-07-23 — la route redirige ici). Édition réservée à
// l'opérateur plateforme (l'API l'impose ; l'UI vit sous /platform).
import { onMounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import GuidesCard from '@/components/console/GuidesCard.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import { getPlatformInstructions, setPlatformInstruction } from '@/api/console'
import type { PlatformInstrBlock } from '@/types/api'
import { useToast } from '@/composables/useToast'
import { humanize } from '@/lib/errors'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const { toast } = useToast()

// Les blocs que l'écran sait nommer ; un bloc inconnu se montre sous sa clé.
const BLOCS_CONNUS = new Set(['secret_sauce'])

const blocks = ref<PlatformInstrBlock[]>([])
const loaded = ref(false)
const error = ref<string | null>(null)
// Brouillon éditable + état de sauvegarde, par clé.
const draft = reactive<Record<string, string>>({})
const saving = reactive<Record<string, boolean>>({})

function meta(key: string) {
  if (!BLOCS_CONNUS.has(key)) return { title: key, sub: '', tag: '' }
  return {
    title: t(`contextUi.platform.block.${key}.title`),
    sub: t(`contextUi.platform.block.${key}.sub`),
    tag: t('contextUi.platform.alwaysInjected'),
  }
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
    toast(t('contextUi.platform.saved', { block: meta(b.key).title }))
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
    <header class="ctx-intro">
      <h2 class="ctx-h1">{{ t('contextUi.platform.title') }}</h2>
      <i18n-t keypath="contextUi.platform.lead" tag="p" class="ctx-lead">
        <template #all><strong>{{ t('contextUi.platform.all') }}</strong></template>
      </i18n-t>
    </header>

    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>
    <p v-else-if="!loaded" class="helptext">{{ t('common.loading') }}</p>

    <template v-else>
      <ConsoleCard v-for="b in blocks" :key="b.key" :title="meta(b.key).title" :sub="meta(b.key).sub">
        <template #actions>
          <Tag tone="saffron">{{ meta(b.key).tag }}</Tag>
          <Tag :tone="b.is_seed ? undefined : 'olive'">{{ b.is_seed ? t('contextUi.platform.seed') : t('contextUi.platform.edited') }}</Tag>
        </template>

        <textarea v-model="draft[b.key]" class="instr-area" spellcheck="false"></textarea>

        <div class="instr-bar">
          <span class="dim" style="font-size: 12px">
            {{ t('contextUi.agent.chars', (draft[b.key] ?? '').length) }}<template v-if="b.updated_by"> · {{ t('contextUi.platform.updatedBy', { who: b.updated_by }) }}</template>
          </span>
          <span style="flex: 1"></span>
          <Btn v-if="!isDefault(b)" kind="mini" @click="restoreDefault(b)">{{ t('contextUi.platform.restore') }}</Btn>
          <Btn v-if="dirty(b)" kind="mini" @click="revert(b)">{{ t('common.cancel') }}</Btn>
          <Btn :disabled="!dirty(b) || saving[b.key]" @click="save(b)">
            {{ saving[b.key] ? t('contextUi.platform.saving') : t('common.save') }}
          </Btn>
        </div>
      </ConsoleCard>

      <!-- Guides plateforme on-demand (ADR 0042, tout-DB) : les how-to que TOUT agent
           peut charger via oto_guide. Éditables ici (platform_admin, le backend l'impose) ;
           les fichiers guides/*.md du repo ne sont que les seeds du premier boot. -->
      <GuidesCard scope="platform" :can-edit="true" :title="t('contextUi.platform.guidesTitle')" :sub="t('contextUi.platform.guidesSub')" />

      <ConsoleCard :title="t('contextUi.platform.mastersTitle')" flush :sub="t('contextUi.platform.mastersSub')">
        <template #actions>
          <RouterLink to="/platform/connectors"><Btn kind="mini">{{ t('contextUi.platform.manageMasters') }}</Btn></RouterLink>
        </template>
        <p class="helptext">{{ t('contextUi.platform.mastersHint') }}</p>
      </ConsoleCard>
    </template>
  </div>
</template>

<style scoped>
.ctx-intro { margin-bottom: 18px; }
.ctx-h1 { font-weight: 700; font-size: 20px; color: var(--color-ink); letter-spacing: -0.01em; }
.ctx-lead { font-size: 13.5px; color: var(--color-mute); line-height: 1.6; margin-top: 6px; max-width: 720px; }
.instr-area {
  width: 100%;
  min-height: 320px;
  resize: vertical;
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--color-ink-soft);
  background: var(--color-paper-3);
  border: 1px solid var(--color-hair-soft);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  box-sizing: border-box;
}
.instr-area:focus {
  outline: none;
  border-color: var(--focus-ring);
}
.instr-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}
</style>
