<script setup lang="ts" generic="R">
// Panneau credential du drawer unifié : l'instance possédée à CE scope (clé perso/
// équipe/org/plateforme). Deux modes : single-instance (state + add/rotate/remove) ou
// multi-instance (`items` — plateforme : N clés/labels, chacune retirable). Édition via
// le levier de l'adaptateur (FormDialog ou CredentialFieldsDialog, hébergés par la vue).
import { computed, ref } from 'vue'
import type { CredentialLever } from './adapter'
import type { VerifyResult } from '@/types/api'
import Dot from '@/components/console/Dot.vue'
import Btn from '@/components/console/Btn.vue'
import { humanize } from '@/lib/errors'

const props = defineProps<{ lever: CredentialLever<R>; row: R }>()
const s = computed(() => props.lever.state(props.row))
const canEdit = computed(() => props.lever.canEdit(props.row))
const items = computed(() => props.lever.items?.(props.row) ?? null)

// Sonde « tester la connexion » (read-only, résultat éphémère) quand le levier l'expose
// et qu'une clé est posée.
const testing = ref(false)
const testRes = ref<VerifyResult | null>(null)
async function test() {
  if (!props.lever.verify) return
  testing.value = true; testRes.value = null
  try { testRes.value = await props.lever.verify(props.row) }
  catch (e) { testRes.value = { ok: false, provider: '', error: humanize(e) } }
  finally { testing.value = false }
}
</script>

<template>
  <section class="ccp">
    <h4 class="ccp-h">{{ lever.title }}</h4>

    <!-- multi-instance : liste des clés (plateforme) -->
    <template v-if="items">
      <div v-for="it in items" :key="it.key" class="ccp-item">
        <span class="ccp-item-lbl"><Dot tone="cobalt" /> {{ it.label }}<span v-if="it.sub" class="ccp-sub"> · {{ it.sub }}</span></span>
        <Btn v-if="canEdit && lever.removeItem" kind="danger" @click="lever.removeItem(row, it.key)">Retirer</Btn>
      </div>
      <div v-if="!items.length" class="ccp-state dim">aucune clé</div>
      <div v-if="canEdit" class="ccp-actions"><Btn kind="mini" icon="plus" @click="lever.edit(row)">Ajouter une clé</Btn></div>
      <div v-else class="helptext" style="margin-top: 8px">lecture seule.</div>
    </template>

    <!-- single-instance : team/org/user -->
    <template v-else>
      <div v-if="s.present" class="ccp-state"><Dot tone="olive" /> {{ s.label }}<span v-if="s.sub" class="ccp-sub"> · {{ s.sub }}</span></div>
      <div v-else class="ccp-state dim">{{ s.label }}</div>
      <div v-if="canEdit || (s.present && lever.verify)" class="ccp-actions">
        <Btn v-if="canEdit" kind="mini" :icon="s.present ? undefined : 'plus'" @click="lever.edit(row)">{{ s.present ? 'Renouveler' : 'Ajouter une clé' }}</Btn>
        <Btn v-if="canEdit && s.present && lever.remove" kind="danger" @click="lever.remove(row)">Retirer</Btn>
        <Btn v-if="s.present && lever.verify" kind="mini" :disabled="testing" @click="test">{{ testing ? 'test…' : 'tester' }}</Btn>
      </div>
      <p v-if="testRes" class="ccp-test" :style="{ color: testRes.ok ? 'var(--color-olive)' : 'var(--color-terra-ink)' }">
        {{ testRes.ok ? '✓ connexion OK' : `✗ ${testRes.error}` }}
      </p>
      <div v-if="!canEdit && !(s.present && lever.verify)" class="helptext" style="margin-top: 8px">lecture seule.</div>
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
.ccp-test { font-size: 11.5px; margin-top: 8px; }
</style>
