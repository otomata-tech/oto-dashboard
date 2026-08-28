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
import { useMe } from '@/composables/useMe'
import { getOrgConnectorActivation } from '@/api/console'
import type { ConnectionLever } from './adapter'
import { connectWidgetKind } from '@/lib/connectorConnect'
import type { ConnectorMode } from '@/lib/consoleTypes'
import type { MyConnector, OrgConnectorActivation } from '@/types/api'

const props = defineProps<{ connector: MyConnector; lever: ConnectionLever<MyConnector> }>()
const { me } = useMe()
const c = computed(() => props.connector)

// Bandeau côté-org (ADR 0044 B4) — résumé lecture seule pour un org_admin.
const isOrgAdmin = computed(() => me.value?.org_role === 'org_admin')
const orgAct = ref<OrgConnectorActivation | null>(null)
onMounted(async () => {
  if (!isOrgAdmin.value || me.value?.active_org == null) return
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
    case 'secret': return nFields.value > 1 ? `${nFields.value} champs` : 'clé api'
    case 'oauth': return c.value.auth.cardinality === 'multi_account' ? 'oauth · multi' : 'oauth'
    case 'cookie': return 'session'
    case 'hosted': return 'compte hébergé'
    case 'remote': return 'pont d\'org'
    default: return 'open data'
  }
})
const authExplain = computed(() => {
  switch (c.value.auth.method) {
    case 'secret': return nFields.value > 1
      ? `un identifiant à ${nFields.value} champs, collé une fois — stocké chiffré et scopé à cette org.`
      : 'une clé API unique, collée une fois — stockée chiffrée et scopée à cette org.'
    case 'oauth': return c.value.auth.cardinality === 'multi_account'
      ? 'autorise un ou plusieurs comptes en OAuth — aucune clé à copier.'
      : 'une autorisation OAuth ponctuelle en ton nom — aucune clé à copier.'
    case 'cookie': return 'ta session connectée, capturée une fois via une fenêtre de login hébergée.'
    case 'hosted': return 'un pont de compte hébergé — relie ton compte ici, la clé d\'accès se résout en cascade.'
    case 'remote': return 'un pont distant dont l\'identifiant est posé par ton org — rien à configurer en tant que membre.'
    default: return 'open data — aucun identifiant, les outils fonctionnent directement.'
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
const needsKey = computed(() => connKind.value === 'key')
const docRefCount = computed(() => c.value.doctrine_ref_count ?? 0)

// Verdict « état pour toi » (ADR 0044) — ET-logique des 3 couches.
// ⚠️ `mode='forbidden'` ≠ RBAC : côté backend c'est « aucune clé ne résout », l'état
// par défaut de tout connecteur BYO pas encore connecté. La restriction RÉELLE se lit
// sur `ProviderStatus.rbac_restricted`, servi depuis le 2026-08-28 — avant, le verdict
// la déduisait de `forbidden` et affichait « Réservé à certaines équipes — demande à
// un admin » à qui n'était bloqué par rien. Le raisonnement de repli qui vivait ici
// (« un connecteur restreint est filtré du catalogue, donc le voir prouve qu'on y a
// droit ») était juste pour un membre et FAUX pour un opérateur plateforme, qui voit
// tout — et il n'empêchait pas le verdict de mentir. Constaté le 2026-07-16 sur un
// Zoho simplement pas connecté, puis en clientèle sur un admin d'org devant SA propre
// org (oto-dashboard#126).
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
const keyCta = computed(() => (otherKeys.value > 0 ? 'Poser ma clé' : `Connecter ${c.value.label}`))
</script>

<template>
  <div>
    <!-- verdict (lot 2 B4) : la phrase d'abord, le diagnostic 3 couches déplié à « Pourquoi ? » -->
    <div class="dr-block">
      <div class="eyebrow" style="margin-bottom: 9px">état pour toi</div>
      <ConnectorVerdictLine :connector="c" />
    </div>

    <!-- côté org (org_admin) -->
    <div v-if="isOrgAdmin && orgAct" class="dr-block">
      <div class="eyebrow" style="margin-bottom: 9px">côté org · {{ me?.active_org_name || 'ton org' }}</div>
      <div class="statrow">
        <span class="spill"><Dot :tone="orgAct.effective ? 'olive' : 'faint'" />{{ orgAct.effective ? 'disponible pour tes membres' : 'coupé pour tes membres' }}</span>
        <span v-if="orgAct.paid_option" class="spill"><Dot :tone="orgAct.subscribed ? 'olive' : 'saffron'" />option {{ orgAct.paid_option }}</span>
      </div>
      <p class="helptext" style="margin: 9px 0 0"><RouterLink to="/org/connectors" class="org-link">gérer la disponibilité, l'accès et la clé d'org →</RouterLink></p>
    </div>

    <!-- connexion -->
    <div class="dr-block">
      <div class="eyebrow" style="margin-bottom: 8px">connexion · {{ authLabel }}</div>
      <p class="helptext" style="margin: 0 0 14px">{{ authExplain }}</p>

      <div v-if="needsKey" class="dr-box">
        <!-- KeyStack (lot 2 B2) : la clé effective en une ligne, dépliable en pile de
             provenance (« la plus proche gagne »), avec suspension réversible (B7). -->
        <ConnectorKeyStack :connector="c" :lever="lever" @keys="(n) => otherKeys = n" />
        <Quota v-if="status?.quota_daily" style="margin-top: 12px" :used="status.quota_used_today" :total="status.quota_daily" label="quota du jour" />
        <!-- Un connecteur à FLUX porte ses propres actions dans l'encart ci-dessous
             (dont « identifiants de l'application ») : deux boutons concurrents
             rendaient le geste illisible. Dérivé du descripteur, plus d'un nom. -->
        <div v-if="!keyConfigured && !flow" style="display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap">
          <Btn kind="mini" @click="lever.configureKey(c)">{{ keyCta }}</Btn>
        </div>
        <!-- Geste de connexion déclaré (consentement OAuth…) : il COEXISTE avec le
             formulaire de champs, il ne le remplace pas — pour ces connecteurs on pose
             l'application PUIS on autorise. Rendu dès que le descripteur existe ;
             c'est le backend qui dit s'il reste une étape (`pending_action`), jamais
             un calcul local sur la présence d'une clé (poser l'app CRÉE le credential,
             gater là-dessus masquerait le bouton au moment où il sert). -->
        <ConnectorFlowConnect v-if="flow" :connector="c" :status="status"
                              :configure="() => lever.configureKey(c)" />
        <!-- Comptes nommés (#121) : un compte du coffre = un workspace Slack, une
             organisation Zoho. Ne s'affiche qu'une fois un credential posé — le
             premier compte reste anonyme, la pose ordinaire ne change pas. -->
        <ConnectorKeyAccounts v-if="keyConfigured && multiAccount" :connector="c" :lever="lever" />
      </div>

      <ConnectorOAuthAccounts v-else-if="connKind === 'google'" />
      <ConnectorFederatedWidget v-else-if="connKind === 'oauth_federated'" :connector="c" />
      <ConnectorSessionWidget v-else-if="connKind === 'session'" :connector="c" />
      <ConnectorHostedWidget v-else-if="connKind === 'unipile'" />

      <div v-else-if="isRemote" class="dr-box dashed">
        <div style="display: flex; align-items: center; gap: 9px"><Dot tone="cobalt" /><span style="font-size: 12.5px; font-weight: 600">pont d'org — provisionné par ton org</span></div>
        <p class="helptext" style="margin: 8px 0 0">l'admin de ton org pose l'identifiant machine ; les membres l'utilisent, en lecture seule.</p>
      </div>
      <div v-else-if="isOpenData" class="dr-box dashed">
        <div style="display: flex; align-items: center; gap: 9px"><Dot tone="cobalt" /><span style="font-size: 12.5px; font-weight: 600">open data — aucun identifiant requis</span></div>
        <p class="helptext" style="margin: 8px 0 0">les outils fonctionnent directement. passe l'exposition en <strong>actif</strong> et ton agent peut les appeler immédiatement.</p>
      </div>

      <div v-else-if="connKind === 'unknown'" class="dr-box dashed">
        <div style="display: flex; align-items: center; gap: 9px"><Dot tone="terra" /><span style="font-size: 12.5px; font-weight: 600">mode de connexion non reconnu</span></div>
        <p class="helptext" style="margin: 8px 0 0">ce connecteur annonce une méthode d'authentification (<code>{{ c.auth.method }}</code>) que cette version du dashboard ne sait pas afficher — il est probablement plus récent que l'interface. Ton agent peut le connecter en conversation ; recharge la page plus tard, ou signale-le.</p>
      </div>

      <p v-if="docRefCount > 0" class="helptext" style="margin-top: 14px; color: var(--color-mute)">↳ référencé par <strong style="color: var(--color-ink-soft)">{{ docRefCount }}</strong> procédure{{ docRefCount > 1 ? 's' : '' }} — connecte-le pour les exécuter.</p>
    </div>
  </div>
</template>

<style scoped>
.dr-block { padding: 18px 20px; border-bottom: 1px solid var(--color-hair-soft); }
.dr-box { border: 1px solid var(--color-hair); border-radius: 10px; padding: 14px; background: var(--color-surface); }
.dr-box.dashed { border-style: dashed; border-color: var(--color-hair-classic); }
.dim { color: var(--color-faint); font-weight: 500; }
.statrow { display: flex; flex-wrap: wrap; gap: 14px; }
.spill { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 600; color: var(--color-ink); }
.org-link { color: var(--color-cobalt-ink); font-weight: 600; text-decoration: none; }
.org-link:hover { text-decoration: underline; }
</style>
