<script setup lang="ts">
// KeyStack (CDC lot 2, composant §5 « KeyLine → KeyStack ») — « D'où vient la clé,
// la plus proche gagne ». Par défaut UNE ligne (la clé effective) ; se déplie en pile
// AUTOMATIQUEMENT si ≥2 clés coexistent, ou si une clé est suspendue / prêtée / cross-org.
// Alimenté par la cascade réelle (`getConnectorInstances`, ADR 0038/0044) + le mode
// résolu (`me.providers[name].mode`). Vocabulaire FR imposé (§2). Pas de réordonnancement :
// pour passer sur la clé du dessous, on SUSPEND (temporaire) ou on RETIRE (définitif).
import { computed, onMounted, ref } from 'vue'
import Dot from '@/components/console/Dot.vue'
import Btn from '@/components/console/Btn.vue'
import { useMe } from '@/composables/useMe'
import { useToast } from '@/composables/useToast'
import { humanize } from '@/lib/errors'
import { getConnectorInstances, suspendInstance } from '@/api/console'
import { rowState, relayOf, relayFor, isHealthKo } from '@/lib/keyStack'
import type { RowState } from '@/lib/keyStack'
import type { ConnectionLever } from './adapter'
import type { ConnectorInstance, MyConnector } from '@/types/api'
import type { DotTone } from '@/lib/consoleTypes'

const props = defineProps<{ connector: MyConnector; lever: ConnectionLever<MyConnector> }>()
// Combien de clés la pile a réellement trouvées. Le parent en a besoin pour nommer son
// action : « poser MA clé » n'a de sens que si une autre clé existe déjà quelque part.
// ⚠️ Le compte ne se déduit pas de `me.providers` : une clé d'équipe qu'on GOUVERNE
// sans en être membre y est invisible (elle n'entre pas dans la cascade), alors qu'elle
// s'affiche bien ici. C'est le cas exact où l'écran a menti (oto-dashboard#126).
const emit = defineEmits<{ (e: 'keys', count: number): void }>()
const { me, reload: reloadMe } = useMe()
const { toast } = useToast()

const c = computed(() => props.connector)
const status = computed(() => me.value?.providers?.[c.value.name])
// Niveau qui RÉSOUT aujourd'hui (over_quota = c'est bien la clé plateforme qui sert).
const effective = computed<string | null>(() => {
  const m = status.value?.mode
  if (!m || m === 'forbidden') return null
  return m === 'over_quota' ? 'platform' : m
})

const instances = ref<ConnectorInstance[]>([])
const loading = ref(true)
async function load() {
  loading.value = true
  try {
    const all = (await getConnectorInstances()).instances
    instances.value = all.filter((i) => i.connector === c.value.name)
    emit('keys', instances.value.length)
  } catch (e) { toast(humanize(e)) } finally { loading.value = false }
}
onMounted(load)

// Solo (org perso, principe 9) : jamais les mots « org » ni « équipe ».
const isPersonal = computed(() => !!me.value?.active_org_is_personal)

const LEVEL_RANK: Record<string, number> = { member: 0, group: 1, org: 2, platform: 3 }
// Nom contextuel d'un niveau (principe 8) — court, sans pédagogie de cascade.
// Le nom d'un compte NOMMÉ, avec le mot du fournisseur servi par le registre
// (« workspace » chez Slack). Vide pour la ligne mono historique.
function accountSuffix(i: ConnectorInstance): string {
  return i.account ? ` (${accountNoun.value} « ${i.account} »)` : ''
}
function levelName(i: ConnectorInstance): string {
  if (i.via === 'shared_with_me') return `Prêtée par ${i.owner.label || 'un pair'}`
  if (i.via === 'personal_cross_org') return 'Ta clé — suit ton compte (autre org)'
  switch (i.level) {
    case 'member': return 'Ta clé'
    // En solo, une clé de niveau org/équipe (rare dans un espace perso) reste « ta clé ».
    case 'group': return isPersonal.value ? 'Ta clé' : `Clé de l’équipe ${i.owner.label || ''}`.trim()
    case 'org': return isPersonal.value ? 'Ta clé' : `Clé de ton org${i.owner.label ? ` ${i.owner.label}` : ''}`
    case 'platform': return 'Clé oto'
    default: return i.name
  }
}
// Équipe ACTIVE : une clé d'une autre équipe est listée (org_admin, multi-appartenance)
// mais n'est jamais lue par la cascade — cf. `lib/keyStack`.
const activeGroup = computed<number | null>(() => me.value?.active_group ?? null)
const stateOf = (i: ConnectorInstance): RowState => rowState(i, effective.value, activeGroup.value)
const STATE_LABEL: Record<RowState, string> = {
  used: 'utilisée',
  reserve: 'en réserve — prendrait le relais',
  suspended: 'mise de côté',
  inactive_team: 'inactive — autre équipe',
}
const STATE_TONE: Record<RowState, DotTone> = {
  used: 'olive', reserve: 'faint', suspended: 'faint', inactive_team: 'faint',
}

// Santé de la clé (flag backend posé par la sonde verify) : une erreur RÉELLE prime
// visuellement sur l'état de cascade — une clé « utilisée » mais KO n'est pas un bon état.
const healthKo = computed(() => !!status.value?.health_ko)
const healthReason = computed(() => status.value?.health_reason || '')
const koOn = (i: ConnectorInstance) => isHealthKo(i, healthKo.value)
const toneOf = (i: ConnectorInstance): DotTone => (koOn(i) ? 'terra' : STATE_TONE[stateOf(i)])

// Pile triée par proximité (la plus proche d'abord).
const rows = computed(() =>
  [...instances.value].sort((a, b) => (LEVEL_RANK[a.level] ?? 9) - (LEVEL_RANK[b.level] ?? 9)))

const memberRow = computed(() => rows.value.find((i) => i.level === 'member' && i.via !== 'shared_with_me'))
// Relais (CDC P8, « les dialogs disent la vérité ») : ce qui RÉSOUDRAIT à la place de
// la clé perso si on la retire = la clé la plus proche en dessous, non suspendue, hors
// prêt nominatif (le prêt s'utilise par pin, pas en repli automatique).
const relayInstance = computed(() => relayOf(rows.value, memberRow.value, activeGroup.value))
const relay = computed(() => relayFor(rows.value, memberRow.value, activeGroup.value))
// Mot du fournisseur pour un compte (registre) — « compte » à défaut.
const accountNoun = computed(() => c.value.auth?.account_noun || 'compte')
// Note du dialog de retrait (CDC P8, « les dialogs disent la vérité ») : l'état de santé
// vient EN PREMIER, c'est lui qui justifie souvent le retrait — retirer une clé morte
// n'est pas une perte, et l'utilisateur doit le savoir avant de renoncer.
const relayNote = computed(() => {
  const ko = healthKo.value
    ? `Son dernier test a échoué${healthReason.value ? ` (${healthReason.value})` : ''}. `
    : ''
  const r = relay.value
  if (r.kind === 'instance')
    return ko + `${levelName(r.instance)}${accountSuffix(r.instance)} prendra le relais.`
  // Multi-compte : plusieurs clés restent au même niveau, et la cascade n'en choisit
  // aucune d'office — le dire, plutôt qu'en désigner une au hasard ou annoncer une
  // perte qui n'aura pas lieu.
  if (r.kind === 'ambiguous')
    return ko + `Il te restera ${r.count} ${accountNoun.value}s — ton agent devra `
      + 'préciser lequel utiliser, ou tu en désignes un par défaut.'
  return ko + 'Aucune clé ne prendra le relais — ton agent perdra ce connecteur.'
})
const hasSuspended = computed(() => instances.value.some((i) => i.suspended))
const hasSpecial = computed(() => instances.value.some((i) => i.via === 'shared_with_me' || i.via === 'personal_cross_org'))
// Déplier auto (principe 7) : ≥2 clés, une suspendue, ou un contexte spécial (prêt/cross-org).
const autoOpen = computed(() => rows.value.length >= 2 || hasSuspended.value || hasSpecial.value)
const open = ref(false)
const expanded = computed(() => open.value || autoOpen.value)

// Bandeau de contexte (principe 7) : nomme org (+ équipe si présente). RIEN en solo
// (principe 9 : l'org, c'est toi — on ne nomme pas un contexte d'org).
const contextLabel = computed(() => {
  if (isPersonal.value) return ''
  const org = me.value?.active_org_name
  const grp = me.value?.active_group_name
  if (!org) return ''
  return grp ? `clés pour ${org} · équipe ${grp}` : `clés pour ${org}`
})

function fmtDate(s?: string | null): string {
  if (!s) return ''
  const d = s.slice(0, 10).split('-')
  return d.length === 3 ? `${d[2]}/${d[1]}` : s
}
function meta(i: ConnectorInstance): string {
  const who = i.set_by ? `posée par ${i.set_by}` : 'posée'
  const when = i.set_at ? ` · ${fmtDate(i.set_at)}` : ''
  return who + when
}

// Tester la clé effective (sonde de vérification) — retour en toast.
const testing = ref(false)
async function test() {
  if (!props.lever.verify) return
  testing.value = true
  try {
    const r = await props.lever.verify(c.value)
    toast(r.ok ? '✓ connexion OK' : `✗ ${r.error ?? 'échec'}`)
  } catch (e) { toast(humanize(e)) } finally { testing.value = false }
}

// Suspendre / réactiver (B7). Bloqué si rien ne prendrait le relais.
const busy = ref(false)
async function toggleSuspend(i: ConnectorInstance) {
  const next = !i.suspended
  // MÊME calcul de relais que le dialog de retrait (`relayOf`) : le filtre naïf comptait
  // comme filet une clé d'équipe inactive ou un prêt nominatif — ni l'un ni l'autre ne
  // résout, et la garde laissait alors l'agent perdre le connecteur en le niant.
  if (next && !relayOf(rows.value, i, activeGroup.value)) {
    toast('Rien ne prendrait le relais — ton agent perdrait ce connecteur.')
    return
  }
  busy.value = true
  try {
    await suspendInstance(c.value.name, next, i.account || '')
    toast(next ? 'Clé suspendue — la clé du dessous prend le relais.' : 'Clé réactivée.')
    await Promise.all([load(), reloadMe()])
  } catch (e) { toast(humanize(e)) } finally { busy.value = false }
}
</script>

<template>
  <div class="ks">
    <div v-if="loading" class="helptext">chargement…</div>

    <template v-else-if="!expanded">
      <!-- Forme repliée : la clé effective en une ligne. -->
      <div v-if="rows[0]" class="ks-line">
        <Dot :tone="toneOf(rows[0])" />
        <span class="ks-name">{{ levelName(rows[0]) }}{{ accountSuffix(rows[0]) }}</span>
        <span v-if="koOn(rows[0])" class="ks-ko">{{ healthReason || 'connexion KO' }}</span>
        <span v-else class="ks-meta">{{ meta(rows[0]) }}</span>
      </div>
      <div v-else class="ks-line">
        <Dot tone="saffron" /><span class="ks-name">Aucune clé</span>
      </div>
      <button v-if="rows.length" class="ks-toggle" @click="open = true">D’où vient la clé ?</button>
    </template>

    <template v-else>
      <!-- Pile dépliée. -->
      <div v-if="contextLabel" class="ks-context mono">{{ contextLabel }}</div>
      <div v-if="!rows.length" class="helptext">aucune clé posée à un niveau qui te concerne.</div>
      <ul class="ks-stack">
        <li v-for="i in rows" :key="i.ref" class="ks-row" :class="[stateOf(i), { ko: koOn(i) }]">
          <div class="ks-row-head">
            <Dot :tone="toneOf(i)" />
            <span class="ks-name">{{ levelName(i) }}{{ accountSuffix(i) }}</span>
            <!-- Santé (erreur réelle) prime sur l'état de cascade : une clé « utilisée »
                 mais KO doit se lire comme cassée, pas comme opérationnelle. -->
            <span v-if="koOn(i)" class="ks-tag ko">connexion KO — reconnecte</span>
            <span v-else class="ks-tag" :class="stateOf(i)">{{ STATE_LABEL[stateOf(i)] }}</span>
          </div>
          <div v-if="koOn(i) && healthReason" class="ks-row-meta ks-ko">{{ healthReason }}</div>
          <div class="ks-row-meta">{{ meta(i) }}</div>
          <div v-if="i.level === 'member' && i.via !== 'shared_with_me'" class="ks-actions">
            <template v-if="i.suspended">
              <Btn kind="mini" :disabled="busy" @click="toggleSuspend(i)">Réactiver</Btn>
            </template>
            <template v-else>
              <Btn v-if="connector.verifiable && lever.verify" kind="mini" :disabled="testing" @click="test">Tester</Btn>
              <Btn kind="mini" @click="lever.configureKey(connector)">Remplacer</Btn>
              <Btn kind="danger" @click="lever.removeKey(connector, relayNote)">Retirer</Btn>
              <Btn kind="mini" :disabled="busy" @click="toggleSuspend(i)">Suspendre</Btn>
            </template>
          </div>
        </li>
      </ul>
      <button v-if="!autoOpen" class="ks-toggle" @click="open = false">réduire</button>
    </template>
  </div>
</template>

<style scoped>
.ks { font-size: 12.5px; }
.ks-line { display: flex; align-items: center; gap: 8px; }
.ks-name { font-weight: 600; color: var(--color-ink); }
.ks-meta, .ks-row-meta { color: var(--color-faint); font-size: 11.5px; }
.ks-toggle { margin-top: 8px; background: none; border: none; padding: 0; cursor: pointer;
  color: var(--color-cobalt-ink); font-weight: 600; font-size: 12px; font-family: inherit; }
.ks-toggle:hover { text-decoration: underline; }
.ks-context { color: var(--color-faint); font-size: 11px; margin-bottom: 10px; }
.ks-stack { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.ks-row { border: 1px solid var(--color-hair); border-radius: var(--radius-md); padding: 11px 12px; background: var(--color-surface); }
.ks-row.used { border-color: var(--color-olive); background: var(--color-olive-soft); }
.ks-row.suspended, .ks-row.inactive_team { opacity: .72; }
/* Santé KO : l'erreur réelle reprend la ligne, quel que soit son rang de cascade. */
.ks-row.ko { border-color: var(--color-terra-ink); background: var(--color-surface); }
.ks-ko { color: var(--color-terra-ink); font-size: 11.5px; }
.ks-row-head { display: flex; align-items: center; gap: 8px; }
.ks-tag { margin-left: auto; font-family: var(--font-mono); font-size: 10px; letter-spacing: .03em;
  text-transform: uppercase; color: var(--color-faint); }
.ks-tag.used { color: var(--color-olive-ink); font-weight: 700; }
.ks-tag.ko { color: var(--color-terra-ink); font-weight: 700; }
.ks-row-meta { margin: 5px 0 0 20px; }
.ks-actions { display: flex; gap: 7px; flex-wrap: wrap; margin: 10px 0 0 20px; }
</style>
