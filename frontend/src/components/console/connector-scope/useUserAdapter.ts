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
  getOrgFieldFilters,
} from '@/api/console'
import { useMe } from '@/composables/useMe'
import { humanize } from '@/lib/errors'
import { connectorVerdict } from '@/lib/connectorVerdict'
import type { ConnectorState, FieldFiltersBundle, MyConnector, ToolEntry } from '@/types/api'

export function useUserAdapter(ctx: ScopeCtx): ConnectorScopeAdapter<MyConnector> {
  const { me, reload: reloadMe } = useMe()
  const rows = ref<MyConnector[]>([])
  const tools = ref<(ToolEntry & { description?: string })[]>([])
  const filters = ref<FieldFiltersBundle | null>(null)
  const ready = ref(false)
  const error = ref<string | null>(null)

  // Confidentialité / rédaction (CDC M2d) : même policy d'org que /org/connectors —
  // le drawer user est le RACCOURCI (solo = org_admin de son org perso ; membre = lecture).
  const orgId = computed(() => me.value?.active_org ?? null)
  const isOrgAdmin = computed(() => me.value?.org_role === 'org_admin')
  const isPersonal = computed(() => !!me.value?.active_org_is_personal)
  const installed = (r: MyConnector) => r.state !== 'not_selected'

  const nsOf = (name: string) => name.split('_')[0] ?? name
  const toolsOf = (r: MyConnector): ToolRow[] => {
    const ns = new Set(r.namespaces)
    return tools.value.filter((t) => ns.has(nsOf(t.name)))
  }
  const modeOf = (r: MyConnector) => me.value?.providers?.[r.name]?.mode

  async function load() {
    try {
      const [mc, tl, reg, ff] = await Promise.all([
        getMyConnectors(), getTools(),
        getToolRegistry().catch(() => ({ tools: [], count: 0 })),
        orgId.value != null ? getOrgFieldFilters(orgId.value).catch(() => null) : Promise.resolve(null),
      ])
      rows.value = mc.connectors
      const desc = new Map(reg.tools.map((t) => [t.name, t.description]))
      tools.value = tl.tools.map((t) => ({ ...t, description: desc.get(t.name) }))
      filters.value = ff
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
    active: { label: 'Actif', tone: 'olive' },
    paused: { label: 'En veille', tone: 'saffron' },
    not_selected: { label: 'Non installé', tone: 'faint' },
  }

  return {
    scope: 'user',
    rows, ready, error, load, reload,
    listTitle: 'Connecteurs',
    listSub: 'branche ce dont ton agent a besoin',
    emptyText: 'aucun connecteur ne correspond à tes filtres.',
    searchPlaceholder: 'chercher un connecteur ou un outil…',
    key: (r) => r.name,
    meta: (r) => r,
    label: (r) => r.label,
    category: (r) => r.category,
    searchText: (r) => [r.label, r.name, r.publisher, r.category, ...r.namespaces, ...toolsOf(r).map((t) => t.name)].join(' '),
    sortRank: (r) => ORDER[r.state],
    categoryValues: () => rows.value.map((r) => r.category),
    lenses: [
      { key: 'all', label: 'tous les statuts', match: () => true },
      { key: 'connected', label: 'connectés', match: (r) => r.state !== 'not_selected' },
      { key: 'available', label: 'disponibles', match: (r) => r.state === 'not_selected' },
      { key: 'shared', label: 'partagés', match: (r) => { const m = modeOf(r); return m === 'org' || m === 'group' } },
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
      { key: 'connection', label: 'connexion' },
      { key: 'tools', label: 'outils', badge: `${toolsOf(r).filter((t) => t.enabled).length}/${toolsOf(r).length}` },
      // Confidentialité (CDC M2d) : seulement une fois le connecteur installé (rien à
      // masquer sur un « à connecter ») et si le connecteur porte une clé (open data exclu).
      ...(installed(r) && r.auth.method !== 'none' ? [{ key: 'redaction', label: 'confidentialité' }] : []),
      { key: 'about', label: 'à propos' },
    ],
    availability: {
      variant: 'exposure3',
      title: 'exposition — ce que voit ton agent',
      state: (r) => ({
        on: r.state === 'active',
        muted: r.state === 'paused',
        exposure: (r.state === 'active' ? 'live' : r.state === 'paused' ? 'muted' : 'off') as ExposureState,
        label: EXP_CELL[r.state].label,
        tone: EXP_CELL[r.state].tone ?? 'faint',
        note: r.state === 'active'
          ? undefined
          : r.state === 'paused'
            ? 'connecté, mais tous ses outils sont masqués à ton agent pour l\'instant. ta sélection est conservée.'
            : "pas installé — passe-le en actif pour exposer ses outils.",
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
            ctx.toast(`${r.label} ${fields.length === 1 ? 'clé enregistrée' : 'connecté'}`)
            await reload()
          },
        })
      },
      removeKey: async (r) => {
        if (!await ctx.confirmAction({ title: 'retirer la clé', danger: true, confirmLabel: 'Retirer', message: `retirer ta clé ${r.label} ?` })) return
        try { await deleteApiKey(r.name); ctx.toast('clé retirée'); await reload() }
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
    redaction: {
      props: (r) => {
        const b = filters.value
        const name = r.name
        return {
          service: name,
          fields: b?.schemas?.[name] ?? [],
          rules: b?.filters?.[name]?.rules ?? b?.defaults?.[name]?.rules ?? [],
          defaultRules: b?.defaults?.[name]?.rules ?? [],
          templates: b?.templates,
          actionSchema: b?.schema ?? [],
          customized: !!b?.filters?.[name],
          orgId: orgId.value,
          isOrgAdmin: isOrgAdmin.value,
          // Membre non-admin = lecture seule ; note de portée adaptée à la structure
          // (principe 9) : solo → aucun mot « org » ; admin multi → « toute ton org ».
          readonly: !isOrgAdmin.value,
          scopeNote: (isPersonal.value ? 'personal' : isOrgAdmin.value ? 'org-wide' : 'readonly') as
            'personal' | 'org-wide' | 'readonly',
        }
      },
      onChanged: () => { if (orgId.value != null) getOrgFieldFilters(orgId.value).then((f) => { filters.value = f }).catch(() => {}) },
    },
  }
}
