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

const props = defineProps<{ orgId: number }>()

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
  <ConsoleCard title="journal des accès"
    sub="les appels d'outils faits par les agents sous cette org, avec qui, quand, et le résultat — la pièce à produire pour un audit. conservé 90 jours ; les gestes faits dans ce tableau de bord n'y figurent pas.">
    <div class="ae">
      <label class="ae__f">du <input v-model="from" type="date" class="inp sm" :disabled="busy" /></label>
      <label class="ae__f">au <input v-model="to" type="date" class="inp sm" :disabled="busy" /></label>
      <span class="helptext ae__hint">vide = tout ce qui est conservé</span>
      <div class="ae__act">
        <Btn kind="mini" icon="download" :disabled="busy" @click="exporter('csv')">exporter en CSV</Btn>
        <Btn kind="mini" :disabled="busy" @click="exporter('json')">en JSON</Btn>
      </div>
    </div>

    <p v-if="busy" class="helptext ae__line">
      export en cours…<template v-if="progress"> {{ progress.got.toLocaleString('fr-FR') }} / {{ progress.total.toLocaleString('fr-FR') }} appels</template>
    </p>
    <p v-else-if="error" class="helptext ae__line ae__line--ko">{{ error }}</p>
    <template v-else-if="result">
      <p v-if="result.total === 0" class="helptext ae__line">
        aucun appel dans cette fenêtre. le journal est conservé 90 jours : une période plus ancienne est vide, pas inactive.
      </p>
      <p v-else-if="result.complete" class="helptext ae__line ae__line--ok">
        ✓ {{ result.total.toLocaleString('fr-FR') }} appels exportés,
        {{ result.since ? `du ${fmtDayTime(result.since)}` : 'depuis le début du journal' }}
        au {{ fmtDayTime(result.untilEffectif) }} — export complet.
      </p>
      <p v-else class="helptext ae__line ae__line--ko">
        ⚠ {{ result.calls.length.toLocaleString('fr-FR') }} lignes reçues pour {{ result.total.toLocaleString('fr-FR') }} annoncées :
        l'export est incomplet, ne le produis pas tel quel — relance-le.
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
