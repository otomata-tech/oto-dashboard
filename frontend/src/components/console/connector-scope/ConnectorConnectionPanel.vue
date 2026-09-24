<script setup lang="ts">
// Panneau CONNEXION (scope USER) du drawer unifié — couche d'authentification (ADR 0024).
// Extrait verbatim de l'ex-`ConnectorDrawer` : verdict « état pour toi » (ADR 0044) +
// bandeau côté-org (org_admin) + widget dérivé de la méthode d'auth (clé/oauth/session/
// hosted/fédéré) + cascade de résolution. Réutilise les MÊMES widgets (source unique,
// zéro réécriture de flux). Les actions clé keyée viennent du levier de l'adaptateur.
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Btn from '@/components/console/Btn.vue'
import Quota from '@/components/console/Quota.vue'
import Dot from '@/components/console/Dot.vue'
import ConnectorOAuthAccounts from '@/components/console/ConnectorOAuthAccounts.vue'
import ConnectorFederatedWidget from '@/components/console/ConnectorFederatedWidget.vue'
import ConnectorSessionWidget from '@/components/console/ConnectorSessionWidget.vue'
import ConnectorHostedWidget from '@/components/console/ConnectorHostedWidget.vue'
import ConnectorFlowConnect from '@/components/console/ConnectorFlowConnect.vue'
import ConnectorKeyAccounts from '@/components/console/ConnectorKeyAccounts.vue'
import ConnectorKeyStack from './ConnectorKeyStack.vue'
import ConnectorVerdictLine from './ConnectorVerdictLine.vue'
import { useMe, canAdministerOrg, canWriteInOrg } from '@/composables/useMe'
import { getOrgConnectorActivation } from '@/api/console'
import type { ConnectionLever } from './adapter'
import { connectWidgetKind } from '@/lib/connectorConnect'
import { poseScope } from '@/lib/credentialScope'
import type { ConnectorMode } from '@/lib/consoleTypes'
import type { MyConnector, OrgConnectorActivation } from '@/types/api'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{ connector: MyConnector; lever: ConnectionLever<MyConnector> }>()
const { me } = useMe()
const c = computed(() => props.connector)

// Bandeau côté-org (ADR 0044 B4) — résumé lecture seule pour un org_admin.
const nominalOrgAdmin = computed(() => me.value?.org_role === 'org_admin')
const orgAct = ref<OrgConnectorActivation | null>(null)
onMounted(async () => {
  if (!nominalOrgAdmin.value || me.value?.active_org == null) return
  try {
    const list = (await getOrgConnectorActivation(me.value.active_org)).connectors
    orgAct.value = list.find((a) => a.connector === c.value.name) ?? null
  } catch { /* le bloc org ne s'affiche simplement pas */ }
})

// Dérivé du descripteur backend par `lib/connectorConnect` — source unique, et une
// méthode d'auth inconnue y rend `'unknown'` au lieu d'un vide silencieux (cf. l'incident
// `secret_then_oauth` documenté dans ce fichier-là).
const connKind = computed(() => connectWidgetKind(c.value.auth))
// Le geste de connexion est DÉCLARÉ par le connecteur (backend `connector_flow`) :
// on le rend quand il existe, sans jamais savoir de quel connecteur il s'agit.
const flow = computed(() => c.value.connect ?? null)
const isOpenData = computed(() => connKind.value === 'opendata')
const isRemote = computed(() => connKind.value === 'remote')
const nFields = computed(() => (c.value.credential_fields ?? []).length)
const authLabel = computed(() => {
  switch (c.value.auth.method) {
    case 'secret': return nFields.value > 1 ? t('connectorsUi.connection.auth.fields', { n: nFields.value }) : t('connectorsUi.connection.auth.apiKey')
    case 'oauth': return c.value.auth.cardinality === 'multi_account' ? t('connectorsUi.connection.auth.oauthMulti') : t('connectorsUi.connection.auth.oauth')
    case 'cookie': return t('connectorsUi.connection.auth.session')
    case 'hosted': return t('connectorsUi.connection.auth.hosted')
    case 'remote': return t('connectorsUi.connection.auth.remote')
    default: return t('connectorsUi.connection.auth.open')
  }
})
// À quel palier la clé de ce connecteur se pose (lu sur `auth_modes`, cf.
// `lib/credentialScope`). `org` = il n'existe PAS de clé personnelle : le geste
// d'ici pose la clé de l'org de contexte, et il appartient à un admin d'org.
const poseAt = computed(() => poseScope(c.value.auth_modes))
const orgKeyOnly = computed(() => poseAt.value === 'org')
// Les gestes de ce panneau suivent la règle d'écriture d'org (`useMe`) : en consultation, le
// serveur les refuse tous (oto#212). Le verdict et la pile restent lus.
const canWrite = computed(() => canWriteInOrg(me.value))
// Même borne que l'adaptateur : l'admin d'org tel que le serveur le tient, hors consultation
// (`canAdministerOrg`, oto#210 et oto#212) — un `admin` opérationnel serait refusé en 403 après
// la saisie.
const canPoseKey = computed(() => canWrite.value
  && (poseAt.value === 'member' || (orgKeyOnly.value && canAdministerOrg(me.value))))
const authExplain = computed(() => {
  switch (c.value.auth.method) {
    case 'secret': return orgKeyOnly.value
      ? t('connectorsUi.connection.explain.orgOnly')
      : nFields.value > 1
        ? t('connectorsUi.connection.explain.fields', { n: nFields.value })
        : t('connectorsUi.connection.explain.key')
    case 'oauth': return c.value.auth.cardinality === 'multi_account'
      ? t('connectorsUi.connection.explain.oauthMulti')
      : t('connectorsUi.connection.explain.oauth')
    case 'cookie': return t('connectorsUi.connection.explain.cookie')
    case 'hosted': return t('connectorsUi.connection.explain.hosted')
    case 'remote': return t('connectorsUi.connection.explain.remote')
    default: return t('connectorsUi.connection.explain.open')
  }
})

const status = computed(() => me.value?.providers?.[c.value.name])
const statusMode = computed<ConnectorMode>(() => {
  const p = status.value
  if (!p || p.mode === 'forbidden') return 'none'
  if (p.mode === 'over_quota') return 'platform'
  return p.mode as ConnectorMode
})
const keyConfigured = computed(() => !!status.value?.user_key_configured)
// Le connecteur porte-t-il plusieurs comptes ? Dérivé du descripteur backend, comme
// tout le reste de ce panneau — jamais d'une liste de noms tenue côté front.
const multiAccount = computed(() => c.value.auth.cardinality === 'multi_account')
// Le geste d'ajout du levier, lié à CE connecteur ; absent = le bloc n'offre pas l'ajout.
const addAccount = computed(() => {
  const add = props.lever.addAccount
  return add ? (existing: string[]) => add(c.value, existing) : undefined
})
const needsKey = computed(() => connKind.value === 'key')
const docRefCount = computed(() => c.value.doctrine_ref_count ?? 0)

// Verdict « état pour toi » (ADR 0044) — ET-logique des 3 couches.
// ⚠️ `mode='forbidden'` dit seulement « aucune clé ne résout », l'état par défaut de
// tout connecteur BYO pas encore connecté — jamais « réservé ». Réserver un connecteur à
// une partie des membres n'existe plus (24/09/2026, ADR 0053 D1) : on place la clé au
// bon niveau (clé perso vs clé d'org).
// La phrase « une clé existe dans ton équipe » vivait ici EN DOUBLE du verdict, mot
// pour mot : deux fois la même consigne dans le même bloc, et aucune des deux ne
// disait qu'on pouvait poser la sienne. Elle n'est plus écrite qu'au verdict.

// Nombre de clés visibles dans la pile (remonté par elle) — voir plus bas pourquoi ce
// n'est pas déductible de `me.providers`.
const otherKeys = ref(0)
// Ce que fait le bouton, dit littéralement. « Connecter Pennylane » à côté d'une clé
// d'équipe déjà posée se lit comme « brancher le connecteur », donc comme quelque chose
// de déjà fait — et personne ne le prend pour « poser MA clé, qui passera avant ». Le
// cas est arrivé jusqu'à un admin d'org devant sa propre org (oto-dashboard#126).
// ⚠️ « Poser ma clé » ne peut pas s'écrire là où aucune clé personnelle n'existe :
// le geste pose celle de l'org, et le bouton doit le dire AVANT le formulaire.
const keyCta = computed(() => (orgKeyOnly.value
  ? t('connectorsUi.connection.cta.org')
  : otherKeys.value > 0 ? t('connectorsUi.connection.cta.mine') : t('connectorsUi.connection.cta.connect', { name: c.value.label })))
</script>

<template>
  <div>
    <!-- verdict (lot 2 B4) : la phrase d'abord, le diagnostic 3 couches déplié à « Pourquoi ? » -->
    <div class="dr-block">
      <div class="eyebrow" style="margin-bottom: 9px">{{ t('connectorsUi.connection.stateForYou') }}</div>
      <ConnectorVerdictLine :connector="c" />
    </div>

    <!-- côté org (org_admin) -->
    <div v-if="nominalOrgAdmin && orgAct" class="dr-block">
      <div class="eyebrow" style="margin-bottom: 9px">{{ t('connectorsUi.connection.orgSide', { org: me?.active_org_name || t('connectorsUi.connection.yourOrg') }) }}</div>
      <div class="statrow">
        <span class="spill"><Dot :tone="orgAct.effective ? 'olive' : 'faint'" />{{ orgAct.effective ? t('connectorsUi.connection.availableMembers') : t('connectorsUi.connection.offMembers') }}</span>
        <span v-if="orgAct.paid_option" class="spill"><Dot :tone="orgAct.subscribed ? 'olive' : 'saffron'" />{{ t('connectorsUi.connection.option', { name: orgAct.paid_option }) }}</span>
      </div>
      <p class="helptext" style="margin: 9px 0 0"><RouterLink to="/org/connectors" class="org-link">{{ t('connectorsUi.connection.manageOrg') }}</RouterLink></p>
    </div>

    <!-- connexion -->
    <div class="dr-block">
      <div class="eyebrow" style="margin-bottom: 8px">{{ t('connectorsUi.connection.connection', { mode: authLabel }) }}</div>
      <p class="helptext" style="margin: 0 0 14px">{{ authExplain }}</p>

      <div v-if="needsKey" class="dr-box">
        <!-- KeyStack (lot 2 B2) : la clé effective en une ligne, dépliable en pile de
             provenance (« la plus proche gagne »), avec suspension réversible (B7). -->
        <ConnectorKeyStack :connector="c" :lever="lever" @keys="(n) => otherKeys = n" />
        <Quota v-if="status?.quota_daily" style="margin-top: 12px" :used="status.quota_used_today" :total="status.quota_daily" :label="t('connectorsUi.connection.dailyQuota')" />
        <!-- Un connecteur à FLUX porte ses propres actions dans l'encart ci-dessous
             (dont « identifiants de l'application ») : deux boutons concurrents
             rendaient le geste illisible. Dérivé du descripteur, plus d'un nom.

             ⚠️ **Le niveau MANQUANT se nomme dès qu'un autre existe.** La pile ne
             liste que les clés POSÉES : quand seule celle d'une équipe existe, le
             bouton se retrouvait collé sous elle, dans le même encadré, et se lisait
             comme une action SUR elle — « on dirait qu'on va la modifier », dit par
             un admin d'org qui a cru remplacer la clé de son équipe. La césure et la
             ligne « ta clé — aucune » rendent le geste à son propriétaire. Rien de
             tout ça quand il n'y a aucune clé : il n'y a alors rien au-dessus à
             confondre, et annoncer un vide de plus serait du bruit. -->
        <div v-if="!keyConfigured && !flow && (canWrite || (otherKeys > 0 && !orgKeyOnly))"
             class="dr-mine" :class="{ split: otherKeys > 0 && !orgKeyOnly }">
          <span v-if="otherKeys > 0 && !orgKeyOnly" class="dr-mine-lbl"><Dot tone="saffron" />{{ t('connectorsUi.connection.yourKeyNone') }}</span>
          <!-- Clé d'org sans clé personnelle possible : le bouton n'est offert qu'à
               qui peut réellement poser. Un membre voyait ici « Connecter HTTP », et
               le serveur refusait la pose après toute la saisie. En consultation, ni
               geste ni renvoi : la coque dit la lecture seule (oto#212). -->
          <Btn v-if="canPoseKey" kind="mini" @click="lever.configureKey(c)">{{ keyCta }}</Btn>
          <span v-else-if="canWrite" class="dr-mine-lbl"><Dot tone="faint" />{{ t('connectorsUi.connection.orgKeyByAdmin') }}</span>
        </div>
        <!-- Geste de connexion déclaré (consentement OAuth…) : il COEXISTE avec le
             formulaire de champs, il ne le remplace pas — pour ces connecteurs on pose
             l'application PUIS on autorise. Rendu dès que le descripteur existe ;
             c'est le backend qui dit s'il reste une étape (`pending_action`), jamais
             un calcul local sur la présence d'une clé (poser l'app CRÉE le credential,
             gater là-dessus masquerait le bouton au moment où il sert). Tout l'encart
             est un geste : omis en consultation, l'étape restante reste dite par le
             verdict (`pending_action`). -->
        <ConnectorFlowConnect v-if="flow && canWrite" :connector="c" :status="status"
                              :configure="() => lever.configureKey(c)" />
        <!-- Comptes nommés (#121) : un compte du coffre = un workspace Slack, une
             organisation Zoho. Ne s'affiche qu'une fois un credential posé — le
             premier compte reste anonyme, la pose ordinaire ne change pas. -->
        <ConnectorKeyAccounts v-if="keyConfigured && multiAccount" :connector="c" :add="addAccount" />
      </div>

      <ConnectorOAuthAccounts v-else-if="connKind === 'google'" />
      <ConnectorFederatedWidget v-else-if="connKind === 'oauth_federated'" :connector="c" />
      <ConnectorSessionWidget v-else-if="connKind === 'session'" :connector="c" />
      <ConnectorHostedWidget v-else-if="connKind === 'unipile'" />

      <div v-else-if="isRemote" class="dr-box dashed">
        <div style="display: flex; align-items: center; gap: 9px"><Dot tone="cobalt" /><span style="font-size: 12.5px; font-weight: 600">{{ t('connectorsUi.connection.remoteTitle') }}</span></div>
        <p class="helptext" style="margin: 8px 0 0">{{ t('connectorsUi.connection.remoteHelp') }}</p>
      </div>
      <div v-else-if="isOpenData" class="dr-box dashed">
        <div style="display: flex; align-items: center; gap: 9px"><Dot tone="cobalt" /><span style="font-size: 12.5px; font-weight: 600">{{ t('connectorsUi.connection.openTitle') }}</span></div>
        <p class="helptext" style="margin: 8px 0 0"><i18n-t keypath="connectorsUi.connection.openHelp" tag="span"><template #active><strong>{{ t('connectorsUi.connection.active') }}</strong></template></i18n-t></p>
      </div>

      <div v-else-if="connKind === 'unknown'" class="dr-box dashed">
        <div style="display: flex; align-items: center; gap: 9px"><Dot tone="terra" /><span style="font-size: 12.5px; font-weight: 600">{{ t('connectorsUi.connection.unknownTitle') }}</span></div>
        <p class="helptext" style="margin: 8px 0 0"><i18n-t keypath="connectorsUi.connection.unknownHelp" tag="span"><template #method><code>{{ c.auth.method }}</code></template></i18n-t></p>
      </div>

      <p v-if="docRefCount > 0" class="helptext" style="margin-top: 14px; color: var(--color-mute)"><i18n-t keypath="connectorsUi.connection.referencedBy" tag="span" :plural="docRefCount"><template #n><strong style="color: var(--color-ink-soft)">{{ docRefCount }}</strong></template></i18n-t></p>
    </div>
  </div>
</template>

<style scoped>
.dr-block { padding: 18px 20px; border-bottom: 1px solid var(--color-hair-soft); }
.dr-box { border: 1px solid var(--color-hair); border-radius: 10px; padding: 14px; background: var(--color-surface); }
.dr-box.dashed { border-style: dashed; border-color: var(--color-hair-classic); }
/* L'action de l'utilisateur, détachée de la pile : la pile dit ce qui EXISTE, cette
   ligne dit ce qu'il manque et ce qu'on peut y faire. */
.dr-mine { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
.dr-mine.split { border-top: 1px solid var(--color-hair-soft); padding-top: 13px; }
.dr-mine-lbl { display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px;
  font-weight: 600; color: var(--color-mute); }
.dim { color: var(--color-faint); font-weight: 500; }
.statrow { display: flex; flex-wrap: wrap; gap: 14px; }
.spill { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 600; color: var(--color-ink); }
.org-link { color: var(--color-cobalt-ink); font-weight: 600; text-decoration: none; }
.org-link:hover { text-decoration: underline; }
</style>
