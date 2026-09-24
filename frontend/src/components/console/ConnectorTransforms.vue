<script setup lang="ts">
// Onglet « rédaction » (org) / « confidentialité » (membre) d'une fiche connecteur —
// rédaction de champs, ADR 0015. LECTURE SEULE depuis oto#192 (12/09/2026) : la politique
// effective, champ par champ. Poser une règle et « tester le filtrage » ont quitté le
// dashboard (0 écriture et 0 test en 45 jours, internes compris) ; la rédaction reste
// appliquée à la frontière des tools (FieldRedactionMiddleware), et la route de lecture
// sert encore d'autres clients.
import { computed } from 'vue'
import Tag from './Tag.vue'
import { useFieldFilters } from '@/composables/useFieldFilters'
import type { ConnectorFieldSchema, FieldActionSchema, FieldRule } from '@/types/api'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{
  service: string
  fields: ConnectorFieldSchema[]
  rules: FieldRule[]                 // effectives (= politique d'org ; vide si rien posé)
  actionSchema: FieldActionSchema[]
  customized: boolean
  orgId: number | null
  // Note de portée (drawer USER, principe 9 du CDC connecteurs) — pilotée par
  // l'appelant : 'personal' (solo, aucun mot « org »), 'org-wide' (admin d'org
  // multi-membres), 'readonly' (membre non-admin). undefined = écran org.
  scopeNote?: 'personal' | 'org-wide' | 'readonly'
}>()

const { actionLabel, ruleSummary } = useFieldFilters()

// Champ feuille (minuscule) → règle effective.
const ruleByField = computed(() => {
  const m = new Map<string, FieldRule>()
  for (const r of props.rules) for (const f of r.fields) m.set(f.toLowerCase(), r)
  return m
})
function ruleFor(name: string): FieldRule | undefined { return ruleByField.value.get(name.toLowerCase()) }

// Lignes = champs déclarés ∪ champs déjà sous règle.
const rows = computed<ConnectorFieldSchema[]>(() => {
  const by = new Map<string, ConnectorFieldSchema>()
  for (const f of props.fields) by.set(f.name.toLowerCase(), f)
  for (const r of props.rules) for (const f of r.fields) if (!by.has(f.toLowerCase())) by.set(f.toLowerCase(), { name: f })
  return [...by.values()]
})
</script>

<template>
  <div class="ct">
    <div class="ct-head">
      <span class="ct-prov">
        <Tag v-if="customized" tone="saffron">{{ scopeNote === 'personal' ? t('connectorsUi.transforms.personalized') : t('connectorsUi.transforms.orgPolicy') }}</Tag>
        <Tag v-else-if="rules.length" tone="cobalt">{{ t('connectorsUi.transforms.serverDefault') }}</Tag>
        <span v-else class="dim">{{ t('connectorsUi.transforms.noRedaction') }}</span>
      </span>
    </div>

    <p v-if="scopeNote === 'personal'" class="dim ct-note">
      {{ t('connectorsUi.transforms.personal') }}
    </p>
    <p v-else-if="scopeNote === 'org-wide'" class="dim ct-note">
      {{ t('connectorsUi.transforms.orgWide') }}
    </p>
    <p v-else-if="scopeNote === 'readonly'" class="dim ct-note">
      {{ t('connectorsUi.transforms.readonly') }}
    </p>
    <p v-if="orgId == null" class="dim ct-note">
      {{ t('connectorsUi.transforms.noOrg') }}
    </p>
    <p v-else-if="!rows.length" class="dim ct-note">{{ t('connectorsUi.transforms.unknownSchema') }}</p>

    <table v-if="rows.length" class="tbl ct-tbl">
      <thead><tr><th>{{ t('connectorsUi.transforms.field') }}</th><th>{{ t('connectorsUi.transforms.treatment') }}</th></tr></thead>
      <tbody>
        <tr v-for="f in rows" :key="f.name">
          <td class="ct-field">
            <code class="mono">{{ f.name }}</code>
            <span v-if="f.label && f.label !== f.name" class="dim ct-label">{{ f.label }}</span>
            <Tag v-if="f.sensitive" tone="terra">{{ t('connectorsUi.transforms.sensitive') }}</Tag>
          </td>
          <td>
            <template v-if="ruleFor(f.name)">
              <Tag tone="ink">{{ actionLabel(actionSchema, ruleFor(f.name)!.action) }}</Tag>
              <span class="dim ct-opt">{{ ruleSummary(ruleFor(f.name)!) }}</span>
            </template>
            <span v-else class="dim">{{ t('connectorsUi.transforms.plain') }}</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.ct { display: flex; flex-direction: column; gap: 8px; }
.ct-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ct-note { font-size: 12px; margin: 4px 0; }
.ct-tbl { width: 100%; }
.ct-field { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ct-label { font-size: 11px; }
.ct-opt { font-size: 12px; margin-left: 6px; }
</style>
