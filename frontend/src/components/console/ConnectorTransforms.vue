<script setup lang="ts">
// Onglet « transformations » d'une carte connecteur (rédaction de champs, ADR 0015).
// Vue CENTRÉE SCHÉMA : on liste les champs que le connecteur peut émettre (schéma
// déclaré) et la transformation effective de chacun (politique de l'org, sinon défaut
// serveur). L'org_admin règle ; les autres voient en lecture seule. Le backend porte
// l'autz — l'UI masque seulement les contrôles. La rédaction elle-même est appliquée
// à la frontière des tools (FieldRedactionMiddleware), pas côté client.
import { computed, ref } from 'vue'
import Tag from './Tag.vue'
import Btn from './Btn.vue'
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

// Connecteurs « recrutement » : le défaut serveur = anonymisation candidat (cf. backend
// field_filter_defaults). On en donne une lecture en clair plutôt qu'une table de variants.
const RECRUITMENT = new Set(['unipile', 'ashby', 'greenhouse', 'lever', 'recruitee', 'teamtailor'])
const candidateDefault = computed(() => RECRUITMENT.has(props.service) && !props.customized && props.rules.length > 0)

// Carte champ feuille (minuscule) → règle effective (miroir de FieldFilter._by_field).
const ruleByField = computed(() => {
  const m = new Map<string, FieldRule>()
  for (const r of props.rules) for (const f of r.fields) m.set(f.toLowerCase(), r)
  return m
})
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

// --- éditeur (modale dédiée) -------------------------------------------------
const editor = ref<{ fixedField: string | null; existing: FieldRule | null } | null>(null)
function openEditor(fixedField: string | null) {
  if (!canEdit.value) return
  editor.value = { fixedField, existing: fixedField ? ruleFor(fixedField) ?? null : null }
}
async function onSave(rule: FieldRule) {
  const ed = editor.value
  editor.value = null
  if (!ed) return
  const next = ed.fixedField
    ? [...withoutField(ed.fixedField), { ...rule, fields: [ed.fixedField] }]
    : [...props.rules, rule]
  await persist(next)
}

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

// « voir en clair » = lever la transformation d'un champ (l'org override le défaut).
async function revealField(name: string) {
  if (!canEdit.value || !ruleFor(name)) return
  if (!await confirmAction({ title: 'voir en clair', danger: true, confirmLabel: 'voir en clair',
    message: `Claude verra « ${name} » en clair (transformation retirée).` })) return
  await persist(withoutField(name))
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
      <span v-if="canEdit" class="ct-actions">
        <Btn kind="mini" icon="plus" @click="openEditor(null)">champ</Btn>
        <Btn v-if="customized" kind="mini" @click="resetToDefault">tout réinitialiser</Btn>
      </span>
    </div>

    <p v-if="orgId == null" class="dim ct-note">
      la rédaction se règle au niveau d'une organisation — sélectionne une org active.
    </p>
    <p v-else-if="!hasContent" class="dim ct-note">
      aucun champ déclaré pour ce connecteur.<span v-if="canEdit"> ajoute une transformation sur un champ.</span>
    </p>

    <!-- Lecture en clair de l'anonymisation candidat (défaut recrutement). -->
    <p v-if="candidateDefault" class="ct-cand">
      <Tag tone="terra">anonymisation candidat</Tag>
      l'identité est masquée par défaut avant que Claude voie le profil — règle ci-dessous,
      champ par champ (<em>voir en clair</em> pour ré-exposer).
    </p>

    <table v-if="hasContent" class="tbl ct-tbl">
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
            <span v-else class="dim">en clair</span>
          </td>
          <td class="dim ct-opt">{{ ruleFor(f.name) ? (ruleSummary(ruleFor(f.name)!) || '—') : '' }}</td>
          <td v-if="canEdit" class="ct-act">
            <Btn kind="mini" @click="openEditor(f.name)">{{ ruleFor(f.name) ? 'éditer' : 'transformer' }}</Btn>
            <Btn v-if="ruleFor(f.name)" kind="danger" @click="revealField(f.name)">voir en clair</Btn>
          </td>
        </tr>
        <tr v-for="name in extraFields" :key="'x-' + name">
          <td class="ct-field"><code class="mono">{{ name }}</code><span class="dim ct-label">hors schéma</span></td>
          <td><Tag tone="ink">{{ actionLabel(actionSchema, ruleFor(name)!.action) }}</Tag></td>
          <td class="dim ct-opt">{{ ruleSummary(ruleFor(name)!) || '—' }}</td>
          <td v-if="canEdit" class="ct-act">
            <Btn kind="mini" @click="openEditor(name)">éditer</Btn>
            <Btn kind="danger" @click="revealField(name)">voir en clair</Btn>
          </td>
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
.ct-field { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ct-label { font-size: 11px; }
.ct-opt { font-size: 12px; }
.ct-act { text-align: right; white-space: nowrap; width: 170px; }
</style>
