<script setup lang="ts">
// Ce qui est PARTI, et ce qui a été REFUSÉ — les deux registres que la relance laisse
// derrière elle.
//
// Le journal porte les essais (`kind='test'`, partis chez l'opérateur) au même titre
// que les envois : c'est ce qui permet de vérifier après coup qu'un envoi a bien été
// précédé de son essai. Ne pas les masquer sous prétexte qu'ils « ne comptent pas ».
//
// ⚠️ Lever une désinscription est réservé au super_admin, et ne se fait QUE sur la
// demande explicite de la personne. Le bouton est donc OMIS — pas grisé — pour qui
// n'en a pas le droit : un levier inerte se découvre au clic.
import { ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Btn from '@/components/console/Btn.vue'
import Tag from '@/components/console/Tag.vue'
import { fmtDateTime } from '@/types/api'
import type { OutreachSend, OutreachOptout } from '@/types/api'

defineProps<{
  sends: OutreachSend[]
  optouts: OutreachOptout[]
  canClear: boolean
  busy: boolean
}>()
const emit = defineEmits<{ clear: [target: string] }>()

const ouvert = ref<'journal' | 'optouts'>('journal')
</script>

<template>
  <div class="oj">
    <div class="oj-switch">
      <Btn :kind="ouvert === 'journal' ? undefined : 'ghost'" @click="ouvert = 'journal'">
        Journal ({{ sends.length }})</Btn>
      <Btn :kind="ouvert === 'optouts' ? undefined : 'ghost'" @click="ouvert = 'optouts'">
        Désinscrits ({{ optouts.length }})</Btn>
    </div>

    <ConsoleCard v-if="ouvert === 'journal'" flush title="Journal des relances"
      sub="qui a été contacté, quand, dans quelle langue, par qui — essais compris.">
      <table v-if="sends.length" class="tbl">
        <thead>
          <tr><th>Quand</th><th>Campagne</th><th>Destinataire</th><th>Langue</th>
            <th>Nature</th><th>Par</th></tr>
        </thead>
        <tbody>
          <tr v-for="l in sends" :key="l.id">
            <td class="mono">{{ fmtDateTime(l.sent_at) ?? '—' }}</td>
            <td class="mono">{{ l.campaign }}</td>
            <td>
              {{ l.to_email ?? l.sub }}
              <Tag v-if="l.desinscrit" tone="terra" class="tg">désinscrit depuis</Tag>
            </td>
            <td>{{ l.locale }}</td>
            <td>
              <!-- L'essai se distingue de l'envoi : c'est lui qui déverrouille. -->
              <Tag :tone="l.kind === 'test' ? 'cobalt' : 'olive'">
                {{ l.kind === 'test' ? 'essai' : 'envoi' }}</Tag>
            </td>
            <td class="mono dim">{{ l.sent_by ?? '—' }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty">Rien n'est encore parti.</p>
    </ConsoleCard>

    <ConsoleCard v-else flush title="Refus de recevoir"
      sub="un compte désinscrit quitte toute audience, pour toute campagne.">
      <table v-if="optouts.length" class="tbl">
        <thead>
          <tr><th>Compte</th><th>Depuis</th><th>Par quel geste</th>
            <th v-if="canClear"></th></tr>
        </thead>
        <tbody>
          <tr v-for="o in optouts" :key="o.sub">
            <td>{{ o.email ?? o.sub }}</td>
            <td class="mono">{{ fmtDateTime(o.opted_out_at) ?? '—' }}</td>
            <td class="dim">{{ o.source ?? '—' }}</td>
            <td v-if="canClear" class="act">
              <Btn kind="mini" :disabled="busy" @click="emit('clear', o.sub)">
                Ré-inscrire</Btn>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty">Personne n'a refusé.</p>
    </ConsoleCard>
  </div>
</template>

<style scoped>
.oj-switch { display: flex; gap: 8px; margin-bottom: 14px; }
.empty { font-size: 12px; color: var(--color-mute); margin: 0; padding: 0 var(--pad-card) var(--pad-card); }
.act { text-align: right; }
.tg { margin-left: 6px; }
</style>
