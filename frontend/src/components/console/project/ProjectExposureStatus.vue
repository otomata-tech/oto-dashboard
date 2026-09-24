<script setup lang="ts">
// Ce que voit le destinataire d'un lien « secret » : pages + tableaux (issue #131).
// Extrait de ProjectShareDialog (qui l'affiche sous « Lien public », dès que le lien est
// actif — un clic ou l'endpoint MCP y mènent tous les deux) pour rester < 500 lignes.
// Présentationnel : l'état vient du parent (déjà dérivé du projet), les actions remontent.
import Icon from '@/components/console/Icon.vue'
import Btn from '@/components/console/Btn.vue'
import Tag from '@/components/console/Tag.vue'

defineProps<{
  docsExposed: boolean
  dsExposed: boolean
  dsWritable: boolean
  dsLegacy: boolean
  tableCount: number
  readOnly?: boolean
  busy?: boolean
}>()
const emit = defineEmits<{
  (e: 'set-docs', expose: boolean): void
  (e: 'set-datastore', v: { expose: boolean; write: boolean }): void
  (e: 'normalize-legacy'): void
}>()
</script>

<template>
  <!-- Pages du projet : opt-in séparé du datastore, fermé par défaut. -->
  <div class="pes">
    <div class="pes__row">
      <Icon name="file-text" :size="14" />
      <span class="pes__lbl">{{ $t('projectsUi.exposure.pages') }}</span>
      <Tag v-if="docsExposed" tone="cobalt">{{ $t('projectsUi.exposure.readable') }}</Tag>
      <Tag v-else tone="terra">{{ $t('projectsUi.exposure.closedPl') }}</Tag>
    </div>
    <div v-if="!docsExposed" class="pes__warn">
      <Icon name="triangle-alert" :size="13" />
      <i18n-t keypath="projectsUi.exposure.pagesClosed" tag="span">
        <template #none><strong>{{ $t('projectsUi.exposure.noPage') }}</strong></template>
      </i18n-t>
    </div>
    <i18n-t v-else keypath="projectsUi.exposure.pagesOpen" tag="p" class="pes__desc">
      <template #scope><strong>{{ $t('projectsUi.exposure.ofThisProject') }}</strong></template>
    </i18n-t>
    <div v-if="!readOnly" class="pes__act">
      <Btn v-if="!docsExposed" kind="mini" icon="file-text" :disabled="busy" @click="emit('set-docs', true)">{{ $t('projectsUi.exposure.openPages') }}</Btn>
      <Btn v-else kind="mini" :disabled="busy" @click="emit('set-docs', false)">{{ $t('projectsUi.exposure.closePages') }}</Btn>
    </div>
  </div>

  <!-- Tableaux (datastore) : lecture puis écriture, état effectif du réglage. -->
  <div class="pes">
    <div class="pes__row">
      <Icon name="database" :size="14" />
      <span class="pes__lbl">{{ $t('projectsUi.exposure.tables') }}</span>
      <Tag v-if="dsWritable" tone="olive">{{ $t('projectsUi.exposure.readWrite') }}</Tag>
      <Tag v-else-if="dsExposed" tone="cobalt">{{ $t('projectsUi.exposure.read') }}</Tag>
      <Tag v-else tone="terra">{{ $t('projectsUi.exposure.closed') }}</Tag>
    </div>
    <template v-if="tableCount > 0">
      <div v-if="!dsExposed" class="pes__warn">
        <Icon name="triangle-alert" :size="13" />
        <i18n-t keypath="projectsUi.exposure.tablesClosed" tag="span" :plural="tableCount">
          <template #none><strong>{{ $t('projectsUi.exposure.noneOf') }}</strong></template>
          <template #n>{{ tableCount }}</template>
        </i18n-t>
      </div>
      <i18n-t v-else keypath="projectsUi.exposure.tablesOpen" tag="p" class="pes__desc" :plural="tableCount">
        <template #n>{{ tableCount }}</template>
        <template #scope><strong>{{ $t('projectsUi.exposure.linkedToProject') }}</strong></template>
      </i18n-t>
      <div v-if="dsLegacy" class="pes__warn">
        <Icon name="triangle-alert" :size="13" />
        <i18n-t keypath="projectsUi.exposure.legacy" tag="span">
          <template #tools><code>{{ 'data_*' }}</code></template>
        </i18n-t>
        <Btn v-if="!readOnly" kind="mini" :disabled="busy" @click="emit('normalize-legacy')">{{ $t('projectsUi.exposure.normalize') }}</Btn>
      </div>
      <div v-if="!readOnly" class="pes__act">
        <Btn v-if="!dsExposed" kind="mini" icon="database" :disabled="busy" @click="emit('set-datastore', { expose: true, write: false })">{{ $t('projectsUi.exposure.exposeRead') }}</Btn>
        <template v-else>
          <Btn v-if="!dsWritable" kind="mini" :disabled="busy" @click="emit('set-datastore', { expose: true, write: true })">{{ $t('projectsUi.exposure.allowWrite') }}</Btn>
          <Btn v-else kind="mini" :disabled="busy" @click="emit('set-datastore', { expose: true, write: false })">{{ $t('projectsUi.exposure.backToRead') }}</Btn>
          <Btn kind="mini" :disabled="busy" @click="emit('set-datastore', { expose: false, write: false })">{{ $t('projectsUi.exposure.closeDatastore') }}</Btn>
        </template>
      </div>
    </template>
    <i18n-t v-else keypath="projectsUi.exposure.noTable" tag="p" class="pes__desc">
      <template #link><strong>{{ $t('projectsUi.exposure.linkATable') }}</strong></template>
    </i18n-t>
  </div>
</template>

<style scoped>
.pes { padding: 11px 12px; border: 1px solid var(--color-hair); border-radius: var(--radius-md); background: var(--color-paper-2); }
.pes__row { display: flex; align-items: center; gap: 7px; }
.pes__row :deep(svg) { color: var(--color-mute); flex: none; }
.pes__lbl { font-size: 12.5px; font-weight: 700; color: var(--color-ink-soft); margin-right: 2px; }
.pes__desc { margin: 7px 0 0; font-size: 11.5px; line-height: 1.5; color: var(--color-faint); }
.pes__act { display: flex; gap: 7px; margin-top: 9px; flex-wrap: wrap; }
.pes__warn { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-top: 9px; padding: 8px 10px; border-radius: var(--radius-md); background: var(--color-saffron-soft); font-size: 11px; line-height: 1.45; color: var(--color-saffron-ink); }
.pes__warn :deep(svg) { color: var(--color-saffron-ink); flex: none; }
.pes__warn code { font-family: var(--font-mono); font-size: 10px; }
</style>
