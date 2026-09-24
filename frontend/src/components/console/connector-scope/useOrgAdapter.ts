// Adaptateur ORG (scope=org, /org/connectors). Leviers : disponibilité BINAIRE (bornée
// par la plateforme = plancher dur), clé partagée d'org et rédaction de champs en
// lecture (ConnectorTransforms). Plus de levier « accès » : réserver un connecteur à une
// partie des membres n'existe plus (24/09/2026, ADR 0053 D1) — on place la clé au bon
// niveau (clé perso vs clé d'org). Réplique la logique de l'ex-`OrgConnectorsView` + `OrgConnectorDrawer`.
import { computed, ref } from 'vue'
import type {
  CellVM, ConnectorScopeAdapter, ScopeCtx,
} from './adapter'
import {
  getOrgConnectorActivation, setOrgConnectorActivation, clearOrgConnectorActivation,
  getOrgFieldFilters, getConnectors, getOrg,
  setOrgSecret, deleteOrgSecret, verifyConnector, startConnectorFlow,
  credentialPrefill,
} from '@/api/console'
import { useMe, canAdministerOrg, canWriteInOrg } from '@/composables/useMe'
import { humanize } from '@/lib/errors'
import { openAddAccount } from './addAccount'
import type {
  OrgConnectorActivation, ConnectorMeta, FieldFiltersBundle,
} from '@/types/api'
import type { FormDialogField } from '@/composables/useFormDialog'

export function useOrgAdapter(ctx: ScopeCtx): ConnectorScopeAdapter<OrgConnectorActivation> {
  const { me, reload: reloadMe } = useMe()
  const orgId = computed(() => me.value?.active_org ?? null)
  // Leviers d'écriture (`ORG_ADMIN_OF` côté serveur) : l'admin d'org tel que le serveur le
  // tient, hors consultation (`canAdministerOrg`). L'admin plateforme lit, il ne règle rien
  // (oto#210) ; en consultation, personne ne règle rien (oto#211).
  const orgAdmin = computed(() => canAdministerOrg(me.value))
  // « Tester » est un POST sans `op` : en consultation, le serveur le refuse comme une écriture.
  const canWrite = computed(() => canWriteInOrg(me.value))

  const rows = ref<OrgConnectorActivation[]>([])
  const metaMap = ref<Record<string, ConnectorMeta>>({})
  const filters = ref<FieldFiltersBundle | null>(null)
  const orgSecrets = ref<Set<string>>(new Set())
  const ready = ref(false)
  const error = ref<string | null>(null)

  const meta = (r: OrgConnectorActivation) => metaMap.value[r.connector]
  const canHaveKey = (r: OrgConnectorActivation) => {
    const k = metaMap.value[r.connector]?.secret_kind
    return k === 'api_key' || k === 'fields'
  }
  const hasOrgKey = (name: string) => orgSecrets.value.has(name)

  async function load() {
    if (orgId.value == null) { ready.value = true; return }
    try {
      const [act, ff, cat, org] = await Promise.all([
        getOrgConnectorActivation(orgId.value),
        getOrgFieldFilters(orgId.value).catch(() => null),
        getConnectors().catch(() => ({ connectors: [] as ConnectorMeta[] })),
        getOrg(orgId.value).catch(() => null),
      ])
      rows.value = act.connectors
      filters.value = ff
      metaMap.value = Object.fromEntries(cat.connectors.map((c) => [c.name, c]))
      orgSecrets.value = new Set((org?.secrets ?? []).map((s) => s.provider))
    } catch (e) { error.value = humanize(e) } finally { ready.value = true }
  }

  // ── disponibilité (binaire, bornée par le master plateforme) ──
  async function setAvailable(r: OrgConnectorActivation, on: boolean) {
    if (!orgAdmin.value || r.master_enabled !== true || orgId.value == null) return
    try {
      if (on) await clearOrgConnectorActivation(orgId.value, r.connector)
      else await setOrgConnectorActivation(orgId.value, r.connector, false)
      ctx.toast(`${r.label} : ${on ? 'disponible pour tes membres' : 'coupé pour tes membres'}`)
      await load()
    } catch (e) { ctx.toast(humanize(e)) }
  }

  // ── clé partagée d'org (simple / multi-champs) ──
  async function editKey(r: OrgConnectorActivation) {
    if (!orgAdmin.value || orgId.value == null) return
    const m = metaMap.value[r.connector]
    if (m?.secret_kind === 'fields' && (m.credential_fields?.length ?? 0) > 0) {
      // Même geste qu'au palier équipe : on relit ce qui est relisible pour que
      // corriger UNE valeur non secrète n'oblige pas à resaisir un secret illisible.
      const prefill = await credentialPrefill(r.connector, 'org')
      ctx.openCredential({
        label: r.label, fields: m.credential_fields, single: false, scope: 'org',
        fieldDiscriminator: m.auth?.field_discriminator,
        initialValues: prefill.values, existing: prefill.existing,
        docs: m.doc_sections,
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
    if (!orgAdmin.value || orgId.value == null) return
    if (!await ctx.confirmAction({
      title: "retirer la clé d'org", danger: true, confirmLabel: 'Retirer',
      message: `retirer la clé partagée ${r.label} ? les membres sans clé perso perdent l'accès.`,
    })) return
    try { await deleteOrgSecret(orgId.value, r.connector); ctx.toast(`${r.label} : clé d'org retirée`); await load() }
    catch (e) { ctx.toast(humanize(e)) }
  }
  // Une clé d'org de PLUS, sous un nom (#121) — une société d'un groupe PayFit. Même
  // geste qu'au palier membre (`addAccount.ts`), écrit par `org.secret.set` avec
  // `account`. Le rechargement de `me` est le signal que la liste des comptes écoute.
  function addAccount(r: OrgConnectorActivation, existing: string[]) {
    const m = meta(r)
    if (!m || !orgAdmin.value || orgId.value == null) return
    const org = orgId.value
    // ⚠️ Même aiguillage que `editKey`, et pour la même raison : `org.secret.set` ne lit
    // `fields` que pour un connecteur MULTI-champs (`credentials_store.secret_from_input`).
    // Une clé unique (PayFit : un seul champ, `key`) se pose par `api_key` — envoyée dans
    // `fields`, elle était ignorée et la pose refusée en 400 `empty_api_key`.
    const fields = m.credential_fields ?? []
    const multi = m.secret_kind === 'fields'
    openAddAccount(ctx, m, existing, {
      scope: 'org',
      save: (values, account) => (multi
        ? setOrgSecret(org, r.connector, '', undefined, values, account)
        : setOrgSecret(org, r.connector, values[fields[0]?.name ?? ''] ?? '', undefined, undefined, account)),
      reload: () => Promise.all([load(), reloadMe()]),
    })
  }

  return {
    scope: 'org',
    rows, ready, error, load, reload: load,
    listTitle: "connecteurs de l'org",
    listSub: "pour chaque connecteur : disponibilité (bornée par la plateforme), clé partagée "
      + "d'org et rédaction. clique une ligne pour régler ses leviers.",
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
    ],
    cell: (r, col): CellVM | undefined => {
      if (col === 'availability') {
        return r.effective ? { dot: 'olive', label: 'disponible' } : { dot: 'faint', label: 'coupé' }
      }
      if (col === 'key') {
        if (!canHaveKey(r)) return { label: '—', muted: true }
        return hasOrgKey(r.connector) ? { tag: { tone: 'olive', text: 'posée' } } : { label: 'aucune', muted: true }
      }
      return undefined
    },
    hasDrawer: true,
    tabs: () => [
      { key: 'main', label: 'gouvernance' },
      { key: 'redaction', label: 'rédaction' }, { key: 'about', label: 'à propos' },
    ],
    availability: {
      variant: 'binary',
      title: 'disponibilité — ce que vivent tes membres',
      state: (r) => r.effective
        ? { on: true, label: 'disponible pour tes membres', tone: 'olive', note: 'la plateforme borne — tu ne peux pas exposer un connecteur qu\'elle a coupé, seulement le restreindre.' }
        : { on: false, label: 'coupé pour tes membres', tone: 'faint', note: 'la plateforme borne — tu ne peux pas exposer un connecteur qu\'elle a coupé, seulement le restreindre.' },
      canEdit: (r) => orgAdmin.value && r.master_enabled === true,
      set: (r, next) => setAvailable(r, next as boolean),
    },
    credential: {
      title: "clé partagée d'org",
      state: (r) => canHaveKey(r)
        ? (hasOrgKey(r.connector) ? { present: true, label: 'posée' } : { present: false, label: 'aucune clé' })
        : { present: false, label: 'pas de clé pour ce connecteur' },
      canEdit: (r) => orgAdmin.value && canHaveKey(r),
      edit: (r) => editKey(r),
      remove: (r) => removeKey(r),
      verify: (r, account) => verifyConnector(r.connector, 'org', account),
      canVerify: () => canWrite.value,
      accountScope: 'org',
      addAccount,
      // Consentement AU SCOPE ORG. Sans lui, cette surface laissait POSER l'application
      // OAuth de l'org sans aucun moyen de l'activer : l'org_admin enregistrait
      // client_id/secret/login_url, et devait deviner qu'il fallait aller sur sa fiche
      // PERSONNELLE choisir « toute l'org » pour finir. Vécu le 02/08.
      connect: {
        // Libellé DÉCLARÉ par le connecteur (backend `connector_flow`) — on n'écrit
        // jamais « Autoriser Salesforce » ici : aucune surface ne doit connaître un nom
        // de connecteur.
        label: (r) => meta(r)?.connect?.label ?? 'Autoriser',
        // Disponible dès que le connecteur déclare un flux ET que l'application d'org
        // est posée. On ne gate PAS sur « déjà connecté » : redonner l'autorisation est
        // un geste légitime — c'est ainsi qu'on change le compte qui porte les actions.
        available: (r) => Boolean(meta(r)?.connect) && hasOrgKey(r.connector)
          && orgAdmin.value,
        start: async (r) => {
          try {
            const { auth_url } = await startConnectorFlow(r.connector, { scope: 'org' })
            window.location.href = auth_url
          } catch (e) { ctx.toast(humanize(e)) }
        },
      },
    },
    redaction: {
      props: (r) => {
        const b = filters.value
        const name = r.connector
        return {
          service: name,
          fields: b?.schemas?.[name] ?? [],
          rules: b?.filters?.[name]?.rules ?? b?.defaults?.[name]?.rules ?? [],
          actionSchema: b?.schema ?? [],
          customized: !!b?.filters?.[name],
          orgId: orgId.value,
        }
      },
      onChanged: () => { if (orgId.value != null) getOrgFieldFilters(orgId.value).then((f) => { filters.value = f }).catch(() => {}) },
    },
  }
}
