<script setup lang="ts">
// Onglet « transformations » d'une carte connecteur (redaction de champs, ADR 0015).
// Vue CENTRÉE SCHÉMA : on liste les champs que le connecteur peut émettre (schéma
// déclaré) et la transformation effective de chacun (politique de l'org, sinon défaut
// serveur). L'org_admin règle ; les autres voient en lecture seule. Le backend porte
// l'autz — l'UI masque seulement les contrôles.
import { computed } from 'vue'
import Tag from './Tag.vue'
import Btn from './Btn.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useFieldFilters } from '@/composables/useFieldFilters'
import { humanize } from '@/lib/errors'
import type { ConnectorFieldSchema, FieldActionSchema, FieldRule } from '@/types/api'

const props = defineProps<{
  service: string
  fields: ConnectorFieldSchema[]
  rules: FieldRule[]                 // effectives (org si customisé, sinon défaut serveur)
  actionSchema: FieldActionSchema[]
  customized: boolean
  orgId: number | null
  isOrgAdmin: boolean
}>()
const emit = defineEmits<{ (e: 'changed'): void }>()

const { toast } = useToast()
const { confirmAction } = usePrompt()
const { actionLabel, ruleSummary, promptRule, saveRules, clearService } = useFieldFilters()

const canEdit = computed(() => props.isOrgAdmin && props.orgId != null)

// Carte champ feuille (minuscule) → règle effective (miroir de FieldFilter._by_field).
const ruleByField = computed(() => {
  const m = new Map<string, FieldRule>()
  for (const r of props.rules) for (const f of r.fields) m.set(f.toLowerCase(), r)
  return m
})
function ruleFor(name: string): FieldRule | undefined { return ruleByField.value.get(name.toLowerCase()) }

// Champs sous règle mais ABSENTS du schéma déclaré → on les montre quand même (rien caché).
const declaredKeys = computed(() => new Set(props.fields.map((f) => f.name.toLowerCase())))
const extraFields = computed(() => {
  const out: string[] = []
  const seen = new Set<string>()
  for (const r of props.rules) for (const f of r.fields) {
    const k = f.toLowerCase()
    if (!declaredKeys.value.has(k) && !seen.has(k)) { seen.add(k); out.push(f) }
  }
  return out
})

const hasContent = computed(() => props.fields.length > 0 || extraFields.value.length > 0)

// Retire `name` de toutes les règles (vide → supprimée).
function withoutField(name: string): FieldRule[] {
  const k = name.toLowerCase()
  return props.rules
    .map((r) => ({ ...r, fields: r.fields.filter((f) => f.toLowerCase() !== k) }))
    .filter((r) => r.fields.length > 0)
}

async function persist(rules: FieldRule[]) {
  try {
    await saveRules(props.orgId!, props.service, rules)
    toast(`${props.service} : transformation enregistrée`)
    emit('changed')
  } catch (e) { toast(humanize(e)) }
}

// Édite/pose la transformation d'UN champ → normalise en règle mono-champ (split d'un
// éventuel défaut groupé). Base = règles effectives → l'écriture matérialise la politique d'org.
async function editField(name: string) {
  if (!canEdit.value) return
  const rule = await promptRule({
    actionSchema: props.actionSchema, service: props.service, existing: ruleFor(name), fixedField: name,
  })
  if (!rule) return
  const next = withoutField(name)
  next.push({ ...rule, fields: [name] })
  await persist(next)
}

async function clearField(name: string) {
  if (!canEdit.value || !ruleFor(name)) return
  if (!await confirmAction({ title: 'retirer la transformation', danger: true, confirmLabel: 'retirer',
    message: `${name} sera renvoyé tel quel.` })) return
  await persist(withoutField(name))
}

// Ajout d'une transformation sur un champ HORS schéma (saisie libre — FieldFilter matche tout nom).
async function addField() {
  if (!canEdit.value) return
  const rule = await promptRule({ actionSchema: props.actionSchema, service: props.service })
  if (!rule) return
  await persist([...props.rules, rule])
}

async function resetToDefault() {
  if (!canEdit.value) return
  if (!await confirmAction({ title: 'réinitialiser', confirmLabel: 'réinitialiser',
    message: `effacer la politique d'org pour ${props.service} et revenir au défaut serveur ?` })) return
  try {
    await clearService(props.orgId!, props.service)
    toast(`${props.service} : réinitialisé au défaut`)
    emit('changed')
  } catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="ct">
    <div class="ct-head">
      <span class="ct-prov">
        <Tag v-if="customized" tone="saffron">politique org</Tag>
        <Tag v-else tone="cobalt">défaut serveur</Tag>
      </span>
      <span v-if="canEdit" class="ct-actions">
        <Btn kind="mini" icon="plus" @click="addField">champ</Btn>
        <Btn v-if="customized" kind="mini" @click="resetToDefault">réinitialiser</Btn>
      </span>
    </div>

    <p v-if="orgId == null" class="dim ct-note">
      la redaction se règle au niveau d'une organisation — sélectionne une org active.
    </p>
    <p v-else-if="!hasContent" class="dim ct-note">
      aucun champ déclaré pour ce connecteur.<span v-if="canEdit"> ajoute une transformation sur un champ.</span>
    </p>

    <table v-else class="tbl ct-tbl">
      <thead><tr><th>champ</th><th>transformation</th><th>options</th><th v-if="canEdit" class="ct-act"></th></tr></thead>
      <tbody>
        <tr v-for="f in fields" :key="f.name">
          <td class="ct-field">
            <code class="mono">{{ f.name }}</code>
            <span v-if="f.label && f.label !== f.name" class="dim ct-label">{{ f.label }}</span>
            <Tag v-if="f.sensitive" tone="terra">sensible</Tag>
          </td>
          <td>
            <Tag v-if="ruleFor(f.name)" tone="ink">{{ actionLabel(actionSchema, ruleFor(f.name)!.action) }}</Tag>
            <span v-else class="dim">—</span>
          </td>
          <td class="dim ct-opt">{{ ruleFor(f.name) ? (ruleSummary(ruleFor(f.name)!) || '—') : '' }}</td>
          <td v-if="canEdit" class="ct-act">
            <Btn kind="mini" @click="editField(f.name)">{{ ruleFor(f.name) ? 'éditer' : 'transformer' }}</Btn>
            <Btn v-if="ruleFor(f.name)" kind="danger" @click="clearField(f.name)">retirer</Btn>
          </td>
        </tr>
        <tr v-for="name in extraFields" :key="'x-' + name">
          <td class="ct-field"><code class="mono">{{ name }}</code><span class="dim ct-label">hors schéma</span></td>
          <td><Tag tone="ink">{{ actionLabel(actionSchema, ruleFor(name)!.action) }}</Tag></td>
          <td class="dim ct-opt">{{ ruleSummary(ruleFor(name)!) || '—' }}</td>
          <td v-if="canEdit" class="ct-act">
            <Btn kind="mini" @click="editField(name)">éditer</Btn>
            <Btn kind="danger" @click="clearField(name)">retirer</Btn>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.ct { display: flex; flex-direction: column; gap: 8px; }
.ct-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ct-actions { display: flex; gap: 6px; }
.ct-note { font-size: 12px; margin: 4px 0; }
.ct-tbl { width: 100%; }
.ct-field { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ct-label { font-size: 11px; }
.ct-opt { font-size: 12px; }
.ct-act { text-align: right; white-space: nowrap; width: 150px; }
</style>
