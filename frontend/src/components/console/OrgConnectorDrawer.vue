<script setup lang="ts">
// Détail de gouvernance d'UN connecteur — projection ORG (ADR 0022 §org). Pendant du
// ConnectorDrawer USER, rendu dans la MÊME modale (ConnectorModal, ex-drawer latéral) :
// le corps porte les leviers d'ORG — disponibilité (BINAIRE, bornée par la plateforme =
// plancher dur, en tête), puis onglets clé partagée d'org + option + RBAC d'accès
// (ADR 0025), rédaction des champs (éditable), et expéditeurs email (connecteurs d'envoi).
// Présentation pure : les actions remontent à la vue (fetch + reload).
import { computed, ref } from 'vue'
import ConnectorModal from './ConnectorModal.vue'
import ConnectorBadges from './ConnectorBadges.vue'
import ConnectorTransforms from './ConnectorTransforms.vue'
import ConnectorEmail from './ConnectorEmail.vue'
import Tag from './Tag.vue'
import Toggle from './Toggle.vue'
import { verifyConnector } from '@/api/console'
import { useToast } from '@/composables/useToast'
import { humanize } from '@/lib/errors'
import type { ConnectorAclEntry, ConnectorMeta, EmailSettingsBundle, FieldFiltersBundle, GroupListItem, OrgConnectorActivation, OrgMember, VerifyResult } from '@/types/api'

const props = defineProps<{
  activation: OrgConnectorActivation
  meta?: ConnectorMeta
  hasOrgKey: boolean
  filters: FieldFiltersBundle | null
  email: EmailSettingsBundle | null
  orgId: number | null
  isOrgAdmin: boolean
  acl?: ConnectorAclEntry[]        // ACL de CE connecteur (RBAC org, ADR 0025) ; vide = ouvert
  groups?: GroupListItem[]         // groupes de l'org (pour libeller les principals groupe)
  members?: OrgMember[]            // membres de l'org (pour libeller les principals user)
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'set-available', on: boolean): void
  (e: 'set-key'): void
  (e: 'remove-key'): void
  (e: 'filters-changed'): void
  (e: 'email-changed'): void
  (e: 'add-access'): void
  (e: 'remove-access', principalType: string, principalId: string): void
  (e: 'force-member'): void
}>()

const r = computed(() => props.activation)

// Email = feature ORG seulement pour les connecteurs d'envoi (transport dérivé).
const isEmail = computed(() => ['scaleway', 'resend'].includes(r.value.connector))

type Tab = 'governance' | 'redaction' | 'email'
const tab = ref<Tab>('governance')

// Onglets de la modale (email conditionnel aux connecteurs d'envoi).
const TABS = computed(() => {
  const t = [{ key: 'governance', label: 'gouvernance' }, { key: 'redaction', label: 'rédaction' }]
  if (isEmail.value) t.push({ key: 'email', label: 'email' })
  return t
})

// RBAC org (ADR 0025) : ≥1 principal ⟹ connecteur RÉSERVÉ ; sinon ouvert à toute l'org.
const aclEntries = computed(() => props.acl ?? [])
const restricted = computed(() => aclEntries.value.length > 0)
function principalLabel(e: ConnectorAclEntry): string {
  if (e.principal_type === 'group') {
    const g = props.groups?.find((x) => String(x.id) === String(e.principal_id))
    return g ? `équipe · ${g.name}` : `équipe #${e.principal_id}`
  }
  const m = props.members?.find((x) => x.sub === e.principal_id)
  return m?.name || m?.email || e.principal_id
}

// Clé partagée d'org : clé simple (api_key) OU multi-champs (fields — zoho, silae,
// zohodesk…). Le backend accepte `fields` sur PUT /api/orgs/{id}/secrets/{provider}.
const canHaveOrgKey = computed(() =>
  props.meta?.secret_kind === 'api_key' || props.meta?.secret_kind === 'fields')

// Sonde « tester la connexion » de la clé D'ORG (level='org'). Self-contained (read-only,
// résultat éphémère) : exception assumée à la « présentation pure » de ce détail.
const { toast } = useToast()
const canTestOrg = computed(() => !!props.meta?.verifiable && props.hasOrgKey)
const testing = ref(false)
const testRes = ref<VerifyResult | null>(null)
async function testOrgConnection() {
  testing.value = true
  testRes.value = null
  try {
    testRes.value = await verifyConnector(r.value.connector, 'org')
  } catch (e) {
    toast(humanize(e))
  } finally {
    testing.value = false
  }
}

// Rédaction par connecteur : schéma observé/déclaré + règles effectives (org sinon défaut).
const tf = computed(() => {
  const b = props.filters
  const name = r.value.connector
  return {
    schema: b?.schemas?.[name] ?? [],
    rules: b?.filters?.[name]?.rules ?? b?.defaults?.[name]?.rules ?? [],
    defaultRules: b?.defaults?.[name]?.rules ?? [],
    customized: !!b?.filters?.[name],
  }
})

const emailBlock = computed(() => props.email?.settings?.[r.value.connector] ?? null)
const emailTransport = computed(() => props.email?.transports?.[r.value.connector] ?? r.value.connector)

const subtitle = computed(() =>
  [props.meta?.publisher, r.value.help].filter(Boolean).join(' · '))
</script>

<template>
  <ConnectorModal :label="r.label" :logo-url="meta?.logo_url" :publisher="subtitle"
    :tabs="TABS" :tab="tab" @update:tab="(k) => tab = (k as Tab)" @close="emit('close')">
    <template #tags><ConnectorBadges :meta="meta" /></template>

    <!-- disponibilité (toujours en tête — le levier primaire, bordé par la plateforme) -->
    <div class="dr-block">
      <div class="eyebrow" style="margin-bottom: 9px">disponibilité — ce que vivent tes membres</div>
      <div class="ocstatus" :class="r.effective ? 'is-on' : 'is-off'">
        <span class="ocstatus-dot" />
        <span class="ocstatus-txt">
          <strong>{{ r.effective ? 'disponible pour tes membres' : 'coupé pour tes membres' }}</strong>
          <span class="dim"> — {{ r.effective ? 'ils peuvent l\'installer dans leur toolbox' : 'invisible dans leur catalogue' }}</span>
        </span>
        <Toggle :on="r.effective" :disabled="!isOrgAdmin"
          @change="emit('set-available', !r.effective)" />
      </div>
      <p class="helptext" style="margin-top: 9px">la plateforme borne — tu ne peux pas exposer un connecteur qu'elle a coupé, seulement le restreindre.</p>
    </div>

    <!-- GOUVERNANCE : clé d'org + option + accès (RBAC) -->
    <div v-if="tab === 'governance'" class="dr-block">
      <!-- clé partagée d'org (connecteurs à clé simple) -->
      <div v-if="canHaveOrgKey" class="dr-box" style="margin-bottom: 14px">
        <div class="eyebrow" style="margin-bottom: 8px">clé d'org</div>
        <p class="helptext" style="margin: 0 0 10px">héritée par les membres sans clé perso (cascade : perso &gt; équipe &gt; org &gt; plateforme).</p>
        <div class="ockey">
          <Tag v-if="hasOrgKey" tone="olive">posée</Tag>
          <span v-else class="dim" style="font-size: 11.5px">aucune</span>
          <template v-if="isOrgAdmin">
            <button class="oclink" @click="emit('set-key')">{{ hasOrgKey ? 'Remplacer' : 'Poser' }}</button>
            <button v-if="hasOrgKey" class="oclink oclink-danger" @click="emit('remove-key')">Retirer</button>
          </template>
          <button v-if="canTestOrg" class="oclink" :disabled="testing" @click="testOrgConnection">
            {{ testing ? 'test…' : 'tester' }}
          </button>
        </div>
        <p v-if="testRes" class="helptext" style="margin: 8px 0 0"
           :style="{ color: testRes.ok ? 'var(--color-olive)' : 'var(--color-terra-ink)' }">
          {{ testRes.ok ? '✓ connexion OK' : `✗ ${testRes.error}` }}
        </p>
      </div>

      <!-- option de connecteur (couche 3) -->
      <div v-if="r.paid_option" class="dr-box" style="margin-bottom: 14px">
        <div class="eyebrow" style="margin-bottom: 8px">option</div>
        <p class="helptext" style="margin: 0 0 10px">option de connecteur (accordée par un admin plateforme).</p>
        <Tag v-if="r.subscribed" tone="olive">activée</Tag>
        <span v-else class="dim" style="font-size: 11.5px">non activée</span>
      </div>

      <!-- accès (RBAC org, ADR 0025) -->
      <div class="dr-box">
        <div class="eyebrow" style="margin-bottom: 8px">accès</div>
        <template v-if="!restricted">
          <p class="helptext" style="margin: 0 0 10px">ouvert à toute l'org.</p>
          <button v-if="isOrgAdmin" class="oclink" @click="emit('add-access')">Restreindre…</button>
        </template>
        <template v-else>
          <p class="helptext" style="margin: 0 0 10px"><strong>réservé</strong> — invisible et bloqué pour les autres, même avec leur propre clé.</p>
          <div class="occhips">
            <span v-for="e in aclEntries" :key="e.principal_type + e.principal_id" class="occhip">
              {{ principalLabel(e) }}
              <button v-if="isOrgAdmin" class="occhip-x" title="retirer"
                @click="emit('remove-access', e.principal_type, e.principal_id)">×</button>
            </span>
            <button v-if="isOrgAdmin" class="oclink" @click="emit('add-access')">+ ajouter</button>
          </div>
        </template>
        <hr class="divider-dotted" style="margin: 14px 0" />
        <button v-if="isOrgAdmin" class="oclink" @click="emit('force-member')"
          title="pousser ce connecteur dans la toolbox d'un membre (il le voit sans l'activer ; reste masquable)">pousser à un membre…</button>
      </div>
    </div>

    <!-- RÉDACTION des champs (éditable — feature ORG) -->
    <div v-else-if="tab === 'redaction'" class="dr-block">
      <ConnectorTransforms
        :service="r.connector" :fields="tf.schema" :rules="tf.rules"
        :default-rules="tf.defaultRules" :templates="filters?.templates"
        :action-schema="filters?.schema ?? []" :customized="tf.customized"
        :org-id="orgId" :is-org-admin="isOrgAdmin" @changed="emit('filters-changed')" />
    </div>

    <!-- EMAIL : expéditeurs & envoi (connecteurs d'envoi seulement) -->
    <div v-else-if="tab === 'email' && email && orgId != null" class="dr-block">
      <ConnectorEmail
        :connector="r.connector" :block="emailBlock" :transport="emailTransport"
        :quiet-default="email.quiet_hours_default" :resend-key-set="email.resend_key_set"
        :org-id="orgId" :is-org-admin="isOrgAdmin" @changed="emit('email-changed')" />
    </div>
  </ConnectorModal>
</template>

<style scoped>
.dr-block { padding: 18px 20px; border-bottom: 1px solid var(--color-hair-soft); }
.dr-box { border: 1px solid var(--color-hair); border-radius: 10px; padding: 14px; background: var(--color-surface); }
/* statut disponibilité (repris de ConnectorOrgCard) */
.ocstatus { display: flex; align-items: center; gap: 9px; font-size: 13px; }
.ocstatus-dot { width: 8px; height: 8px; border-radius: 999px; flex: none; }
.ocstatus.is-on .ocstatus-dot { background: var(--color-olive); }
.ocstatus.is-off .ocstatus-dot { background: var(--color-faint); }
.ocstatus-txt { flex: 1; min-width: 0; }
.ockey { display: flex; align-items: center; gap: 8px; min-height: 22px; }
.occhips { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.oclink { background: none; border: 0; padding: 4px 0; cursor: pointer; font-size: 12px; color: var(--color-cobalt-ink); font-weight: 600; }
.oclink-danger { color: var(--color-terra-ink); }
.occhip { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; padding: 2px 4px 2px 9px; border-radius: 999px; background: var(--color-saffron-soft); color: var(--color-saffron-ink); }
.occhip-x { border: 0; background: none; cursor: pointer; color: inherit; font-size: 14px; line-height: 1; padding: 0 2px; opacity: 0.7; }
.occhip-x:hover { opacity: 1; }
.dim { color: var(--color-faint); }
</style>
