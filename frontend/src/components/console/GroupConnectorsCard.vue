<script setup lang="ts">
// Cockpit connecteurs d'UNE équipe (« connecteurs pour team ») — la projection ÉQUIPE
// du connecteur, alignée sur le dialecte de `/org/connectors` (OrgConnectorsView) : une
// ligne par connecteur (logo + label + éditeur), recherche + chips de catégorie, état
// de clé lisible. Le SEUL levier au grain équipe est la CLÉ PARTAGÉE (`group secret`,
// résolue avant celle de l'org pour les membres de l'équipe — cascade perso › équipe ›
// org › plateforme) : pas de disponibilité/ACL/rédaction/email, qui sont des concepts
// d'ORG. Extrait de GroupDetailCards (qui ne garde que les membres) pour donner aux
// connecteurs une vraie surface cohérente. Le backend porte l'autz (chef d'équipe /
// org_admin) ; l'UI masque les contrôles.
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from './ConsoleCard.vue'
import CategoryChips from './CategoryChips.vue'
import Avatar from './Avatar.vue'
import Tag from './Tag.vue'
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
const q = ref('')
const category = ref<string | null>(null)

onMounted(async () => {
  try { catalog.value = (await getConnectors()).connectors.filter((c) => SHAREABLE.has(c.secret_kind)) }
  catch (e) { toast(humanize(e)) }
  finally { loaded.value = true }
})

// Clé posée pour ce connecteur ? (map provider → GroupSecret, pour set_by/since.)
const keyed = computed(() => new Map(props.secrets.map((s) => [s.provider, s])))
const hasKey = (name: string) => keyed.value.has(name)
const keyOf = (name: string) => keyed.value.get(name) ?? null

const shown = computed(() => {
  const needle = q.value.trim().toLowerCase()
  return catalog.value
    .filter((c) => !category.value || (c.category ?? '') === category.value)
    .filter((c) => !needle || c.name.toLowerCase().includes(needle) || c.label.toLowerCase().includes(needle))
    // clés posées d'abord, puis alpha : le concret de l'équipe remonte en tête.
    .sort((a, b) => Number(hasKey(b.name)) - Number(hasKey(a.name)) || a.label.localeCompare(b.label))
})

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
  <ConsoleCard flush title="connectors"
    sub="connectors this team can share via a team key — resolves before the org key for this team's members (cascade: personal › team › org › platform).">
    <template #actions>
      <input v-model="q" class="cc-search" placeholder="search…" />
    </template>
    <CategoryChips :values="catalog.map((c) => c.category ?? '')" v-model="category" />

    <table class="tbl">
      <thead>
        <tr>
          <th style="width: 46%">connector</th>
          <th>team key</th>
          <th v-if="canManage" style="width: 150px"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="c in shown" :key="c.name" class="crow">
          <td>
            <div style="display: flex; align-items: center; gap: 11px">
              <Avatar :src="c.logo_url" :name="c.label" :size="32" shape="square" />
              <div style="min-width: 0">
                <div class="cv-name">{{ c.label }}</div>
                <div class="cv-pub">{{ [c.publisher, c.category].filter(Boolean).join(' · ') }}</div>
              </div>
            </div>
          </td>
          <td>
            <template v-if="hasKey(c.name)">
              <span class="cv-avail"><span class="cdot olive"></span>posée</span>
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
        </tr>
      </tbody>
    </table>
    <p v-if="loaded && !shown.length" class="helptext" style="text-align: center; padding: 18px">no shareable connector.</p>
    <div v-if="!canManage" class="helptext" style="padding: 10px 14px">read-only — only the team lead or an org admin can set team keys.</div>
  </ConsoleCard>

  <CredentialFieldsDialog v-if="credConn" v-model:open="credOpen"
    :label="credConn.label" :fields="credConn.fields" :single="!credConn.multi"
    :on-confirm="saveCred" />
</template>

<style scoped>
.cc-search {
  font-size: 12px; padding: 5px 10px; border: 1px solid var(--color-hair-classic);
  border-radius: 8px; background: var(--color-surface); color: var(--color-ink); width: 200px;
}
.cc-search:focus { outline: none; border-color: var(--color-ink); }
.cv-name { font-weight: 600; font-size: 13px; color: var(--color-ink); white-space: nowrap; }
.cv-pub { font-size: 11px; color: var(--color-faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cv-avail { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; color: var(--color-ink-soft); }
.cv-sub { font-size: 11px; color: var(--color-faint); margin-top: 2px; }
.cdot { width: 8px; height: 8px; border-radius: 999px; display: inline-block; flex: 0 0 auto; }
.cdot.olive { background: var(--color-olive); }
.dim { color: var(--color-faint); }
</style>
