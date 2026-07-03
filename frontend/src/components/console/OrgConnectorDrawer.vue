<script setup lang="ts">
// Drawer latéral de gouvernance d'UN connecteur — projection ORG (ADR 0022 §org).
// Pendant du ConnectorDrawer USER (même shell : backdrop + aside + tabs + scroll),
// mais le corps porte les leviers d'ORG et non la connexion perso : disponibilité
// (BINAIRE, bornée par la plateforme = plancher dur, en tête comme l'« exposure »
// du drawer user), puis onglets clé partagée d'org + option + RBAC d'accès (ADR 0025),
// rédaction des champs (éditable — feature ORG), et expéditeurs email (connecteurs
// d'envoi). Présentation pure : les actions remontent à la vue (fetch + reload).
import { computed, ref } from 'vue'
import Avatar from './Avatar.vue'
import ConnectorBadges from './ConnectorBadges.vue'
import ConnectorTransforms from './ConnectorTransforms.vue'
import ConnectorEmail from './ConnectorEmail.vue'
import Tag from './Tag.vue'
import Toggle from './Toggle.vue'
import Btn from './Btn.vue'
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
  <div class="backdrop" @click="emit('close')"></div>
  <aside class="drawer" role="dialog" aria-modal="true">
    <!-- header -->
    <div class="dr-head">
      <Avatar :src="meta?.logo_url" :name="r.label" :size="44" shape="square" />
      <div style="flex: 1; min-width: 0">
        <div class="dr-title">{{ r.label }}</div>
        <div class="dr-pub">{{ subtitle }}</div>
        <div class="dr-tags"><ConnectorBadges :meta="meta" /></div>
      </div>
      <button class="closebtn" aria-label="fermer" @click="emit('close')">×</button>
    </div>

    <!-- tabs -->
    <div class="dr-tabs">
      <button class="dtab" :class="{ on: tab === 'governance' }" @click="tab = 'governance'">gouvernance</button>
      <button class="dtab" :class="{ on: tab === 'redaction' }" @click="tab = 'redaction'">rédaction</button>
      <button v-if="isEmail" class="dtab" :class="{ on: tab === 'email' }" @click="tab = 'email'">email</button>
    </div>

    <div class="dr-scroll">
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
              <button class="oclink" @click="emit('set-key')">{{ hasOrgKey ? 'remplacer' : 'poser' }}</button>
              <button v-if="hasOrgKey" class="oclink oclink-danger" @click="emit('remove-key')">retirer</button>
            </template>
          </div>
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
            <button v-if="isOrgAdmin" class="oclink" @click="emit('add-access')">restreindre…</button>
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
    </div>
  </aside>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; z-index: 55; background: rgba(44, 33, 18, .34); backdrop-filter: blur(2px); animation: bd-in var(--t-fast) var(--ease-out); }
@keyframes bd-in { from { opacity: 0; } to { opacity: 1; } }
.drawer { position: fixed; top: 0; right: 0; bottom: 0; z-index: 60; width: min(560px, 94vw); background: var(--color-bg); border-left: 1px solid var(--color-hair); box-shadow: -18px 0 44px -18px rgba(44, 33, 18, .30); display: flex; flex-direction: column; animation: dr-in 240ms var(--ease-out); }
@keyframes dr-in { from { transform: translateX(24px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
.dr-head { padding: 16px 20px; border-bottom: 1px solid var(--color-hair); display: flex; align-items: flex-start; gap: 13px; }
.dr-title { font-size: 17px; font-weight: 700; letter-spacing: -.01em; line-height: 1.15; }
.dr-pub { font-size: 11.5px; color: var(--color-faint); margin-top: 2px; }
.dr-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
.dr-tabs { display: flex; gap: 18px; padding: 0 20px; border-bottom: 1px solid var(--color-hair); }
.dtab { font-size: 12.5px; padding: 9px 2px 8px; border: 0; background: transparent; cursor: pointer; color: var(--color-mute); border-bottom: 2px solid transparent; margin-bottom: -1px; font-weight: 500; }
.dtab.on { color: var(--color-ink); border-bottom-color: var(--color-ink); font-weight: 700; }
.dr-scroll { flex: 1; overflow-y: auto; min-height: 0; }
.dr-block { padding: 18px 20px; border-bottom: 1px solid var(--color-hair-soft); }
.dr-box { border: 1px solid var(--color-hair); border-radius: 10px; padding: 14px; background: var(--color-surface); }
.closebtn { width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--color-hair); background: var(--color-surface); color: var(--color-mute); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 17px; line-height: 1; flex: 0 0 auto; }
.closebtn:hover { background: var(--color-paper-2); color: var(--color-ink); }
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
