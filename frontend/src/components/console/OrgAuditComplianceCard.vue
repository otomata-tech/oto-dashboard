<script setup lang="ts">
// Export COMPLET du journal des accès de l'org (oto#269) — la pièce qu'un admin d'org produit devant
// un auditeur ou un délégué à la protection des données. L'export parcourt TOUTES les pages
// que le serveur sert, puis vérifie que les lignes reçues valent le total annoncé : l'écran
// dit « complet » ou « incomplet », jamais un fichier muet sur ce qu'il porte. La supervision
// (/org/monitoring) sert la même source page par page, réponse brute : `OrgAuditExportCard`.
import { ref } from 'vue'
import ConsoleCard from './ConsoleCard.vue'
import Btn from './Btn.vue'
import { auditCsv, auditFileName, auditJson, collectAuditLog, dayBound, type AuditCollected } from '@/lib/auditExport'
import { downloadCsv } from '@/lib/csv'
import { saveBlob } from '@/lib/download'
import { fmtDayTime } from '@/types/api'
import { humanize } from '@/lib/errors'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ orgId: number }>()
const { t } = useI18n()
const n = (x: number) => x.toLocaleString('fr-FR')

const from = ref('')
const to = ref('')
const busy = ref(false)
const progress = ref<{ got: number; total: number } | null>(null)
const result = ref<AuditCollected | null>(null)
const error = ref<string | null>(null)

async function exporter(format: 'csv' | 'json') {
  if (busy.value) return
  busy.value = true; error.value = null; result.value = null; progress.value = null
  try {
    const c = await collectAuditLog(props.orgId,
      { since: dayBound(from.value, 'start'), until: dayBound(to.value, 'end') },
      (got, total) => { progress.value = { got, total } })
    result.value = c
    if (format === 'csv') downloadCsv(auditFileName(props.orgId, c, 'csv'), auditCsv(c.calls))
    else saveBlob(auditFileName(props.orgId, c, 'json'), new Blob([auditJson(props.orgId, c)], { type: 'application/json' }))
  } catch (e) { error.value = humanize(e) }
  finally { busy.value = false; progress.value = null }
}
</script>

<template>
  <ConsoleCard :title="t('auditExport.title')" :sub="t('auditExport.sub')">
    <div class="ae">
      <label class="ae__f">{{ t('auditExport.from') }} <input v-model="from" type="date" class="inp sm" :disabled="busy" /></label>
      <label class="ae__f">{{ t('auditExport.to') }} <input v-model="to" type="date" class="inp sm" :disabled="busy" /></label>
      <span class="helptext ae__hint">{{ t('auditExport.emptyHint') }}</span>
      <div class="ae__act">
        <Btn kind="mini" icon="download" :disabled="busy" @click="exporter('csv')">{{ t('auditExport.csv') }}</Btn>
        <Btn kind="mini" :disabled="busy" @click="exporter('json')">{{ t('auditExport.json') }}</Btn>
      </div>
    </div>

    <p v-if="busy" class="helptext ae__line">
      {{ t('auditExport.running') }}<template v-if="progress"> {{ t('auditExport.progress', { got: n(progress.got), total: n(progress.total) }) }}</template>
    </p>
    <p v-else-if="error" class="helptext ae__line ae__line--ko">{{ error }}</p>
    <template v-else-if="result">
      <p v-if="result.total === 0" class="helptext ae__line">{{ t('auditExport.none') }}</p>
      <p v-else-if="result.complete" class="helptext ae__line ae__line--ok">
        {{ t('auditExport.complete', {
          total: n(result.total),
          since: result.since ? t('auditExport.since', { date: fmtDayTime(result.since) }) : t('auditExport.fromStart'),
          until: fmtDayTime(result.untilEffectif) }) }}
      </p>
      <p v-else class="helptext ae__line ae__line--ko">
        {{ t('auditExport.incomplete', { got: n(result.calls.length), total: n(result.total) }) }}
      </p>
    </template>
  </ConsoleCard>
</template>

<style scoped>
.ae { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.ae__f { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--color-mute); }
.ae__hint { margin: 0; }
.ae__act { margin-left: auto; display: flex; gap: 6px; }
.ae__line { margin: 12px 0 0; }
.ae__line--ok { color: var(--color-olive); }
.ae__line--ko { color: var(--color-terra-ink); }
</style>
