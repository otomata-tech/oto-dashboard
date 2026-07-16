// Adaptateur ORG (scope=org, /org/connectors). Leviers : disponibilité BINAIRE (bornée
// par la plateforme = plancher dur), clé partagée d'org, accès (RBAC ADR 0025), rédaction
// de champs (ConnectorTransforms) et email (ConnectorEmail, connecteurs d'envoi). Réplique
// la logique de l'ex-`OrgConnectorsView` + `OrgConnectorDrawer`.
import { computed, ref } from 'vue'
import type {
  AclPrincipal, CellVM, ConnectorScopeAdapter, ScopeCtx,
} from './adapter'
import {
  getOrgConnectorActivation, setOrgConnectorActivation, clearOrgConnectorActivation,
  getOrgFieldFilters, getOrgEmailSettings, getConnectors, getOrg,
  setOrgSecret, deleteOrgSecret, verifyConnector,
  getConnectorAcl, setConnectorAccess, clearConnectorAccess, forceConnectorForMember, listGroups,
} from '@/api/console'
import { useMe } from '@/composables/useMe'
import { humanize } from '@/lib/errors'
import type {
  OrgConnectorActivation, ConnectorMeta, FieldFiltersBundle, EmailSettingsBundle,
  ConnectorAclEntry, GroupListItem, OrgMember,
} from '@/types/api'
import type { FormDialogField } from '@/composables/useFormDialog'

export function useOrgAdapter(ctx: ScopeCtx): ConnectorScopeAdapter<OrgConnectorActivation> {
  const { me } = useMe()
  const orgId = computed(() => me.value?.active_org ?? null)
  const isOrgAdmin = computed(() => me.value?.org_role === 'org_admin' || me.value?.role === 'admin')

  const rows = ref<OrgConnectorActivation[]>([])
  const metaMap = ref<Record<string, ConnectorMeta>>({})
  const filters = ref<FieldFiltersBundle | null>(null)
  const emailBundle = ref<EmailSettingsBundle | null>(null)
  const orgSecrets = ref<Set<string>>(new Set())
  const acl = ref<ConnectorAclEntry[]>([])
  const groups = ref<GroupListItem[]>([])
  const members = ref<OrgMember[]>([])
  const ready = ref(false)
  const error = ref<string | null>(null)

  const meta = (r: OrgConnectorActivation) => metaMap.value[r.connector]
  const canHaveKey = (r: OrgConnectorActivation) => {
    const k = metaMap.value[r.connector]?.secret_kind
    return k === 'api_key' || k === 'fields'
  }
  const hasOrgKey = (name: string) => orgSecrets.value.has(name)
  const aclFor = (name: string) => acl.value.filter((e) => e.connector === name)

  async function load() {
    if (orgId.value == null) { ready.value = true; return }
    try {
      const [act, ff, em, cat, org, aclRes, grps] = await Promise.all([
        getOrgConnectorActivation(orgId.value),
        getOrgFieldFilters(orgId.value).catch(() => null),
        getOrgEmailSettings(orgId.value).catch(() => null),
        getConnectors().catch(() => ({ connectors: [] as ConnectorMeta[] })),
        getOrg(orgId.value).catch(() => null),
        getConnectorAcl(orgId.value).catch(() => ({ access: [] as ConnectorAclEntry[] })),
        listGroups(orgId.value).catch(() => ({ groups: [] as GroupListItem[] })),
      ])
      rows.value = act.connectors
      filters.value = ff
      emailBundle.value = em
      metaMap.value = Object.fromEntries(cat.connectors.map((c) => [c.name, c]))
      orgSecrets.value = new Set((org?.secrets ?? []).map((s) => s.provider))
      acl.value = aclRes.access
      groups.value = grps.groups
      members.value = org?.members ?? []
    } catch (e) { error.value = humanize(e) } finally { ready.value = true }
  }

  // ── disponibilité (binaire, bornée par le master plateforme) ──
  async function setAvailable(r: OrgConnectorActivation, on: boolean) {
    if (!isOrgAdmin.value || r.master_enabled !== true || orgId.value == null) return
    try {
      if (on) await clearOrgConnectorActivation(orgId.value, r.connector)
      else await setOrgConnectorActivation(orgId.value, r.connector, false)
      ctx.toast(`${r.label} : ${on ? 'disponible pour tes membres' : 'coupé pour tes membres'}`)
      await load()
    } catch (e) { ctx.toast(humanize(e)) }
  }

  // ── clé partagée d'org (simple / multi-champs) ──
  function editKey(r: OrgConnectorActivation) {
    if (!isOrgAdmin.value || orgId.value == null) return
    const m = metaMap.value[r.connector]
    if (m?.secret_kind === 'fields' && (m.credential_fields?.length ?? 0) > 0) {
      ctx.openCredential({
        label: r.label, fields: m.credential_fields, single: false,
        verify: m.verifiable ? () => verifyConnector(r.connector, 'org') : undefined,
        onConfirm: async (values) => {
          await setOrgSecret(orgId.value!, r.connector, '', undefined, values)
          ctx.toast(`${r.label} : clé d'org enregistrée`); await load()
        },
      })
      return
    }
    const fields: FormDialogField[] = [
      { key: 'api_key', label: 'clé api', type: 'password', required: true, placeholder: `colle la clé ${r.label}` },
    ]
    ctx.openForm({
      title: `${r.label} — clé partagée d'org`,
      description: "clé du compte de l'org, héritée par tous les membres (cascade : perso > équipe > org > plateforme). stockée chiffrée.",
      fields, submitLabel: 'enregistrer',
      onConfirm: async (v) => {
        try {
          await setOrgSecret(orgId.value!, r.connector, v.api_key ?? '')
          ctx.toast(`${r.label} : clé d'org enregistrée`); await load()
        } catch (e) { ctx.toast(humanize(e)); throw e }
      },
    })
  }
  async function removeKey(r: OrgConnectorActivation) {
    if (!isOrgAdmin.value || orgId.value == null) return
    if (!await ctx.confirmAction({
      title: "retirer la clé d'org", danger: true, confirmLabel: 'Retirer',
      message: `retirer la clé partagée ${r.label} ? les membres sans clé perso perdent l'accès.`,
    })) return
    try { await deleteOrgSecret(orgId.value, r.connector); ctx.toast(`${r.label} : clé d'org retirée`); await load() }
    catch (e) { ctx.toast(humanize(e)) }
  }

  // ── accès (RBAC ADR 0025) ──
  function principalLabel(e: ConnectorAclEntry): string {
    if (e.principal_type === 'group') {
      const g = groups.value.find((x) => String(x.id) === String(e.principal_id))
      return g ? `équipe · ${g.name}` : `équipe #${e.principal_id}`
    }
    const m = members.value.find((x) => x.sub === e.principal_id)
    return m?.name || m?.email || e.principal_id
  }
  function addAccess(r: OrgConnectorActivation) {
    if (!isOrgAdmin.value) return
    const opts = [
      ...groups.value.map((g) => ({ value: `group:${g.id}`, label: `équipe · ${g.name}` })),
      ...members.value.map((m) => ({ value: `user:${m.sub}`, label: `membre · ${m.name || m.email || m.sub}` })),
    ]
    if (!opts.length) { ctx.toast("crée d'abord un groupe ou ajoute des membres"); return }
    ctx.openForm({
      title: `${r.label} — réserver l'accès`,
      description: "ajoute un groupe ou un membre autorisé. dès le 1er ajout, le connecteur devient RÉSERVÉ (invisible + bloqué pour les autres, même avec leur propre clé).",
      fields: [{ key: 'principal', label: 'autoriser', type: 'select', required: true, options: opts }],
      submitLabel: 'autoriser',
      onConfirm: async (v) => {
        const raw = String(v.principal)
        const i = raw.indexOf(':')
        const ptype = raw.slice(0, i); const pid = raw.slice(i + 1)
        if (!ptype || !pid) { ctx.toast('sélection invalide'); throw new Error('invalid principal') }
        try { await setConnectorAccess(orgId.value!, r.connector, ptype, pid); ctx.toast(`${r.label} : accès réservé`); await load() }
        catch (e) { ctx.toast(humanize(e)); throw e }
      },
    })
  }
  async function removeAccess(r: OrgConnectorActivation, ptype: string, pid: string) {
    if (!isOrgAdmin.value || orgId.value == null) return
    try { await clearConnectorAccess(orgId.value, r.connector, ptype, pid); await load() }
    catch (e) { ctx.toast(humanize(e)) }
  }
  function forceForMember(r: OrgConnectorActivation) {
    if (!isOrgAdmin.value) return
    const opts = members.value.map((m) => ({ value: m.sub, label: m.name || m.email || m.sub }))
    if (!opts.length) { ctx.toast("ajoute d'abord des membres à l'org"); return }
    ctx.openForm({
      title: `${r.label} — pousser à un membre`,
      description: "le connecteur apparaît dans la toolbox du membre (sans qu'il l'active). il reste libre de le masquer.",
      fields: [{ key: 'member', label: 'membre', type: 'select', required: true, options: opts }],
      submitLabel: 'pousser',
      onConfirm: async (v) => {
        try { await forceConnectorForMember(orgId.value!, r.connector, String(v.member)); ctx.toast(`${r.label} : poussé au membre`) }
        catch (e) { ctx.toast(humanize(e)); throw e }
      },
    })
  }

  const isEmail = (r: OrgConnectorActivation) => ['scaleway', 'resend'].includes(r.connector)

  return {
    scope: 'org',
    rows, ready, error, load, reload: load,
    listTitle: "connecteurs de l'org",
    listSub: "pour chaque connecteur : disponibilité (bornée par la plateforme), clé partagée "
      + "d'org, accès et rédaction. clique une ligne pour régler ses leviers.",
    emptyText: 'aucun connecteur.',
    searchPlaceholder: 'rechercher…',
    key: (r) => r.connector,
    meta,
    label: (r) => r.label,
    category: (r) => meta(r)?.category ?? '',
    searchText: (r) => `${r.connector} ${r.label}`,
    sortRank: (r) => (r.effective ? 0 : 1),
    categoryValues: () => rows.value.map((r) => meta(r)?.category ?? ''),
    columns: [
      { key: 'availability', label: 'disponibilité' },
      { key: 'key', label: "clé d'org" },
      { key: 'access', label: 'accès' },
    ],
    cell: (r, col): CellVM | undefined => {
      if (col === 'availability') {
        return r.effective ? { dot: 'olive', label: 'disponible' } : { dot: 'faint', label: 'coupé' }
      }
      if (col === 'key') {
        if (!canHaveKey(r)) return { label: '—', muted: true }
        return hasOrgKey(r.connector) ? { tag: { tone: 'olive', text: 'posée' } } : { label: 'aucune', muted: true }
      }
      if (col === 'access') {
        const n = aclFor(r.connector).length
        return n ? { dot: 'saffron', label: `réservé · ${n}` } : { label: 'ouvert', muted: true }
      }
      return undefined
    },
    hasDrawer: true,
    tabs: (r) => {
      const t = [{ key: 'main', label: 'gouvernance' }, { key: 'access', label: 'accès' }, { key: 'redaction', label: 'rédaction' }]
      // email seulement pour les connecteurs d'envoi ET si le bundle est chargé (props le requiert non-null).
      if (isEmail(r) && emailBundle.value) t.push({ key: 'email', label: 'email' })
      t.push({ key: 'about', label: 'à propos' })
      return t
    },
    availability: {
      variant: 'binary',
      title: 'disponibilité — ce que vivent tes membres',
      state: (r) => r.effective
        ? { on: true, label: 'disponible pour tes membres', tone: 'olive', note: 'la plateforme borne — tu ne peux pas exposer un connecteur qu\'elle a coupé, seulement le restreindre.' }
        : { on: false, label: 'coupé pour tes membres', tone: 'faint', note: 'la plateforme borne — tu ne peux pas exposer un connecteur qu\'elle a coupé, seulement le restreindre.' },
      canEdit: (r) => isOrgAdmin.value && r.master_enabled === true,
      set: (r, next) => setAvailable(r, next as boolean),
    },
    credential: {
      title: "clé partagée d'org",
      state: (r) => canHaveKey(r)
        ? (hasOrgKey(r.connector) ? { present: true, label: 'posée' } : { present: false, label: 'aucune clé' })
        : { present: false, label: 'pas de clé pour ce connecteur' },
      canEdit: (r) => isOrgAdmin.value && canHaveKey(r),
      edit: (r) => editKey(r),
      remove: (r) => removeKey(r),
      verify: (r) => verifyConnector(r.connector, 'org'),
    },
    access: {
      restricted: (r) => aclFor(r.connector).length > 0,
      principals: (r): AclPrincipal[] => aclFor(r.connector).map((e) => ({ type: e.principal_type, id: e.principal_id, label: principalLabel(e) })),
      canEdit: () => isOrgAdmin.value,
      add: (r) => addAccess(r),
      remove: (r, type, id) => removeAccess(r, type, id),
      force: (r) => forceForMember(r),
    },
    redaction: {
      props: (r) => {
        const b = filters.value
        const name = r.connector
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
        }
      },
      onChanged: () => { if (orgId.value != null) getOrgFieldFilters(orgId.value).then((f) => { filters.value = f }).catch(() => {}) },
    },
    email: {
      visible: (r) => isEmail(r),
      props: (r) => ({
        connector: r.connector,
        block: emailBundle.value?.settings?.[r.connector] ?? null,
        transport: emailBundle.value?.transports?.[r.connector] ?? r.connector,
        quietDefault: emailBundle.value!.quiet_hours_default,
        resendKeySet: emailBundle.value!.resend_key_set,
        orgId: orgId.value!,
        isOrgAdmin: isOrgAdmin.value,
      }),
      onChanged: () => { if (orgId.value != null) getOrgEmailSettings(orgId.value).then((e) => { emailBundle.value = e }).catch(() => {}) },
    },
  }
}
