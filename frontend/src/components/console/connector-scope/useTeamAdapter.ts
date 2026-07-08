// Adaptateur ÉQUIPE (scope=team, /team/connectors). Levier au grain équipe = la CLÉ
// PARTAGÉE d'équipe (`group secret`, résolue avant celle de l'org pour les membres —
// cascade perso › équipe › org › plateforme). La disponibilité et l'accès d'équipe
// (leviers réels) arrivent avec le backend B1/B2 (plan connector-scope) : ici omis
// (jamais de levier inerte). Réplique la logique de l'ex-`GroupConnectorsCard`.
import { computed, ref } from 'vue'
import type { ConnectorScopeAdapter, ScopeCtx } from './adapter'
import { getConnectors, setGroupSecret, deleteGroupSecret } from '@/api/console'
import { useTeamScope } from '@/composables/useTeamScope'
import { humanize } from '@/lib/errors'
import { fmtDate } from '@/types/api'
import type { ConnectorMeta, CredentialField, GroupSecret } from '@/types/api'

// Connecteurs à clé partageable : clé simple (`api_key`) ou multi-champs (`fields`).
const SHAREABLE = new Set(['api_key', 'fields'])

export function useTeamAdapter(ctx: ScopeCtx): ConnectorScopeAdapter<ConnectorMeta> {
  const team = useTeamScope()
  const rows = ref<ConnectorMeta[]>([])
  const ready = ref(false)
  const error = ref<string | null>(null)

  const secrets = computed<GroupSecret[]>(() => team.detail.value?.secrets ?? [])
  const keyed = computed(() => new Map(secrets.value.map((s) => [s.provider, s])))
  const hasKey = (name: string) => keyed.value.has(name)
  const keyOf = (name: string) => keyed.value.get(name) ?? null

  async function load() {
    try {
      rows.value = (await getConnectors()).connectors.filter((c) => SHAREABLE.has(c.secret_kind))
    } catch (e) { error.value = humanize(e) } finally { ready.value = true }
  }
  // Le secret d'équipe vit dans le detail du groupe → on recharge le detail.
  async function reload() { await team.reload() }

  function editKey(c: ConnectorMeta) {
    const multi = c.secret_kind === 'fields' && (c.credential_fields?.length ?? 0) > 0
    const fields: CredentialField[] = multi
      ? c.credential_fields
      : [{ name: 'api_key', label: `clé api ${c.label}`, secret: true, required: true }]
    ctx.openCredential({
      label: c.label, fields, single: !multi,
      onConfirm: async (values) => {
        const gid = team.groupId.value
        if (gid == null) return
        await setGroupSecret(gid, c.name, multi ? '' : (values.api_key ?? ''), undefined, multi ? values : undefined)
        ctx.toast(`${c.label}: team key saved`)
        await reload()
      },
    })
  }
  async function removeKey(c: ConnectorMeta) {
    const gid = team.groupId.value
    if (gid == null) return
    if (!await ctx.confirmAction({
      title: 'remove shared key', danger: true, confirmLabel: 'Remove',
      message: `remove the shared ${c.label} key? members without their own key lose access.`,
    })) return
    try { await deleteGroupSecret(gid, c.name); ctx.toast('shared key removed'); await reload() }
    catch (e) { ctx.toast(humanize(e)) }
  }

  return {
    scope: 'team',
    rows, ready, error, load, reload,
    listTitle: 'connectors',
    listSub: "connecteurs que cette équipe peut partager via une clé d'équipe — résolue avant "
      + 'la clé d\'org pour les membres de l\'équipe (cascade perso › équipe › org › plateforme).',
    emptyText: 'aucun connecteur partageable.',
    searchPlaceholder: 'search…',
    key: (c) => c.name,
    meta: (c) => c,
    label: (c) => c.label,
    category: (c) => c.category ?? '',
    searchText: (c) => `${c.name} ${c.label}`,
    sortRank: (c) => (hasKey(c.name) ? 0 : 1),
    columns: [{ key: 'credential', label: "clé d'équipe" }],
    cell: (c, col) => {
      if (col !== 'credential') return undefined
      if (!hasKey(c.name)) return { label: 'aucune', muted: true }
      const s = keyOf(c.name)
      const date = fmtDate(s?.set_at)
      return { dot: 'olive', label: 'posée', sub: (s?.base_url ? 'remote bridge' : 'api key') + (date ? ` · ${date}` : '') }
    },
    hasDrawer: true,
    tabs: () => [{ key: 'credential', label: 'clé' }, { key: 'about', label: 'à propos' }],
    credential: {
      title: "clé partagée d'équipe",
      state: (c) => hasKey(c.name)
        ? { present: true, label: 'posée', sub: fmtDate(keyOf(c.name)?.set_at) ?? undefined }
        : { present: false, label: 'aucune clé' },
      canEdit: () => team.canManage.value,
      edit: (c) => editKey(c),
      remove: (c) => removeKey(c),
    },
  }
}
