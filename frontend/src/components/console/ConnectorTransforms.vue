<script setup lang="ts">
// Onglet « transformations » d'une carte connecteur (rédaction de champs, ADR 0015).
// Vue CENTRÉE SCHÉMA : on liste les champs que le connecteur peut émettre (schéma
// déclaré) et, par champ, un interrupteur actif/en-clair + l'édition de la transformation.
// La politique d'org écrase le défaut serveur (basculer un champ = matérialiser cette
// politique). L'org_admin règle ; les autres voient en lecture seule. Le backend porte
// l'autz ; la rédaction est appliquée à la frontière des tools (FieldRedactionMiddleware).
import { computed, ref } from 'vue'
import Tag from './Tag.vue'
import Btn from './Btn.vue'
import Toggle from './Toggle.vue'
import FieldRuleDialog from './FieldRuleDialog.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useFieldFilters } from '@/composables/useFieldFilters'
import { humanize } from '@/lib/errors'
import type { ConnectorFieldSchema, FieldActionSchema, FieldRule } from '@/types/api'

const props = defineProps<{
  service: string
  fields: ConnectorFieldSchema[]
  rules: FieldRule[]                 // effectives (org si customisé, sinon défaut serveur)
  defaultRules?: FieldRule[]         // défaut serveur (pour restaurer l'action au ON)
  actionSchema: FieldActionSchema[]
  customized: boolean
  orgId: number | null
  isOrgAdmin: boolean
  readonly?: boolean        // carte user = rédaction en lecture seule (édition au niveau org)
}>()
const emit = defineEmits<{ (e: 'changed'): void }>()

const { toast } = useToast()
const { confirmAction } = usePrompt()
const { actionLabel, ruleSummary, saveRules, clearService } = useFieldFilters()

const canEdit = computed(() => !props.readonly && props.isOrgAdmin && props.orgId != null)

const RECRUITMENT = new Set(['unipile', 'ashby', 'greenhouse', 'lever', 'recruitee', 'teamtailor'])
const candidateDefault = computed(() => RECRUITMENT.has(props.service) && !props.customized && props.rules.length > 0)

// Carte champ feuille (minuscule) → règle effective / règle par défaut serveur.
function indexRules(rules: FieldRule[]): Map<string, FieldRule> {
  const m = new Map<string, FieldRule>()
  for (const r of rules) for (const f of r.fields) m.set(f.toLowerCase(), r)
  return m
}
const ruleByField = computed(() => indexRules(props.rules))
const defaultByField = computed(() => indexRules(props.defaultRules ?? []))
function ruleFor(name: string): FieldRule | undefined { return ruleByField.value.get(name.toLowerCase()) }

// Champs sous règle mais ABSENTS du schéma déclaré → montrés seulement pour une POLITIQUE
// d'org (un défaut serveur liste ses variantes de clés en interne — non pertinent à l'écran).
const declaredKeys = computed(() => new Set(props.fields.map((f) => f.name.toLowerCase())))
const extraFields = computed(() => {
  if (!props.customized) return []
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
    emit('changed')
  } catch (e) { toast(humanize(e)) }
}

// Interrupteur actif/en-clair par champ.
async function toggleField(name: string, on: boolean) {
  if (!canEdit.value) return
  if (on) {
    // ON → applique la règle par défaut du champ si connue, sinon un masque simple.
    const d = defaultByField.value.get(name.toLowerCase())
    const rule: FieldRule = d ? { ...d, fields: [name] } : { fields: [name], action: 'mask' }
    await persist([...withoutField(name), rule])
    toast(`${name} : retraité`)
  } else {
    // OFF → l'org voit le champ en clair (override du défaut serveur).
    await persist(withoutField(name))
    toast(`${name} : en clair`)
  }
}

// --- éditeur (modale dédiée) : règle finement l'action/params d'un champ ---------
const editor = ref<{ fixedField: string; existing: FieldRule | null } | null>(null)
function editField(name: string) {
  if (!canEdit.value) return
  editor.value = { fixedField: name, existing: ruleFor(name) ?? null }
}
async function onSave(rule: FieldRule) {
  const ed = editor.value
  editor.value = null
  if (!ed) return
  await persist([...withoutField(ed.fixedField), { ...rule, fields: [ed.fixedField] }])
}

async function resetToDefault() {
  if (!canEdit.value) return
  if (!await confirmAction({ title: 'tout réinitialiser', confirmLabel: 'réinitialiser',
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
      <span v-if="canEdit && customized" class="ct-actions">
        <Btn kind="mini" @click="resetToDefault">tout réinitialiser</Btn>
      </span>
    </div>

    <p v-if="orgId == null" class="dim ct-note">
      la rédaction se règle au niveau d'une organisation — sélectionne une org active.
    </p>
    <p v-else-if="!hasContent" class="dim ct-note">aucun champ déclaré pour ce connecteur.</p>

    <p v-if="candidateDefault" class="ct-cand">
      <Tag tone="terra">anonymisation candidat</Tag>
      l'identité est masquée par défaut avant que Claude voie le profil — bascule un champ
      sur <em>en clair</em> pour le ré-exposer.
    </p>

    <table v-if="hasContent" class="tbl ct-tbl">
      <thead><tr>
        <th>champ</th><th class="ct-state">état</th><th>traitement</th><th v-if="canEdit" class="ct-act"></th>
      </tr></thead>
      <tbody>
        <tr v-for="f in fields" :key="f.name">
          <td class="ct-field">
            <code class="mono">{{ f.name }}</code>
            <span v-if="f.label && f.label !== f.name" class="dim ct-label">{{ f.label }}</span>
            <Tag v-if="f.sensitive" tone="terra">sensible</Tag>
          </td>
          <td class="ct-state">
            <Toggle :on="!!ruleFor(f.name)" :disabled="!canEdit" @change="(v) => toggleField(f.name, v)" />
          </td>
          <td>
            <template v-if="ruleFor(f.name)">
              <Tag tone="ink">{{ actionLabel(actionSchema, ruleFor(f.name)!.action) }}</Tag>
              <span class="dim ct-opt">{{ ruleSummary(ruleFor(f.name)!) }}</span>
            </template>
            <span v-else class="dim">en clair</span>
          </td>
          <td v-if="canEdit" class="ct-act">
            <Btn kind="mini" @click="editField(f.name)">éditer</Btn>
          </td>
        </tr>
        <tr v-for="name in extraFields" :key="'x-' + name">
          <td class="ct-field"><code class="mono">{{ name }}</code><span class="dim ct-label">hors schéma</span></td>
          <td class="ct-state">
            <Toggle :on="!!ruleFor(name)" :disabled="!canEdit" @change="(v) => toggleField(name, v)" />
          </td>
          <td>
            <Tag tone="ink">{{ actionLabel(actionSchema, ruleFor(name)!.action) }}</Tag>
            <span class="dim ct-opt">{{ ruleSummary(ruleFor(name)!) }}</span>
          </td>
          <td v-if="canEdit" class="ct-act"><Btn kind="mini" @click="editField(name)">éditer</Btn></td>
        </tr>
      </tbody>
    </table>

    <FieldRuleDialog
      :open="editor != null"
      :service="service"
      :action-schema="actionSchema"
      :existing="editor?.existing ?? null"
      :fixed-field="editor?.fixedField ?? null"
      @save="onSave"
      @close="editor = null"
    />
  </div>
</template>

<style scoped>
.ct { display: flex; flex-direction: column; gap: 8px; }
.ct-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ct-actions { display: flex; gap: 6px; }
.ct-note { font-size: 12px; margin: 4px 0; }
.ct-cand {
  font-size: 12px; line-height: 1.5; margin: 0; padding: 8px 10px;
  display: flex; align-items: baseline; gap: 7px; flex-wrap: wrap;
  background: var(--color-paper-2); border: 1px solid var(--color-hair-soft); border-radius: 9px;
  color: var(--color-ink-soft);
}
.ct-cand em { font-style: italic; color: var(--color-ink); }
.ct-tbl { width: 100%; }
.ct-state { width: 56px; }
.ct-field { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ct-label { font-size: 11px; }
.ct-opt { font-size: 12px; margin-left: 6px; }
.ct-act { text-align: right; white-space: nowrap; width: 90px; }
</style>
