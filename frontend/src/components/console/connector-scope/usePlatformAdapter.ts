// Adaptateur PLATEFORME (scope=platform, /platform/connectors). Leviers : master
// switch d'activation (deny-by-default, effet au prochain restart) + clé plateforme
// (studio-owned, N labels par provider — multi-instance ; pose/retrait réservés
// super_admin). Réplique la logique de l'ex-`AdminConnectorsView`/`ConnectorAdminCard`.
import { computed, ref } from 'vue'
import type { CellVM, ConnectorScopeAdapter, ScopeCtx } from './adapter'
import {
  getAdminConnectors, setConnectorActivation, getConnectors,
  getPlatformKeys, createPlatformKey, deletePlatformKey,
} from '@/api/console'
import { useMe } from '@/composables/useMe'
import { humanize } from '@/lib/errors'
import type { ConnectorActivation, ConnectorMeta, PlatformKey } from '@/types/api'

export function usePlatformAdapter(ctx: ScopeCtx): ConnectorScopeAdapter<ConnectorActivation> {
  const { me } = useMe()
  const isSuperAdmin = computed(() => me.value?.role === 'super_admin')
  const rows = ref<ConnectorActivation[]>([])
  const metaMap = ref<Record<string, ConnectorMeta>>({})
  const keys = ref<PlatformKey[]>([])
  const ready = ref(false)
  const error = ref<string | null>(null)

  const meta = (c: ConnectorActivation) => metaMap.value[c.connector]
  const keysOf = (name: string) => keys.value.filter((k) => k.provider === name)
  // Accès plateforme pertinent ssi il y a de quoi ouvrir : clé plateforme (couche 2)
  // OU provider platform-éligible OU option payante (couche 3).
  const hasPlatformAccess = (c: ConnectorActivation) =>
    keysOf(c.connector).length > 0
    || !!meta(c)?.auth_modes?.includes('platform')
    || !!c.paid_option

  async function load() {
    try {
      const [act, cat, k] = await Promise.all([
        getAdminConnectors(),
        getConnectors().catch(() => ({ connectors: [] as ConnectorMeta[] })),
        getPlatformKeys().catch(() => ({ platform_keys: [] as PlatformKey[] })),
      ])
      rows.value = act.connectors
      metaMap.value = Object.fromEntries(cat.connectors.map((c) => [c.name, c]))
      keys.value = k.platform_keys
    } catch (e) { error.value = humanize(e) } finally { ready.value = true }
  }

  async function toggle(c: ConnectorActivation, next: boolean) {
    if (!next && !(await ctx.confirmAction({
      title: 'désactiver le connecteur', danger: true, confirmLabel: 'Désactiver',
      message: `désactiver « ${c.label} » sur toute la plateforme ? ses outils cessent d'être chargés au prochain redémarrage du serveur.`,
    }))) return
    try {
      await setConnectorActivation(c.connector, next)
      ctx.toast(`${c.label} ${next ? 'activé' : 'désactivé'} — effet au prochain redémarrage du serveur`)
      await load()
    } catch (e) { ctx.toast(humanize(e)) }
  }

  function addKey(c: ConnectorActivation) {
    ctx.openForm({
      title: `${c.label} — clé plateforme`,
      description: 'clé possédée par le studio, prêtée aux membres via des grants avec un quota quotidien. affichée une seule fois.',
      submitLabel: 'enregistrer',
      fields: [
        { key: 'label', label: 'libellé', initial: 'prod', required: true, hint: 're-poser le même libellé renouvelle la clé' },
        { key: 'api_key', label: 'clé api', type: 'password', required: true, placeholder: 'colle la clé' },
      ],
      onConfirm: async (v) => {
        try { await createPlatformKey(c.connector, v.label ?? '', v.api_key ?? ''); ctx.toast(`${c.connector}/${v.label} enregistrée`); await load() }
        catch (e) { ctx.toast(humanize(e)); throw e }
      },
    })
  }
  async function removeKey(provider: string, label: string) {
    if (!await ctx.confirmAction({
      title: 'supprimer la clé plateforme', danger: true, confirmLabel: 'Supprimer',
      message: `supprimer « ${provider}/${label} » ? les grants qui l'utilisent cesseront de résoudre.`,
    })) return
    try { await deletePlatformKey(provider, label); ctx.toast('clé supprimée'); await load() }
    catch (e) { ctx.toast(humanize(e)) }
  }

  return {
    scope: 'platform',
    rows, ready, error, load, reload: load,
    listTitle: 'connecteurs plateforme',
    listSub: 'ce que la plateforme autorise : master switch (deny-by-default, effet au prochain '
      + 'restart) + clé plateforme (studio-owned, prêtée via grants avec quota/jour).',
    emptyText: 'aucun connecteur',
    searchPlaceholder: 'rechercher…',
    key: (c) => c.connector,
    meta,
    label: (c) => c.label,
    category: (c) => meta(c)?.category ?? '',
    searchText: (c) => `${c.connector} ${c.label}`,
    sortRank: (c) => (c.enabled === true ? 0 : 1),
    categoryValues: () => rows.value.map((c) => meta(c)?.category ?? ''),
    columns: [
      { key: 'availability', label: 'activation' },
      { key: 'key', label: 'clé plateforme' },
    ],
    cell: (c, col): CellVM | undefined => {
      if (col === 'availability') {
        return c.enabled === true ? { dot: 'olive', label: 'actif' } : { label: 'inactif', muted: true }
      }
      if (col === 'key') {
        const ks = keysOf(c.connector)
        return ks.length ? { dot: 'cobalt', label: ks.map((k) => k.label).join(', ') } : { label: '—', muted: true }
      }
      return undefined
    },
    hasDrawer: true,
    // « accès plateforme » (ADR 0044 §H) : onglet montré ssi il y a quelque chose à
    // ouvrir — clé plateforme (couche 2) OU option payante (couche 3). Sinon omis
    // (DESIGN.md : jamais d'onglet inerte).
    tabs: (c) => [
      { key: 'main', label: 'activation' },
      ...(hasPlatformAccess(c) ? [{ key: 'access', label: 'accès plateforme' }] : []),
      { key: 'about', label: 'à propos' },
    ],
    availability: {
      variant: 'master',
      title: 'activation plateforme',
      state: (c) => c.enabled === true
        ? { on: true, label: 'actif sur toute la plateforme', tone: 'olive' }
        : { on: false, label: 'désactivé (par défaut : bloqué)', tone: 'faint' },
      canEdit: () => true,
      set: (c, next) => toggle(c, next as boolean),
    },
    credential: {
      title: 'clé plateforme',
      state: (c) => {
        const ks = keysOf(c.connector)
        return ks.length ? { present: true, label: `${ks.length} clé(s)` } : { present: false, label: 'aucune clé' }
      },
      canEdit: () => isSuperAdmin.value,
      edit: (c) => addKey(c),
      items: (c) => keysOf(c.connector).map((k) => ({ key: `${k.provider}/${k.label}`, label: k.label, sub: k.provider })),
      removeItem: (_c, key) => {
        const idx = key.indexOf('/')
        removeKey(key.slice(0, idx), key.slice(idx + 1))
      },
    },
    platformAccess: {
      provider: (c) => c.connector,
      isSuperAdmin: isSuperAdmin.value,
    },
  }
}
