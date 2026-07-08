<script setup lang="ts" generic="R">
// Panneau credential du drawer unifié : l'instance possédée à CE scope (clé perso/
// équipe/org/plateforme). Deux modes : single-instance (state + add/rotate/remove) ou
// multi-instance (`items` — plateforme : N clés/labels, chacune retirable). Édition via
// le levier de l'adaptateur (FormDialog ou CredentialFieldsDialog, hébergés par la vue).
import { computed } from 'vue'
import type { CredentialLever } from './adapter'
import Dot from '@/components/console/Dot.vue'
import Btn from '@/components/console/Btn.vue'

const props = defineProps<{ lever: CredentialLever<R>; row: R }>()
const s = computed(() => props.lever.state(props.row))
const canEdit = computed(() => props.lever.canEdit(props.row))
const items = computed(() => props.lever.items?.(props.row) ?? null)
</script>

<template>
  <section class="ccp">
    <h4 class="ccp-h">{{ lever.title }}</h4>

    <!-- multi-instance : liste des clés (plateforme) -->
    <template v-if="items">
      <div v-for="it in items" :key="it.key" class="ccp-item">
        <span class="ccp-item-lbl"><Dot tone="cobalt" /> {{ it.label }}<span v-if="it.sub" class="ccp-sub"> · {{ it.sub }}</span></span>
        <Btn v-if="canEdit && lever.removeItem" kind="danger" @click="lever.removeItem(row, it.key)">Remove</Btn>
      </div>
      <div v-if="!items.length" class="ccp-state dim">aucune clé</div>
      <div v-if="canEdit" class="ccp-actions"><Btn kind="mini" icon="plus" @click="lever.edit(row)">Add key</Btn></div>
      <div v-else class="helptext" style="margin-top: 8px">read-only.</div>
    </template>

    <!-- single-instance : team/org/user -->
    <template v-else>
      <div v-if="s.present" class="ccp-state"><Dot tone="olive" /> {{ s.label }}<span v-if="s.sub" class="ccp-sub"> · {{ s.sub }}</span></div>
      <div v-else class="ccp-state dim">{{ s.label }}</div>
      <div v-if="canEdit" class="ccp-actions">
        <Btn kind="mini" :icon="s.present ? undefined : 'plus'" @click="lever.edit(row)">{{ s.present ? 'Rotate' : 'Add key' }}</Btn>
        <Btn v-if="s.present && lever.remove" kind="danger" @click="lever.remove(row)">Remove</Btn>
      </div>
      <div v-else class="helptext" style="margin-top: 8px">read-only.</div>
    </template>
  </section>
</template>

<style scoped>
.ccp { padding: 16px 20px; }
.ccp-h { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--color-faint); margin-bottom: 10px; }
.ccp-state { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--color-ink); }
.ccp-state.dim { color: var(--color-faint); }
.ccp-sub { color: var(--color-faint); font-size: 11.5px; }
.ccp-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: 1px solid var(--color-hair); }
.ccp-item-lbl { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--color-ink); }
.ccp-actions { display: flex; gap: 8px; margin-top: 12px; }
</style>
