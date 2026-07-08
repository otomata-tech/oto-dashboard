<script setup lang="ts">
// Cockpit connecteurs d'UNE équipe (« connecteurs pour team ») — la projection ÉQUIPE
// du connecteur, sur le socle partagé ConnectorList + ConnectorIdentityCell (même dialecte
// que /org/connectors). Le SEUL levier au grain équipe est la CLÉ PARTAGÉE (`group secret`,
// résolue avant celle de l'org pour les membres — cascade perso › équipe › org › plateforme) :
// pas de disponibilité/ACL/rédaction/email, qui sont des concepts d'ORG. Pas de sélection/
// détail (selectable=false) : les actions clé vivent inline dans la ligne. Le backend porte
// l'autz (chef d'équipe / org_admin) ; l'UI masque les contrôles.
import { computed, onMounted, ref } from 'vue'
import ConnectorList from './ConnectorList.vue'
import ConnectorIdentityCell from './ConnectorIdentityCell.vue'
import Dot from './Dot.vue'
import Btn from './Btn.vue'
import CredentialFieldsDialog from './CredentialFieldsDialog.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { setGroupSecret, deleteGroupSecret, getConnectors } from '@/api/console'
import type { GroupSecret, ConnectorMeta, CredentialField } from '@/types/api'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'

const props = defineProps<{
  groupId: number
  secrets: GroupSecret[]
  canManage: boolean
}>()
const emit = defineEmits<{ changed: [] }>()

const { toast } = useToast()
const { confirmAction } = usePrompt()

// Seuls les connecteurs à clé partageable peuvent porter une clé d'équipe : clé simple
// (`api_key`) ou multi-champs (`fields` : zoho/silae/bridges) — même set qu'au niveau org.
const SHAREABLE = new Set(['api_key', 'fields'])
const catalog = ref<ConnectorMeta[]>([])
const loaded = ref(false)

onMounted(async () => {
  try { catalog.value = (await getConnectors()).connectors.filter((c) => SHAREABLE.has(c.secret_kind)) }
  catch (e) { toast(humanize(e)) }
  finally { loaded.value = true }
})

// Clé posée pour ce connecteur ? (map provider → GroupSecret, pour set_by/since.)
const keyed = computed(() => new Map(props.secrets.map((s) => [s.provider, s])))
const hasKey = (name: string) => keyed.value.has(name)
const keyOf = (name: string) => keyed.value.get(name) ?? null

// ── clé partagée (par connecteur) ────────────────────────────────────────────
// Credential courant rendu par CredentialFieldsDialog. `multi` = connecteur multi-champs
// (`secret_kind='fields'` → `credential_fields` peuplé) vs clé simple (`api_key`).
const credConn = ref<{ label: string; provider: string; fields: CredentialField[]; multi: boolean } | null>(null)
const credOpen = ref(false)

function openCred(c: ConnectorMeta) {
  const multi = c.secret_kind === 'fields' && (c.credential_fields?.length ?? 0) > 0
  const fields: CredentialField[] = multi
    ? c.credential_fields
    : [{ name: 'api_key', label: `clé api ${c.label}`, secret: true, required: true }]
  credConn.value = { label: c.label, provider: c.name, fields, multi }
  credOpen.value = true
}
async function saveCred(values: Record<string, string>) {
  const c = credConn.value
  if (!c) return
  try {
    await setGroupSecret(props.groupId, c.provider, c.multi ? '' : (values.api_key ?? ''), undefined, c.multi ? values : undefined)
    toast(`${c.label}: team key saved`)
    emit('changed')
  } catch (e) { toast(humanize(e)); throw e }
}
async function removeSecret(c: ConnectorMeta) {
  if (!await confirmAction({ title: 'remove shared key', danger: true, confirmLabel: 'Remove', message: `remove the shared ${c.label} key? members without their own key lose access.` })) return
  try { await deleteGroupSecret(props.groupId, c.name); toast('shared key removed'); emit('changed') }
  catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <ConnectorList :items="catalog" :item-key="(c) => c.name" :label="(c) => c.label"
    :search-text="(c) => `${c.name} ${c.label}`" :category="(c) => c.category ?? ''"
    :sort-rank="(c) => hasKey(c.name) ? 0 : 1" :selectable="false"
    title="connectors" search-placeholder="search…"
    sub="connectors this team can share via a team key — resolves before the org key for this team's members (cascade: personal › team › org › platform).">
    <template #head>
      <th style="width: 46%">connector</th>
      <th>team key</th>
      <th v-if="canManage" style="width: 150px"></th>
    </template>
    <template #row="{ item: c }">
      <td><ConnectorIdentityCell :meta="c" /></td>
      <td>
        <template v-if="hasKey(c.name)">
          <span class="cv-avail"><Dot tone="olive" />posée</span>
          <div class="cv-sub">{{ keyOf(c.name)?.base_url ? 'remote bridge' : 'api key' }}<span v-if="fmtDate(keyOf(c.name)?.set_at)"> · {{ fmtDate(keyOf(c.name)?.set_at) }}</span></div>
        </template>
        <span v-else class="dim" style="font-size: 11.5px">aucune</span>
      </td>
      <td v-if="canManage" style="text-align: right; white-space: nowrap">
        <template v-if="hasKey(c.name)">
          <Btn kind="mini" @click="openCred(c)">Rotate</Btn>
          <Btn kind="danger" @click="removeSecret(c)">Remove</Btn>
        </template>
        <Btn v-else kind="mini" icon="plus" @click="openCred(c)">Add key</Btn>
      </td>
    </template>
    <template #empty>
      <p v-if="loaded" class="helptext" style="text-align: center; padding: 18px">no shareable connector.</p>
    </template>
    <template #footer>
      <div v-if="!canManage" class="helptext" style="padding: 10px 14px">read-only — only the team lead or an org admin can set team keys.</div>
    </template>
  </ConnectorList>

  <CredentialFieldsDialog v-if="credConn" v-model:open="credOpen"
    :label="credConn.label" :fields="credConn.fields" :single="!credConn.multi"
    :on-confirm="saveCred" />
</template>

<style scoped>
.cv-avail { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; color: var(--color-ink-soft); }
.cv-sub { font-size: 11px; color: var(--color-faint); margin-top: 2px; }
</style>
