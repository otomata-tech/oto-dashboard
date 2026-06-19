<script setup lang="ts">
// Redaction de champs par connecteur (ADR 0015). L'org_admin règle, par service,
// comment les champs sensibles des réponses sont redactés avant d'atteindre
// l'agent (masque, pseudonyme cohérent, généralisation, hash, suppression).
// La politique d'org est autoritaire ; sans politique, repli sur le défaut serveur.
// Le backend porte l'autz (org_admin) — l'UI ne fait que masquer les contrôles.
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useMe } from '@/composables/useMe'
import { getOrgFieldFilters, setOrgFieldFilter } from '@/api/console'
import type { FieldFiltersBundle, FieldRule, FieldActionSchema } from '@/types/api'
import { humanize } from '@/lib/errors'

const { toast } = useToast()
const { confirmAction, promptForm, promptText } = usePrompt()
const { me } = useMe()

const bundle = ref<FieldFiltersBundle | null>(null)
const error = ref<string | null>(null)
const loaded = ref(false)

const activeOrgId = computed(() => me.value?.active_org ?? null)
const isOrgAdmin = computed(() => me.value?.org_role === 'org_admin' || me.value?.role === 'admin')

// Tous les connecteurs à afficher : ceux configurés par l'org + ceux qui ont un
// défaut serveur. (Union, triée.)
const services = computed(() => {
  const b = bundle.value
  if (!b) return []
  return Array.from(new Set([...Object.keys(b.filters), ...Object.keys(b.defaults)])).sort()
})

async function load() {
  if (activeOrgId.value == null) { loaded.value = true; return }
  try { bundle.value = await getOrgFieldFilters(activeOrgId.value) }
  catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
}
onMounted(load)

// La politique d'org prime ; sinon on montre le défaut serveur (en lecture).
function isCustomized(service: string) { return !!bundle.value?.filters[service] }
function rulesOf(service: string): FieldRule[] {
  const b = bundle.value
  if (!b) return []
  return (b.filters[service]?.rules ?? b.defaults[service]?.rules ?? []) as FieldRule[]
}
function schemaFor(action: string): FieldActionSchema | undefined {
  return bundle.value?.schema.find(s => s.action === action)
}
function actionLabel(action: string) { return schemaFor(action)?.label ?? action }

// Résumé compact d'une règle pour la table.
function ruleSummary(r: FieldRule): string {
  const parts: string[] = []
  if (r.action === 'mask') {
    if (r.preserve) parts.push(`format ${r.preserve}`)
    if (r.keep_last) parts.push(`garde ${r.keep_last} derniers`)
    if (r.keep_first) parts.push(`garde ${r.keep_first} premiers`)
  } else if (r.action === 'pseudonym' && r.kind) parts.push(r.kind)
  else if (r.action === 'generalize') { if (r.to) parts.push(r.to); if (r.step) parts.push(`pas ${r.step}`) }
  return parts.join(' · ')
}

async function save(service: string, rules: FieldRule[] | null) {
  try {
    await setOrgFieldFilter(activeOrgId.value!, service, rules)
    toast(rules === null ? `${service} : réinitialisé au défaut` : `${service} : politique enregistrée`)
    await load()
  } catch (e) { toast(humanize(e)) }
}

// Construit une règle depuis les valeurs du formulaire (params selon l'action).
function buildRule(fieldsStr: string, action: string, extra: Record<string, string>): FieldRule {
  const fields = fieldsStr.split(/[\s,]+/).map(s => s.trim()).filter(Boolean)
  const rule: FieldRule = { fields, action: action as FieldRule['action'] }
  const bag = rule as unknown as Record<string, unknown>
  for (const p of schemaFor(action)?.params ?? []) {
    const v = (extra[p.key] ?? '').trim()
    if (!v) continue
    if (p.type === 'int') { const n = parseInt(v, 10); if (!Number.isNaN(n)) bag[p.key] = n }
    else bag[p.key] = v
  }
  return rule
}

// Édition en 2 temps : (champs + action), puis les paramètres de l'action choisie.
async function editRule(service: string, existing?: FieldRule, idx?: number) {
  if (!bundle.value) return
  const base = await promptForm({
    title: existing ? 'modifier la règle' : 'nouvelle règle de redaction',
    description: `connecteur : ${service}`,
    fields: [
      { key: 'fields', label: 'champs (séparés par virgule ou espace)', required: true,
        value: existing?.fields.join(', '), placeholder: 'iban, bic, email' },
      { key: 'action', label: 'action', type: 'select', value: existing?.action ?? 'mask',
        options: bundle.value.schema.map(s => ({ value: s.action, label: s.label })) },
    ],
    submitLabel: 'suivant',
  })
  if (!base || !base.fields) return
  const action = base.action || 'mask'
  const ex = existing as unknown as Record<string, unknown> | undefined
  const params = schemaFor(action)?.params ?? []
  let extra: Record<string, string> = {}
  if (params.length) {
    const r2 = await promptForm({
      title: actionLabel(action),
      description: 'options — laisser vide = défaut du mode.',
      fields: params.map(p => p.type === 'select'
        ? { key: p.key, label: p.label, type: 'select' as const,
            value: String(ex?.[p.key] ?? p.options?.[0] ?? ''),
            options: (p.options ?? []).map(o => ({ value: o, label: o || '—' })) }
        : { key: p.key, label: p.label,
            value: ex?.[p.key] != null ? String(ex[p.key]) : '',
            placeholder: 'nombre' }),
      submitLabel: 'enregistrer',
    })
    if (!r2) return
    extra = r2
  }
  const rule = buildRule(base.fields, action, extra)
  const rules = [...rulesOf(service)]
  if (idx != null) rules[idx] = rule; else rules.push(rule)
  await save(service, rules)
}

async function deleteRule(service: string, idx: number) {
  if (!await confirmAction({ title: 'supprimer la règle', danger: true, confirmLabel: 'supprimer',
    message: 'retirer cette règle de redaction ?' })) return
  const rules = rulesOf(service).filter((_, i) => i !== idx)
  await save(service, rules)
}

async function resetService(service: string) {
  if (!await confirmAction({ title: 'réinitialiser', confirmLabel: 'réinitialiser',
    message: `effacer la politique d'org pour ${service} et revenir au défaut serveur ?` })) return
  await save(service, null)
}

async function addConnector() {
  const name = await promptText('connecteur', { label: 'nom du service', placeholder: 'folk, pennylane, silae…' })
  const service = (name || '').trim().toLowerCase()
  if (!service) return
  await editRule(service)
}
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <ConsoleCard v-if="loaded && activeOrgId == null" title="aucune org active">
      <div class="helptext">la redaction de champs se règle au niveau d'une organisation — rejoins ou crée-en une.</div>
    </ConsoleCard>

    <template v-else-if="bundle">
      <ConsoleCard title="field redaction"
        sub="par connecteur, comment les champs sensibles sont redactés avant d'atteindre l'agent. la politique de l'org prime ; sans politique, le défaut serveur s'applique.">
        <template #actions>
          <Btn v-if="isOrgAdmin" kind="mini" icon="plus" @click="addConnector">connecteur</Btn>
        </template>
        <div v-if="!services.length" class="helptext">aucun connecteur à redacter pour l'instant.</div>
      </ConsoleCard>

      <ConsoleCard v-for="service in services" :key="service" :title="service" flush
        :sub="isCustomized(service) ? 'politique de l\'org (autoritaire)' : 'défaut serveur — ajoute une règle pour personnaliser'">
        <template #actions>
          <Tag v-if="isCustomized(service)" tone="saffron">org</Tag>
          <Tag v-else tone="cobalt">défaut</Tag>
          <Btn v-if="isOrgAdmin" kind="mini" icon="plus" @click="editRule(service)">règle</Btn>
          <Btn v-if="isOrgAdmin && isCustomized(service)" kind="mini" @click="resetService(service)">réinitialiser</Btn>
        </template>
        <table class="tbl">
          <thead><tr><th>champs</th><th>action</th><th>options</th><th v-if="isOrgAdmin" style="width: 130px"></th></tr></thead>
          <tbody>
            <tr v-for="(r, i) in rulesOf(service)" :key="i">
              <td style="color: var(--color-ink)">{{ r.fields.join(', ') }}</td>
              <td><Tag tone="ink">{{ actionLabel(r.action) }}</Tag></td>
              <td class="dim" style="font-size: 12px">{{ ruleSummary(r) || '—' }}</td>
              <td v-if="isOrgAdmin" style="text-align: right; white-space: nowrap">
                <Btn kind="mini" @click="editRule(service, r, i)">éditer</Btn>
                <Btn kind="danger" @click="deleteRule(service, i)">suppr.</Btn>
              </td>
            </tr>
            <tr v-if="!rulesOf(service).length">
              <td :colspan="isOrgAdmin ? 4 : 3" class="dim" style="text-align: center; padding: 14px">
                aucune redaction — les champs sont renvoyés tels quels.
              </td>
            </tr>
          </tbody>
        </table>
      </ConsoleCard>
    </template>
  </div>
</template>
