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
import type { ConnectionLever } from './adapter'
import type { ConnectorInstance, MyConnector } from '@/types/api'
import type { DotTone } from '@/lib/consoleTypes'

const props = defineProps<{ connector: MyConnector; lever: ConnectionLever<MyConnector> }>()
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
  } catch (e) { toast(humanize(e)) } finally { loading.value = false }
}
onMounted(load)

// Solo (org perso, principe 9) : jamais les mots « org » ni « équipe ».
const isPersonal = computed(() => !!me.value?.active_org_is_personal)

const LEVEL_RANK: Record<string, number> = { member: 0, group: 1, org: 2, platform: 3 }
// Nom contextuel d'un niveau (principe 8) — court, sans pédagogie de cascade.
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
type RowState = 'used' | 'reserve' | 'suspended'
function rowState(i: ConnectorInstance): RowState {
  if (i.suspended) return 'suspended'
  if (i.level === effective.value && i.via !== 'shared_with_me') return 'used'
  return 'reserve'
}
const STATE_LABEL: Record<RowState, string> = {
  used: 'utilisée',
  reserve: 'en réserve — prendrait le relais',
  suspended: 'mise de côté',
}
const STATE_TONE: Record<RowState, DotTone> = { used: 'olive', reserve: 'faint', suspended: 'faint' }

// Pile triée par proximité (la plus proche d'abord).
const rows = computed(() =>
  [...instances.value].sort((a, b) => (LEVEL_RANK[a.level] ?? 9) - (LEVEL_RANK[b.level] ?? 9)))

const memberRow = computed(() => rows.value.find((i) => i.level === 'member' && i.via !== 'shared_with_me'))
// Relais (CDC P8, « les dialogs disent la vérité ») : ce qui RÉSOUDRAIT à la place de
// la clé perso si on la retire = la clé la plus proche en dessous, non suspendue, hors
// prêt nominatif (le prêt s'utilise par pin, pas en repli automatique).
const relayInstance = computed(() =>
  rows.value.find((i) => i !== memberRow.value && !i.suspended && i.via !== 'shared_with_me') ?? null)
const relayNote = computed(() => relayInstance.value
  ? `${levelName(relayInstance.value)} prendra le relais.`
  : 'Aucune clé ne prendra le relais — ton agent perdra ce connecteur.')
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
  if (next && rows.value.filter((r) => !r.suspended && r !== i).length === 0) {
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
        <Dot :tone="STATE_TONE[rowState(rows[0])]" />
        <span class="ks-name">{{ levelName(rows[0]) }}</span>
        <span class="ks-meta">{{ meta(rows[0]) }}</span>
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
        <li v-for="i in rows" :key="i.ref" class="ks-row" :class="rowState(i)">
          <div class="ks-row-head">
            <Dot :tone="STATE_TONE[rowState(i)]" />
            <span class="ks-name">{{ levelName(i) }}</span>
            <span class="ks-tag" :class="rowState(i)">{{ STATE_LABEL[rowState(i)] }}</span>
          </div>
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
.ks-row.suspended { opacity: .72; }
.ks-row-head { display: flex; align-items: center; gap: 8px; }
.ks-tag { margin-left: auto; font-family: var(--font-mono); font-size: 10px; letter-spacing: .03em;
  text-transform: uppercase; color: var(--color-faint); }
.ks-tag.used { color: var(--color-olive-ink); font-weight: 700; }
.ks-row-meta { margin: 5px 0 0 20px; }
.ks-actions { display: flex; gap: 7px; flex-wrap: wrap; margin: 10px 0 0 20px; }
</style>
