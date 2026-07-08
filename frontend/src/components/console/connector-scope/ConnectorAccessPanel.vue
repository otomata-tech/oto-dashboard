<script setup lang="ts" generic="R">
// Panneau accès (RBAC connecteur, ADR 0025) du drawer unifié : ouvert vs réservé à des
// principals (équipe/membre). ≥1 principal ⟹ réservé (invisible + bloqué pour les autres).
// Org : ajouter/retirer + « pousser à un membre ». (Team : à venir, backend B2.)
import { computed } from 'vue'
import type { AccessLever } from './adapter'
import Btn from '@/components/console/Btn.vue'

const props = defineProps<{ lever: AccessLever<R>; row: R }>()
const restricted = computed(() => props.lever.restricted(props.row))
const principals = computed(() => props.lever.principals(props.row))
const canEdit = computed(() => props.lever.canEdit(props.row))
</script>

<template>
  <section class="cacc">
    <h4 class="cacc-h">accès</h4>
    <template v-if="!restricted">
      <p class="helptext" style="margin: 0 0 10px">ouvert à toute l'org.</p>
      <Btn v-if="canEdit" kind="mini" @click="lever.add(row)">Restreindre…</Btn>
    </template>
    <template v-else>
      <p class="helptext" style="margin: 0 0 10px"><strong>réservé</strong> — invisible et bloqué pour les autres, même avec leur propre clé.</p>
      <div class="cacc-chips">
        <span v-for="p in principals" :key="p.type + p.id" class="cacc-chip">
          {{ p.label }}
          <button v-if="canEdit" class="cacc-x" title="retirer" @click="lever.remove(row, p.type, p.id)">×</button>
        </span>
        <Btn v-if="canEdit" kind="mini" @click="lever.add(row)">+ ajouter</Btn>
      </div>
    </template>
    <template v-if="canEdit && lever.force">
      <hr class="cacc-div" />
      <Btn kind="link" @click="lever.force(row)">pousser à un membre…</Btn>
    </template>
  </section>
</template>

<style scoped>
.cacc { padding: 16px 20px; }
.cacc-h { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--color-faint); margin-bottom: 10px; }
.cacc-chips { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.cacc-chip { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; padding: 2px 4px 2px 9px; border-radius: var(--radius-pill); background: var(--color-saffron-soft); color: var(--color-saffron-ink); }
.cacc-x { border: 0; background: none; cursor: pointer; color: inherit; font-size: 14px; line-height: 1; padding: 0 2px; opacity: .7; }
.cacc-x:hover { opacity: 1; }
.cacc-div { border: 0; border-top: 1px dotted var(--color-hair-classic); margin: 14px 0; }
</style>
