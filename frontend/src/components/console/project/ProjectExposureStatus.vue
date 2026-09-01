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
      <span class="pes__lbl">Pages du projet</span>
      <Tag v-if="docsExposed" tone="cobalt">lisibles</Tag>
      <Tag v-else tone="terra">fermées</Tag>
    </div>
    <div v-if="!docsExposed" class="pes__warn">
      <Icon name="triangle-alert" :size="13" />
      <span>Fermées : le destinataire de ce lien ne verra <strong>aucune page</strong> de ce projet — seulement le brief.</span>
    </div>
    <p v-else class="pes__desc">
      Les invités branchés peuvent lire les pages <strong>de ce projet</strong> — jamais celles du
      reste de l’org, et jamais en écriture. Relis-les avant d’ouvrir : elles portent souvent des
      notes internes (arbitrages, contacts, méthode).
    </p>
    <div v-if="!readOnly" class="pes__act">
      <Btn v-if="!docsExposed" kind="mini" icon="file-text" :disabled="busy" @click="emit('set-docs', true)">Rendre les pages lisibles</Btn>
      <Btn v-else kind="mini" :disabled="busy" @click="emit('set-docs', false)">Refermer les pages</Btn>
    </div>
  </div>

  <!-- Tableaux (datastore) : lecture puis écriture, état effectif du réglage. -->
  <div class="pes">
    <div class="pes__row">
      <Icon name="database" :size="14" />
      <span class="pes__lbl">Tableaux</span>
      <Tag v-if="dsWritable" tone="olive">lecture + écriture</Tag>
      <Tag v-else-if="dsExposed" tone="cobalt">lecture</Tag>
      <Tag v-else tone="terra">fermé</Tag>
    </div>
    <template v-if="tableCount > 0">
      <div v-if="!dsExposed" class="pes__warn">
        <Icon name="triangle-alert" :size="13" />
        <span>Fermé : le destinataire ne verra <strong>aucun</strong> des {{ tableCount }} tableau{{ tableCount > 1 ? 'x' : '' }} lié{{ tableCount > 1 ? 's' : '' }} à ce projet.</span>
      </div>
      <p v-else class="pes__desc">Les invités branchés voient les {{ tableCount }} tableau{{ tableCount > 1 ? 'x' : '' }} <strong>liés à ce projet</strong> (data_list_namespaces, data_rows) — jamais le reste du datastore de l’org.</p>
      <div v-if="dsLegacy" class="pes__warn">
        <Icon name="triangle-alert" :size="13" />
        <span>Exposition configurée par une version antérieure (des <code>data_*</code> figurent dans la liste d’outils). Normalise pour t’appuyer sur le réglage ci-dessous.</span>
        <Btn v-if="!readOnly" kind="mini" :disabled="busy" @click="emit('normalize-legacy')">Normaliser</Btn>
      </div>
      <div v-if="!readOnly" class="pes__act">
        <Btn v-if="!dsExposed" kind="mini" icon="database" :disabled="busy" @click="emit('set-datastore', { expose: true, write: false })">Exposer en lecture</Btn>
        <template v-else>
          <Btn v-if="!dsWritable" kind="mini" :disabled="busy" @click="emit('set-datastore', { expose: true, write: true })">Autoriser l’écriture</Btn>
          <Btn v-else kind="mini" :disabled="busy" @click="emit('set-datastore', { expose: true, write: false })">Repasser en lecture seule</Btn>
          <Btn kind="mini" :disabled="busy" @click="emit('set-datastore', { expose: false, write: false })">Fermer le datastore</Btn>
        </template>
      </div>
    </template>
    <p v-else class="pes__desc">Aucun tableau n’est lié à ce projet — <strong>lie un tableau</strong> au projet pour pouvoir l’exposer aux invités branchés.</p>
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
