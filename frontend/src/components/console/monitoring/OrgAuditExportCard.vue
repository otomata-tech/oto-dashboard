<script setup lang="ts">
// Exporter le journal des accès d'une org (otomata-tech/oto#269) — la pièce qu'un client
// produit devant un auditeur ou un délégué à la protection des données, et qu'un article
// d'engagement promet de fournir sur demande. Le backend la servait
// (`capabilities/audit_log.py`, `ORG_ADMIN_OF`) ; aucun écran ne la demandait.
//
// Ce que l'écran tient, et que le typecheck ne voit pas :
//
//   1. **Le fichier est la réponse servie, telle quelle** (JSON) : `total`, `count`,
//      `truncated`, `next_cursor`, `until_effectif` et les lignes, émetteur déclaré compris
//      (oto#187). Le backend ne sert pas de CSV ; une mise en forme ici perdrait les champs
//      qui attestent la complétude — une pièce qui ne dit pas si elle est complète
//      n'atteste de rien.
//   2. **La complétude se lit à l'écran**, avant même d'ouvrir le fichier : le total de la
//      fenêtre, ce qui a été téléchargé, complet ou tronqué, et la fenêtre réellement
//      appliquée (`until_effectif`, gelée au premier appel).
//   3. **Tronqué ⟹ le geste de la suite.** La page suivante part avec le SEUL curseur
//      servi, qui porte la fenêtre : le total ne bouge pas d'une page à l'autre, et la
//      concaténation des fichiers vaut exactement `total` lignes.
//   4. **Un refus se lit tel que le serveur l'a écrit** (`explain`) ; un curseur refusé
//      propose de repartir du début, le seul geste qui le corrige.
//
// Le droit n'est pas décidé ici : la carte ne se monte que dans la supervision d'org, que
// sa vue garde par `isOrgAdmin` (lecture `ORG_ADMIN_OF`, ouverte en consultation).
import { computed, ref, watch } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Notice from '@/components/console/Notice.vue'
import Btn from '@/components/console/Btn.vue'
import Tag from '@/components/console/Tag.vue'
import { ApiError } from '@/api'
import { getOrgAuditLogExport } from '@/api/console'
import { explain } from '@/lib/errors'
import { saveBlob } from '@/lib/download'
import type { AuditExport } from '@/types/api'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{ orgId: number }>()

// Période : deux jours civils, facultatifs, bornes INCLUSES (le jour de fin compte en
// entier). Vides = toute la rétention, jusqu'à l'instant du premier appel.
const du = ref('')
const au = ref('')

const premiere = ref<AuditExport | null>(null)   // porte le total et la fenêtre
const pages = ref(0)
const recues = ref(0)
const suite = ref<string | null>(null)
const emetteurs = ref<Record<string, number>>({})
const busy = ref(false)
const error = ref<string | null>(null)
const curseurRefuse = ref(false)

const periodeInvalide = computed(() => !!du.value && !!au.value && du.value > au.value)

function reinitialiser() {
  premiere.value = null
  pages.value = 0
  recues.value = 0
  suite.value = null
  emetteurs.value = {}
  error.value = null
  curseurRefuse.value = false
}
// Une autre période, ou une autre org, est un autre export : on ne mêle jamais leurs pages.
watch([du, au, () => props.orgId], reinitialiser)

// Un jour civil local → instant ISO. Début à 00:00, fin à 23:59:59.999 : « au 30 » inclut le 30.
const isoDebut = (d: string) => new Date(`${d}T00:00:00`).toISOString()
const isoFin = (d: string) => new Date(`${d}T23:59:59.999`).toISOString()

// Nom de fichier : l'org, la borne haute appliquée, le rang de la page — une suite de
// fichiers qui se range seule et ne s'écrase pas.
function nomFichier(res: AuditExport, page: number): string {
  const borne = res.until_effectif.replace(/[^0-9]/g, '').slice(0, 14)
  return `journal-acces-org-${res.org_id}-${borne}-p${page}.json`
}

function emetteur(c: AuditExport['calls'][number]): string {
  if (!c.client_name) return t('monitoringUi.audit.undeclared')
  const nom = c.client_version ? `${c.client_name} ${c.client_version}` : c.client_name
  return c.token_kind ? t('monitoringUi.audit.token', { name: nom, kind: c.token_kind }) : nom
}

async function exporter(cursor?: string) {
  if (busy.value || periodeInvalide.value) return
  busy.value = true
  error.value = null
  curseurRefuse.value = false
  try {
    const res = await getOrgAuditLogExport(props.orgId, cursor
      ? { cursor }
      : { since: du.value ? isoDebut(du.value) : undefined, until: au.value ? isoFin(au.value) : undefined })
    if (!cursor) reinitialiser()
    const page = pages.value + 1
    saveBlob(nomFichier(res, page),
      new Blob([JSON.stringify(res, null, 2)], { type: 'application/json;charset=utf-8' }))
    if (!cursor) premiere.value = res
    pages.value = page
    recues.value += res.count
    suite.value = res.next_cursor ?? null
    const vus = { ...emetteurs.value }
    for (const c of res.calls) vus[emetteur(c)] = (vus[emetteur(c)] ?? 0) + 1
    emetteurs.value = vus
  } catch (e) {
    error.value = explain(e)
    curseurRefuse.value = !!cursor && e instanceof ApiError
      && (e.code === 'invalid_cursor' || e.code === 'window_with_cursor')
  } finally {
    busy.value = false
  }
}

const complet = computed(() => premiere.value != null && suite.value == null)
// L'instant tel que le serveur l'a appliqué, lu à l'heure locale ; illisible → tel quel.
function instant(v: string): string {
  const d = new Date(/(?:Z|[+-]\d\d:?\d\d)$/.test(v) ? v : `${v.replace(' ', 'T')}Z`)
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString('fr-FR')
}
const fenetre = computed(() => {
  const p = premiere.value
  if (!p) return ''
  const fin = instant(p.until_effectif)
  return p.since ? t('monitoringUi.audit.window', { since: instant(p.since), until: fin }) : t('monitoringUi.audit.windowAll', { until: fin })
})
const listeEmetteurs = computed(() =>
  Object.entries(emetteurs.value).sort((a, b) => b[1] - a[1]))
</script>

<template>
  <ConsoleCard :title="t('monitoringUi.audit.title')"
    :sub="t('monitoringUi.audit.sub')">
    <div class="ae-form">
      <label class="ae-field">
        <span>{{ t('monitoringUi.audit.from_') }}</span>
        <input v-model="du" type="date" class="inp sm" :max="au || undefined" />
      </label>
      <label class="ae-field">
        <span>{{ t('monitoringUi.audit.to') }}</span>
        <input v-model="au" type="date" class="inp sm" :min="du || undefined" />
      </label>
      <Btn icon="download" :disabled="busy || periodeInvalide" @click="exporter()">
        {{ busy && pages === 0 ? t('monitoringUi.audit.exporting') : t('monitoringUi.audit.export') }}
      </Btn>
    </div>
    <p v-if="periodeInvalide" class="helptext ae-err">{{ t('monitoringUi.audit.badPeriod') }}</p>
    <p v-else class="helptext">
      {{ t('monitoringUi.audit.noDate') }}
    </p>

    <Notice v-if="error" tone="warn">
      {{ t('monitoringUi.audit.failed', { error }) }}
      <Btn v-if="curseurRefuse" kind="link" class="ae-fix" @click="exporter()">{{ t('monitoringUi.audit.restart') }}</Btn>
    </Notice>

    <div v-if="premiere" class="ae-bilan">
      <div class="ae-ligne">
        <Tag :tone="complet ? 'olive' : 'saffron'">{{ complet ? t('monitoringUi.audit.complete') : t('monitoringUi.audit.truncated') }}</Tag>
        <i18n-t keypath="monitoringUi.audit.got" tag="span"><template #got><b class="mono">{{ recues }}</b></template><template #total><b class="mono">{{ premiere.total }}</b></template><template #pages>{{ pages }}</template></i18n-t>
      </div>
      <div class="ae-ligne dim">{{ t('monitoringUi.audit.applied', { window: fenetre }) }}</div>
      <div v-if="suite" class="ae-ligne">
        <span>{{ t('monitoringUi.audit.remaining', { n: premiere.total - recues }) }}</span>
        <Btn kind="mini" icon="download" :disabled="busy" @click="exporter(suite)">
          {{ busy ? t('monitoringUi.audit.exporting') : t('monitoringUi.audit.next') }}
        </Btn>
      </div>
      <div v-else-if="premiere.total === 0" class="ae-ligne dim">
        {{ t('monitoringUi.audit.empty') }}
      </div>
      <div v-if="listeEmetteurs.length" class="ae-ligne dim">
        {{ t('monitoringUi.audit.issuers') }}
        <span v-for="([nom, n], i) in listeEmetteurs" :key="nom" class="mono">{{ i ? ' · ' : ' ' }}{{ nom }} ({{ n }})</span>
      </div>
    </div>
  </ConsoleCard>
</template>

<style scoped>
.ae-form { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
.ae-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--color-mute); }
.ae-err { color: var(--color-terra-ink); }
.ae-fix { margin-left: 6px; color: inherit; text-decoration: underline; text-underline-offset: 2px; }
.ae-bilan { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; font-size: 13px; }
.ae-ligne { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
</style>
