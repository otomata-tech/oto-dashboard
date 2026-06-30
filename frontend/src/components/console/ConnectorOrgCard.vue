<script setup lang="ts">
// Carte connecteur — projection ORG (ADR 0022 §org, ADR 0024 §3). MÊME shell visuel
// que la carte user (`ConnectorCardShell`) ; le corps porte la gouvernance d'org :
// disponibilité (BINAIRE, bornée par la plateforme = plancher dur), clé partagée d'org,
// abonnement (add-on payant), et rédaction des champs (éditable — feature ORG).
// Présentation pure : les actions remontent à la vue (qui détient fetch + reload).
import { computed, ref } from 'vue'
import ConnectorCardShell from './ConnectorCardShell.vue'
import ConnectorTransforms from './ConnectorTransforms.vue'
import ConnectorEmail from './ConnectorEmail.vue'
import Tag from './Tag.vue'
import Toggle from './Toggle.vue'
import type { ConnectorAclEntry, ConnectorMeta, EmailSettingsBundle, FieldFiltersBundle, GroupListItem, OrgConnectorActivation, OrgMember } from '@/types/api'

const props = defineProps<{
  activation: OrgConnectorActivation
  meta?: ConnectorMeta
  hasOrgKey: boolean
  filters: FieldFiltersBundle | null
  email: EmailSettingsBundle | null
  orgId: number | null
  isOrgAdmin: boolean
  acl?: ConnectorAclEntry[]        // ACL de CE connecteur (RBAC org, ADR 0025) ; vide = ouvert
  groups?: GroupListItem[]         // départements de l'org (pour libeller les principals groupe)
  members?: OrgMember[]            // membres de l'org (pour libeller les principals user)
}>()

const emit = defineEmits<{
  (e: 'set-available', on: boolean): void
  (e: 'set-key'): void
  (e: 'remove-key'): void
  (e: 'filters-changed'): void
  (e: 'email-changed'): void
  (e: 'add-access'): void
  (e: 'remove-access', principalType: string, principalId: string): void
  (e: 'force-member'): void
}>()

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

const r = computed(() => props.activation)
const subtitle = computed(() =>
  [props.meta?.publisher, r.value.help].filter(Boolean).join(' · '))
const isFederated = computed(() => props.meta?.family === 'federated')

// Clé partagée d'org : possible pour les connecteurs à clé simple (api_key).
const canHaveOrgKey = computed(() => props.meta?.secret_kind === 'api_key')

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

const open = ref(false)       // rédaction dépliée
const openEmail = ref(false)  // expéditeurs & envoi dépliés

// Email = feature ORG seulement pour les connecteurs d'envoi (transport dérivé).
const isEmail = computed(() => ['scaleway', 'resend'].includes(r.value.connector))
const emailBlock = computed(() => props.email?.settings?.[r.value.connector] ?? null)
const emailTransport = computed(() => props.email?.transports?.[r.value.connector] ?? r.value.connector)
</script>

<template>
  <ConnectorCardShell :label="r.label" :logo-url="meta?.logo_url" :subtitle="subtitle">
    <template #badges>
      <Tag v-if="meta?.category" tone="ink">{{ meta.category }}</Tag>
      <Tag v-if="isFederated" tone="saffron" title="mcp fédéré — login délégué, outils proxifiés sous gouvernance oto">fédéré</Tag>
    </template>

    <!-- Effet en clair AVANT les leviers : ce que vivent tes membres. -->
    <div class="ocstatus" :class="r.effective ? 'is-on' : 'is-off'">
      <span class="ocstatus-dot" />
      <span class="ocstatus-txt">
        <strong>{{ r.effective ? 'disponible pour tes membres' : 'coupé pour tes membres' }}</strong>
        <span class="dim"> — {{ r.effective ? 'ils peuvent l\'installer dans leur toolbox' : 'invisible dans leur catalogue' }}</span>
      </span>
    </div>

    <div class="ocrow">
      <!-- Levier 1 : disponibilité — BINAIRE, bornée par la plateforme (plancher dur) -->
      <div class="ocfield">
        <span class="oclabel">disponibilité</span>
        <span class="ochelp">ce que tes membres peuvent installer</span>
        <!-- Le backend ne liste que les connecteurs activés par la plateforme
             (master ON ou grant-only accordé) → plus de cas « coupé par la plateforme ». -->
        <Toggle :on="r.effective" :disabled="!isOrgAdmin"
          @change="emit('set-available', !r.effective)" />
      </div>

      <!-- Levier 2 : clé partagée d'org (connecteurs à clé simple) -->
      <div v-if="canHaveOrgKey" class="ocfield">
        <span class="oclabel">clé d'org</span>
        <span class="ochelp">héritée par les membres sans clé perso</span>
        <div class="ockey">
          <Tag v-if="hasOrgKey" tone="olive">posée</Tag>
          <span v-else class="dim" style="font-size: 11.5px">aucune</span>
          <template v-if="isOrgAdmin">
            <button class="oclink" @click="emit('set-key')">{{ hasOrgKey ? 'remplacer' : 'poser' }}</button>
            <button v-if="hasOrgKey" class="oclink oclink-danger" @click="emit('remove-key')">retirer</button>
          </template>
        </div>
      </div>

      <!-- Levier 3 : abonnement (couche 3) — add-on payant (ex. unipile) -->
      <div v-if="r.paid_option" class="ocfield">
        <span class="oclabel">abonnement</span>
        <span class="ochelp">add-on payant de l'org</span>
        <div class="ockey">
          <Tag v-if="r.subscribed" tone="olive">souscrit</Tag>
          <span v-else class="dim" style="font-size: 11.5px">non souscrit</span>
        </div>
      </div>
    </div>

    <!-- Levier 4 : accès (RBAC org, ADR 0025) — réserver à des départements/membres -->
    <div class="ocaccess">
      <span class="oclabel">accès</span>
      <template v-if="!restricted">
        <span class="dim ocstate">ouvert à toute l'org</span>
        <button v-if="isOrgAdmin" class="oclink" @click="emit('add-access')">restreindre…</button>
      </template>
      <template v-else>
        <span class="ocstate"><strong>réservé</strong> à</span>
        <span v-for="e in aclEntries" :key="e.principal_type + e.principal_id" class="occhip">
          {{ principalLabel(e) }}
          <button v-if="isOrgAdmin" class="occhip-x" title="retirer"
            @click="emit('remove-access', e.principal_type, e.principal_id)">×</button>
        </span>
        <button v-if="isOrgAdmin" class="oclink" @click="emit('add-access')">+ ajouter</button>
      </template>
      <!-- Forcer (ADR 0031) : pousser le connecteur dans la toolbox d'un membre (allow). -->
      <button v-if="isOrgAdmin" class="oclink" @click="emit('force-member')"
        title="pousser ce connecteur dans la toolbox d'un membre (il le voit sans l'activer ; reste masquable)">pousser à un membre…</button>
    </div>

    <!-- Rédaction des champs (éditable ici — feature ORG) -->
    <button class="oclink" @click="open = !open">
      {{ open ? '▾' : '▸' }} rédaction des champs
    </button>
    <ConnectorTransforms v-if="open"
      :service="r.connector" :fields="tf.schema" :rules="tf.rules"
      :default-rules="tf.defaultRules" :templates="filters?.templates"
      :action-schema="filters?.schema ?? []" :customized="tf.customized"
      :org-id="orgId" :is-org-admin="isOrgAdmin" @changed="emit('filters-changed')" />

    <!-- Expéditeurs & envoi (connecteurs d'envoi seulement — transport dérivé) -->
    <template v-if="isEmail && email && orgId != null">
      <button class="oclink" @click="openEmail = !openEmail">
        {{ openEmail ? '▾' : '▸' }} expéditeurs &amp; envoi
      </button>
      <ConnectorEmail v-if="openEmail"
        :connector="r.connector" :block="emailBlock" :transport="emailTransport"
        :quiet-default="email.quiet_hours_default" :resend-key-set="email.resend_key_set"
        :org-id="orgId" :is-org-admin="isOrgAdmin" @changed="emit('email-changed')" />
    </template>
  </ConnectorCardShell>
</template>

<style scoped>
.ocstatus { display: flex; align-items: center; gap: 9px; padding: 2px 0 12px; font-size: 13px; border-bottom: 1px solid var(--color-hair-soft); margin-bottom: 12px; }
.ocstatus-dot { width: 8px; height: 8px; border-radius: 999px; flex: none; }
.ocstatus.is-on .ocstatus-dot { background: var(--color-olive); }
.ocstatus.is-off .ocstatus-dot { background: var(--color-faint); }
.ocstatus-txt { flex: 1; min-width: 0; }
.ocrow { display: flex; gap: 28px; flex-wrap: wrap; align-items: flex-start; padding: 4px 0 8px; }
.ocfield { display: flex; flex-direction: column; gap: 4px; }
.oclabel { font-size: 11px; font-weight: 600; color: var(--color-mute); text-transform: uppercase; letter-spacing: 0.04em; }
.ochelp { font-size: 11px; color: var(--color-faint); margin-top: -2px; max-width: 30ch; line-height: 1.35; }
.oclink { background: none; border: 0; padding: 4px 0; cursor: pointer; font-size: 12px; color: var(--color-cobalt-ink); font-weight: 600; }
.ockey { display: flex; align-items: center; gap: 8px; min-height: 22px; }
.oclink-danger { color: var(--color-terra-ink); }
.ocaccess { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 8px 0 4px; border-top: 1px solid var(--color-hair-soft); }
.ocstate { font-size: 12px; }
.occhip { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; padding: 2px 4px 2px 9px; border-radius: 999px; background: var(--color-saffron-soft); color: var(--color-saffron-ink); }
.occhip-x { border: 0; background: none; cursor: pointer; color: inherit; font-size: 14px; line-height: 1; padding: 0 2px; opacity: 0.7; }
.occhip-x:hover { opacity: 1; }
</style>
