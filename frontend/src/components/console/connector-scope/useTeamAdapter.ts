// Adaptateur ÉQUIPE (scope=team, /team/connectors). Deux leviers réels au grain équipe :
//  - DISPONIBILITÉ (ADR 0012 B1, restrict-only) : le chef d'équipe peut COUPER un
//    connecteur pour son équipe (jamais l'exposer au-delà de l'org — borné).
//  - CLÉ PARTAGÉE d'équipe (group secret, résolue avant la clé d'org — cascade perso ›
//    équipe › org › plateforme), sur les connecteurs à clé partageable.
// (L'ACCÈS d'équipe — B2 — suivra.)
import { computed, ref } from 'vue'
import type { CellVM, ConnectorScopeAdapter, ScopeCtx } from './adapter'
import {
  getConnectors, getGroupConnectorActivation, setGroupConnectorActivation, clearGroupConnectorActivation,
  setGroupSecret, deleteGroupSecret,
} from '@/api/console'
import { useTeamScope } from '@/composables/useTeamScope'
import { humanize } from '@/lib/errors'
import { fmtDate } from '@/types/api'
import type { ConnectorMeta, CredentialField, GroupConnectorActivation, GroupSecret } from '@/types/api'

const SHAREABLE = new Set(['api_key', 'fields'])

export function useTeamAdapter(ctx: ScopeCtx): ConnectorScopeAdapter<GroupConnectorActivation> {
  const team = useTeamScope()
  const rows = ref<GroupConnectorActivation[]>([])
  const metaMap = ref<Record<string, ConnectorMeta>>({})
  const ready = ref(false)
  const error = ref<string | null>(null)

  const meta = (r: GroupConnectorActivation) => metaMap.value[r.connector]
  const shareable = (r: GroupConnectorActivation) => SHAREABLE.has(metaMap.value[r.connector]?.secret_kind ?? '')
  const canManage = computed(() => team.canManage.value)

  const secrets = computed<GroupSecret[]>(() => team.detail.value?.secrets ?? [])
  const keyed = computed(() => new Map(secrets.value.map((s) => [s.provider, s])))
  const hasKey = (name: string) => keyed.value.has(name)
  const keyOf = (name: string) => keyed.value.get(name) ?? null

  async function load() {
    const gid = team.groupId.value
    if (gid == null) { rows.value = []; ready.value = true; return }
    try {
      const [act, cat] = await Promise.all([
        getGroupConnectorActivation(gid),
        getConnectors().catch(() => ({ connectors: [] as ConnectorMeta[] })),
      ])
      rows.value = act.connectors
      metaMap.value = Object.fromEntries(cat.connectors.map((c) => [c.name, c]))
    } catch (e) { error.value = humanize(e) } finally { ready.value = true }
  }
  async function reload() { await Promise.all([load(), team.reload()]) }

  // ── disponibilité (restrict-only, bornée par l'org) ──
  async function setAvailable(r: GroupConnectorActivation, on: boolean) {
    const gid = team.groupId.value
    if (gid == null || !canManage.value) return
    try {
      if (on) await clearGroupConnectorActivation(gid, r.connector)
      else await setGroupConnectorActivation(gid, r.connector, false)
      ctx.toast(`${r.label} : ${on ? 'ré-ouvert pour l\'équipe' : 'coupé pour l\'équipe'}`)
      await load()
    } catch (e) { ctx.toast(humanize(e)) }
  }

  // ── clé partagée d'équipe ──
  function editKey(r: GroupConnectorActivation) {
    const m = metaMap.value[r.connector]
    const multi = m?.secret_kind === 'fields' && (m.credential_fields?.length ?? 0) > 0
    const fields: CredentialField[] = multi
      ? m!.credential_fields
      : [{ name: 'api_key', label: `clé api ${r.label}`, secret: true, required: true }]
    ctx.openCredential({
      label: r.label, fields, single: !multi,
      onConfirm: async (values) => {
        const gid = team.groupId.value
        if (gid == null) return
        await setGroupSecret(gid, r.connector, multi ? '' : (values.api_key ?? ''), undefined, multi ? values : undefined)
        ctx.toast(`${r.label}: team key saved`)
        await reload()
      },
    })
  }
  async function removeKey(r: GroupConnectorActivation) {
    const gid = team.groupId.value
    if (gid == null) return
    if (!await ctx.confirmAction({
      title: 'remove shared key', danger: true, confirmLabel: 'Remove',
      message: `remove the shared ${r.label} key? members without their own key lose access.`,
    })) return
    try { await deleteGroupSecret(gid, r.connector); ctx.toast('shared key removed'); await reload() }
    catch (e) { ctx.toast(humanize(e)) }
  }

  return {
    scope: 'team',
    rows, ready, error, load, reload,
    listTitle: "connecteurs de l'équipe",
    listSub: "coupe un connecteur pour ton équipe (borné par l'org — tu ne peux que "
      + 'restreindre) et pose une clé partagée d\'équipe (résolue avant la clé d\'org). '
      + 'clique une ligne pour ses leviers.',
    emptyText: "aucun connecteur disponible pour l'org.",
    searchPlaceholder: 'search…',
    key: (r) => r.connector,
    meta,
    label: (r) => r.label,
    category: (r) => meta(r)?.category ?? '',
    searchText: (r) => `${r.connector} ${r.label}`,
    sortRank: (r) => (r.effective ? 0 : 1),
    categoryValues: () => rows.value.map((r) => meta(r)?.category ?? ''),
    columns: [
      { key: 'availability', label: 'disponibilité' },
      { key: 'key', label: "clé d'équipe" },
    ],
    cell: (r, col): CellVM | undefined => {
      if (col === 'availability') {
        if (r.effective) return { dot: 'olive', label: 'disponible' }
        return { dot: 'faint', label: 'coupé', sub: r.group_cut ? 'par l\'équipe' : 'par l\'org', muted: true }
      }
      if (col === 'key') {
        if (!shareable(r)) return { label: '—', muted: true }
        if (!hasKey(r.connector)) return { label: 'aucune', muted: true }
        const s = keyOf(r.connector)
        const date = fmtDate(s?.set_at)
        return { dot: 'olive', label: 'posée', sub: (s?.base_url ? 'remote bridge' : 'api key') + (date ? ` · ${date}` : '') }
      }
      return undefined
    },
    hasDrawer: true,
    tabs: () => [{ key: 'main', label: 'gouvernance' }, { key: 'about', label: 'à propos' }],
    availability: {
      variant: 'binary',
      title: 'disponibilité pour ton équipe',
      state: (r) => r.effective
        ? { on: true, label: 'disponible pour tes membres', tone: 'olive', note: "borné par l'org — tu ne peux que couper, pas exposer au-delà." }
        : { on: false, label: r.group_cut ? "coupé pour l'équipe" : "coupé par l'org", tone: 'faint', note: r.group_cut ? "borné par l'org — tu ne peux que couper." : "l'org a coupé ce connecteur — l'équipe ne peut pas le ré-ouvrir." },
      // On ne peut agir que si l'org l'expose (sinon c'est l'org qui a coupé, hors de portée de l'équipe).
      canEdit: (r) => canManage.value && r.org_available,
      set: (r, next) => setAvailable(r, next as boolean),
    },
    credential: {
      title: "clé partagée d'équipe",
      state: (r) => !shareable(r)
        ? { present: false, label: 'pas de clé partageable pour ce connecteur' }
        : (hasKey(r.connector)
            ? { present: true, label: 'posée', sub: fmtDate(keyOf(r.connector)?.set_at) ?? undefined }
            : { present: false, label: 'aucune clé' }),
      canEdit: (r) => canManage.value && shareable(r),
      edit: (r) => editKey(r),
      remove: (r) => removeKey(r),
    },
  }
}
