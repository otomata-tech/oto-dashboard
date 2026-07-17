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
import RedactionPreview from './RedactionPreview.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useFieldFilters } from '@/composables/useFieldFilters'
import { humanize } from '@/lib/errors'
import type { ConnectorFieldSchema, FieldActionSchema, FieldFilterTemplate, FieldRule } from '@/types/api'

const props = defineProps<{
  service: string
  fields: ConnectorFieldSchema[]
  rules: FieldRule[]                 // effectives (= politique d'org ; vide si rien posé)
  defaultRules?: FieldRule[]         // (héritage) défaut serveur — vide désormais
  templates?: Record<string, FieldFilterTemplate>  // jeux applicables en 1 clic
  actionSchema: FieldActionSchema[]
  customized: boolean
  orgId: number | null
  isOrgAdmin: boolean
  readonly?: boolean        // carte user = rédaction en lecture seule (édition au niveau org)
  // Note de portée (drawer USER, principe 9 du CDC connecteurs) — pilotée par
  // l'appelant : 'personal' (solo, aucun mot « org »), 'org-wide' (admin d'org
  // multi-membres), 'readonly' (membre non-admin). undefined = écran org inchangé.
  scopeNote?: 'personal' | 'org-wide' | 'readonly'
}>()
const emit = defineEmits<{ (e: 'changed'): void }>()

const { toast } = useToast()
const { confirmAction } = usePrompt()
const { actionLabel, ruleSummary, saveRules, clearService } = useFieldFilters()

const canEdit = computed(() => !props.readonly && props.isOrgAdmin && props.orgId != null)

// Modèles applicables en 1 clic (ex. « anonymisation candidat ») — proposés tant que
// l'org n'a pas de politique. Rien n'est appliqué par défaut.
const templateList = computed(() => Object.entries(props.templates ?? {}).map(([key, t]) => ({ key, ...t })))

// Carte champ feuille (minuscule) → règle effective / règle par défaut serveur.
function indexRules(rules: FieldRule[]): Map<string, FieldRule> {
  const m = new Map<string, FieldRule>()
  for (const r of rules) for (const f of r.fields) m.set(f.toLowerCase(), r)
  return m
}
const ruleByField = computed(() => indexRules(props.rules))
const defaultByField = computed(() => indexRules(props.defaultRules ?? []))
function ruleFor(name: string): FieldRule | undefined { return ruleByField.value.get(name.toLowerCase()) }

// Clés RÉELLES observées via le dry-run (RedactionPreview) → le schéma d'un connecteur
// se découvre depuis une vraie réponse, pas une liste devinée.
const observed = ref<string[]>([])
function onObserved(keys: string[]) { observed.value = keys }

// Lignes du schéma = champs déclarés ∪ clés observées (dry-run) ∪ champs déjà sous règle.
const rows = computed<ConnectorFieldSchema[]>(() => {
  const by = new Map<string, ConnectorFieldSchema>()
  for (const f of props.fields) by.set(f.name.toLowerCase(), f)
  for (const k of observed.value) if (!by.has(k.toLowerCase())) by.set(k.toLowerCase(), { name: k })
  for (const r of props.rules) for (const f of r.fields) if (!by.has(f.toLowerCase())) by.set(f.toLowerCase(), { name: f })
  return [...by.values()]
})
const hasContent = computed(() => rows.value.length > 0)

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

async function applyTemplate(t: { label: string; rules: FieldRule[] }) {
  if (!canEdit.value) return
  await persist(t.rules)
  toast(`${props.service} : « ${t.label} » appliqué`)
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
const editor = ref<{ fixedField: string | null; existing: FieldRule | null } | null>(null)
const showPreview = ref(false)
function editField(name: string) {
  if (!canEdit.value) return
  editor.value = { fixedField: name, existing: ruleFor(name) ?? null }
}
function addField() {
  // champ libre (ex. une clé repérée dans le dry-run) — saisie des champs dans la modale.
  if (!canEdit.value) return
  editor.value = { fixedField: null, existing: null }
}
async function onSave(rule: FieldRule) {
  const ed = editor.value
  editor.value = null
  if (!ed) return
  if (ed.fixedField) {
    await persist([...withoutField(ed.fixedField), { ...rule, fields: [ed.fixedField] }])
  } else {
    await persist([...props.rules, rule])   // ajout d'un champ libre (rule porte déjà ses fields)
  }
}

async function resetToDefault() {
  if (!canEdit.value) return
  if (!await confirmAction({ title: 'tout réinitialiser', confirmLabel: 'Réinitialiser',
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
        <Tag v-if="customized" tone="saffron">{{ scopeNote === 'personal' ? 'personnalisé' : 'politique org' }}</Tag>
        <Tag v-else-if="rules.length" tone="cobalt">défaut serveur</Tag>
        <span v-else class="dim">aucune rédaction</span>
      </span>
      <span v-if="canEdit" class="ct-actions">
        <Btn kind="mini" icon="plus" @click="addField">Champ</Btn>
        <Btn v-if="customized" kind="mini" @click="resetToDefault">Tout réinitialiser</Btn>
      </span>
    </div>

    <p v-if="scopeNote === 'personal'" class="dim ct-note">
      ce connecteur ne transmettra pas ces champs à ton agent.
    </p>
    <p v-else-if="scopeNote === 'org-wide'" class="dim ct-note">
      s'applique à toute ton org — ce n'est pas un réglage perso.
    </p>
    <p v-else-if="scopeNote === 'readonly'" class="dim ct-note">
      défini par ton org — lecture seule.
    </p>
    <p v-if="orgId == null" class="dim ct-note">
      la rédaction se règle au niveau d'une organisation — sélectionne une org active.
    </p>
    <p v-else-if="!hasContent" class="dim ct-note">
      schéma inconnu pour ce connecteur.<span v-if="canEdit"> <strong>teste le filtrage</strong>
      ci-dessous avec une vraie réponse pour charger son schéma, applique un modèle, ou ajoute un champ.</span>
    </p>

    <!-- Modèles 1-clic (rien appliqué par défaut) — tant que pas de politique d'org. -->
    <div v-if="canEdit && !customized && templateList.length" class="ct-tpl">
      <span class="dim">modèles :</span>
      <Btn v-for="t in templateList" :key="t.key" kind="mini" :title="t.hint" @click="applyTemplate(t)">
        {{ t.label }}
      </Btn>
    </div>

    <table v-if="hasContent" class="tbl ct-tbl">
      <thead><tr>
        <th>champ</th><th class="ct-state">état</th><th>traitement</th><th v-if="canEdit" class="ct-act"></th>
      </tr></thead>
      <tbody>
        <tr v-for="f in rows" :key="f.name">
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
            <Btn kind="mini" @click="editField(f.name)">Éditer</Btn>
          </td>
        </tr>
      </tbody>
    </table>

    <button v-if="orgId != null" class="ct-prevtoggle" @click="showPreview = !showPreview">
      {{ showPreview ? '▾' : '▸' }} tester le filtrage (dry-run)
    </button>
    <RedactionPreview v-if="showPreview && orgId != null" :org-id="orgId" :service="service" :rules="rules"
      @observed="onObserved" />

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
.ct-tpl { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px; }
.ct-tbl { width: 100%; }
.ct-state { width: 56px; }
.ct-field { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ct-label { font-size: 11px; }
.ct-opt { font-size: 12px; margin-left: 6px; }
.ct-act { text-align: right; white-space: nowrap; width: 90px; }
.ct-prevtoggle { background: none; border: 0; padding: 6px 0 0; cursor: pointer;
  font-size: 12px; color: var(--color-cobalt-ink); font-weight: 600; text-align: left; }
</style>
