<script setup lang="ts" generic="R">
// Panneau credential du drawer unifié : l'instance possédée à CE scope (clé perso/
// équipe/org/plateforme). Actions edit/rotate/remove pilotées par le levier de
// l'adaptateur ; l'édition ouvre `CredentialFieldsDialog` (via ctx.openCredential).
import { computed } from 'vue'
import type { CredentialLever } from './adapter'
import Dot from '@/components/console/Dot.vue'
import Btn from '@/components/console/Btn.vue'

const props = defineProps<{ lever: CredentialLever<R>; row: R }>()
const s = computed(() => props.lever.state(props.row))
const canEdit = computed(() => props.lever.canEdit(props.row))
</script>

<template>
  <section class="ccp">
    <h4 class="ccp-h">{{ lever.title }}</h4>
    <div v-if="s.present" class="ccp-state"><Dot tone="olive" /> {{ s.label }}<span v-if="s.sub" class="ccp-sub"> · {{ s.sub }}</span></div>
    <div v-else class="ccp-state dim">{{ s.label }}</div>
    <div v-if="canEdit" class="ccp-actions">
      <Btn kind="mini" :icon="s.present ? undefined : 'plus'" @click="lever.edit(row)">{{ s.present ? 'Rotate' : 'Add key' }}</Btn>
      <Btn v-if="s.present && lever.remove" kind="danger" @click="lever.remove(row)">Remove</Btn>
    </div>
    <div v-else class="helptext" style="margin-top: 8px">read-only.</div>
  </section>
</template>

<style scoped>
.ccp { padding: 16px 20px; }
.ccp-h { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--color-faint); margin-bottom: 10px; }
.ccp-state { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--color-ink); }
.ccp-state.dim { color: var(--color-faint); }
.ccp-sub { color: var(--color-faint); font-size: 11.5px; }
.ccp-actions { display: flex; gap: 8px; margin-top: 12px; }
</style>
