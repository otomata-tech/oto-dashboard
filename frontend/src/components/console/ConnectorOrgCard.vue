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
import type { ConnectorMeta, EmailSettingsBundle, FieldFiltersBundle, OrgConnectorActivation } from '@/types/api'

const props = defineProps<{
  activation: OrgConnectorActivation
  meta?: ConnectorMeta
  hasOrgKey: boolean
  filters: FieldFiltersBundle | null
  email: EmailSettingsBundle | null
  orgId: number | null
  isOrgAdmin: boolean
}>()

const emit = defineEmits<{
  (e: 'set-available', on: boolean): void
  (e: 'set-key'): void
  (e: 'remove-key'): void
  (e: 'filters-changed'): void
  (e: 'email-changed'): void
}>()

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
        <Toggle v-if="r.master_enabled === true" :on="r.effective" :disabled="!isOrgAdmin"
          @change="emit('set-available', !r.effective)" />
        <span v-else class="dim ocnote">coupé par la plateforme — tu ne peux pas l'exposer</span>
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
.ocnote { font-size: 11px; }
.oclink { background: none; border: 0; padding: 4px 0; cursor: pointer; font-size: 12px; color: var(--color-cobalt-ink); font-weight: 600; }
.ockey { display: flex; align-items: center; gap: 8px; min-height: 22px; }
.oclink-danger { color: var(--color-terra-ink); }
</style>
