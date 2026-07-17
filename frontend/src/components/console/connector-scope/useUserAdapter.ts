// Adaptateur USER (scope=user/work, /connectors → onglet « mine »). Leviers propres au
// membre : EXPOSITION 3-états (off/muted/live, connector_selection ADR 0019), CONNEXION
// (couche d'auth ADR 0024 — widgets clé/oauth/session/hosted/fédéré, réutilisés verbatim)
// et OUTILS (toggles). Réplique la logique de l'ex-`ConnectorsView` + `ConnectorDrawer`.
import { computed, ref } from 'vue'
import type { CellVM, ConnectorScopeAdapter, ExposureState, ScopeCtx, ToolRow } from './adapter'
import {
  getMyConnectors, getTools, getToolRegistry,
  selectConnector, pauseConnector, unselectConnector,
  setCredential, deleteApiKey, verifyConnector, enableTool, disableTool,
} from '@/api/console'
import { useMe } from '@/composables/useMe'
import { humanize } from '@/lib/errors'
import { connectorVerdict } from '@/lib/connectorVerdict'
import type { ConnectorState, MyConnector, ToolEntry } from '@/types/api'

export function useUserAdapter(ctx: ScopeCtx): ConnectorScopeAdapter<MyConnector> {
  const { me, reload: reloadMe } = useMe()
  const rows = ref<MyConnector[]>([])
  const tools = ref<(ToolEntry & { description?: string })[]>([])
  const ready = ref(false)
  const error = ref<string | null>(null)

  const nsOf = (name: string) => name.split('_')[0] ?? name
  const toolsOf = (r: MyConnector): ToolRow[] => {
    const ns = new Set(r.namespaces)
    return tools.value.filter((t) => ns.has(nsOf(t.name)))
  }
  const modeOf = (r: MyConnector) => me.value?.providers?.[r.name]?.mode

  async function load() {
    try {
      const [mc, tl, reg] = await Promise.all([
        getMyConnectors(), getTools(),
        getToolRegistry().catch(() => ({ tools: [], count: 0 })),
      ])
      rows.value = mc.connectors
      const desc = new Map(reg.tools.map((t) => [t.name, t.description]))
      tools.value = tl.tools.map((t) => ({ ...t, description: desc.get(t.name) }))
    } catch (e) { error.value = humanize(e) } finally { ready.value = true }
  }
  async function reload() { await Promise.all([load(), reloadMe()]) }

  async function setExposure(r: MyConnector, exp: ExposureState) {
    const s: ConnectorState = exp === 'live' ? 'active' : exp === 'muted' ? 'paused' : 'not_selected'
    if (r.state === s) return
    try {
      if (s === 'active') await selectConnector(r.name)
      else if (s === 'paused') await pauseConnector(r.name)
      else await unselectConnector(r.name)
      r.state = s
    } catch (e) { ctx.toast(humanize(e)) }
  }

  const ORDER: Record<ConnectorState, number> = { active: 0, paused: 1, not_selected: 2 }
  const EXP_CELL: Record<ConnectorState, { label: string; tone: CellVM['dot'] }> = {
    active: { label: 'live', tone: 'olive' },
    paused: { label: 'muted', tone: 'saffron' },
    not_selected: { label: 'off', tone: 'faint' },
  }

  return {
    scope: 'user',
    rows, ready, error, load, reload,
    listTitle: 'all connectors',
    listSub: 'everything oto can drive — connect what you need, expose only the tools you trust.',
    emptyText: 'no connector matches your filters.',
    searchPlaceholder: 'search connectors, tools, publishers…',
    key: (r) => r.name,
    meta: (r) => r,
    label: (r) => r.label,
    category: (r) => r.category,
    searchText: (r) => [r.label, r.name, r.publisher, r.category, ...r.namespaces, ...toolsOf(r).map((t) => t.name)].join(' '),
    sortRank: (r) => ORDER[r.state],
    categoryValues: () => rows.value.map((r) => r.category),
    lenses: [
      { key: 'all', label: 'all', match: () => true },
      { key: 'connected', label: 'connected', match: (r) => r.state !== 'not_selected' },
      { key: 'available', label: 'available', match: (r) => r.state === 'not_selected' },
      { key: 'shared', label: 'shared', match: (r) => { const m = modeOf(r); return m === 'org' || m === 'group' } },
    ],
    columns: [
      { key: 'etat', label: 'état' },
      { key: 'tools', label: 'outils' },
    ],
    cell: (r, col): CellVM | undefined => {
      if (col === 'etat') {
        // Le verdict d'abord, en langage clair (CDC principe 1) : dot + phrase qui
        // encode la cause (installation × résolution × option) sans nommer les couches.
        const v = connectorVerdict(r, me.value?.providers?.[r.name],
          { isPersonal: me.value?.active_org_is_personal })
        return { dot: v.dot, label: v.list }
      }
      if (col === 'tools') {
        const ts = toolsOf(r)
        const enabled = ts.filter((t) => t.enabled).length
        const pct = ts.length ? Math.round((enabled / ts.length) * 100) : 0
        return { bar: { pct }, sub: `${enabled}/${ts.length}` }
      }
      return undefined
    },
    hasDrawer: true,
    tabs: (r) => [
      { key: 'connection', label: 'connection' },
      { key: 'tools', label: 'tools', badge: `${toolsOf(r).filter((t) => t.enabled).length}/${toolsOf(r).length}` },
      { key: 'about', label: 'about' },
    ],
    availability: {
      variant: 'exposure3',
      title: 'exposure — what your agents see',
      state: (r) => ({
        on: r.state === 'active',
        muted: r.state === 'paused',
        exposure: (r.state === 'active' ? 'live' : r.state === 'paused' ? 'muted' : 'off') as ExposureState,
        label: EXP_CELL[r.state].label,
        tone: EXP_CELL[r.state].tone ?? 'faint',
        note: r.state === 'active'
          ? undefined
          : r.state === 'paused'
            ? 'connected, but every tool is hidden from your agents right now. your selection is kept.'
            : "not added to your workspace — set it live to expose its tools.",
      }),
      canEdit: () => true,
      set: (r, next) => setExposure(r, next as ExposureState),
    },
    connection: {
      configureKey: (r) => {
        const fields = r.credential_fields ?? []
        if (!fields.length) return
        ctx.openCredential({
          label: r.label, fields, single: fields.length === 1,
          verify: r.verifiable ? () => verifyConnector(r.name) : undefined,
          onConfirm: async (values) => {
            await setCredential(r.name, values)
            ctx.toast(`${r.label} ${fields.length === 1 ? 'key saved' : 'connected'}`)
            await reload()
          },
        })
      },
      removeKey: async (r) => {
        if (!await ctx.confirmAction({ title: 'remove key', danger: true, confirmLabel: 'Remove', message: `remove your ${r.label} key?` })) return
        try { await deleteApiKey(r.name); ctx.toast('key removed'); await reload() }
        catch (e) { ctx.toast(humanize(e)) }
      },
      verify: (r) => verifyConnector(r.name),
    },
    tools: {
      list: (r) => toolsOf(r),
      toggle: async (t) => {
        if (t.protected) return
        try {
          if (t.enabled) { await disableTool(t.name); t.enabled = false }
          else { await enableTool(t.name); t.enabled = true }
        } catch (e) { ctx.toast(humanize(e)) }
      },
      setAll: async (r, on) => {
        const targets = toolsOf(r).filter((t) => !t.protected && t.enabled !== on)
        try {
          await Promise.all(targets.map((t) => (on ? enableTool(t.name) : disableTool(t.name))))
          targets.forEach((t) => { t.enabled = on })
        } catch (e) { ctx.toast(humanize(e)) }
      },
    },
  }
}
