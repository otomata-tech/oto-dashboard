// Poser un compte NOMMÉ de plus (#121) — le même geste à tous les paliers : un second
// workspace Slack pour un membre, la clé PayFit d'une deuxième société pour l'org d'un
// groupe. Seuls changent la route qui écrit et le palier que dit le dialogue ; tout le
// reste (nom obligatoire, mot du registre, doublon refusé à la saisie) est UN geste,
// écrit une fois ici et appelé par chaque adaptateur.
//
// Le nom est obligatoire : le serveur refuse une seconde pose anonyme (409
// `account_required`), et migre lui-même la ligne anonyme vers un libellé au premier
// compte nommé — l'écran suit ces règles, il ne les rejoue pas.
import { verifyConnector } from '@/api/console'
import { accountWords } from '@/lib/accountNoun'
import type { ConnectorMeta } from '@/types/api'
import type { ScopeCtx } from './adapter'

export interface AddAccountOpts {
  scope: 'member' | 'org'
  // L'écriture du palier (`setCredential` / `setOrgSecret`), sous le nom saisi.
  save: (values: Record<string, string>, account: string) => Promise<unknown>
  // Recharge ce que la pose change — `me` compris : c'est le signal que la liste des
  // comptes écoute (`ConnectorKeyAccounts`, `watch(me, load)`).
  reload: () => Promise<unknown>
}

export function openAddAccount(
  ctx: ScopeCtx, c: ConnectorMeta, existing: string[], opts: AddAccountOpts,
): void {
  const fields = c.credential_fields ?? []
  if (!fields.length) return
  const w = accountWords(c.auth?.account_noun)
  ctx.openCredential({
    label: c.label, fields, single: fields.length === 1, scope: opts.scope,
    fieldDiscriminator: c.auth?.field_discriminator,
    // Un compte NEUF : rien à pré-remplir, rien à conserver.
    docs: c.doc_sections,
    accountMode: 'new', accountNoun: w.noun, accountNames: existing,
    // La sonde vise le compte que la pose vient d'écrire, à TOUS les paliers. Au palier
    // org (backend v1.314.0) sans lui elle lirait la ligne anonyme, que le serveur vient
    // de renommer (vécu 18/09). Au palier membre sans lui, dès deux comptes nommés sans
    // défaut, la cascade ne sait pas lequel tester (`account_required`, vécu 01/10).
    verify: c.verifiable
      ? (account) => verifyConnector(c.name, opts.scope === 'org' ? 'org' : 'auto', account)
      : undefined,
    onConfirm: async (values, account) => {
      await opts.save(values, account)
      ctx.toast(`${w.noun} « ${account} » ajouté${w.e}`)
      await opts.reload()
    },
  })
}

// Remplacer les identifiants d'UN compte nommé existant — le geste qui manquait : une
// fois des comptes nommés posés, le serveur refuse toute pose anonyme (409
// `account_required`), et « modifier ma clé » ne savait pas dire laquelle. Le dialogue
// s'ouvre en mode `fixed` sur ce compte : son nom n'est pas redemandé, un secret laissé
// vide reste au coffre (`existing`).
export function openReplaceAccount(
  ctx: ScopeCtx, c: ConnectorMeta, account: string, opts: AddAccountOpts,
): void {
  const fields = c.credential_fields ?? []
  if (!fields.length) return
  const w = accountWords(c.auth?.account_noun)
  ctx.openCredential({
    label: c.label, fields, single: fields.length === 1, scope: opts.scope,
    fieldDiscriminator: c.auth?.field_discriminator,
    docs: c.doc_sections, existing: true,
    accountMode: 'fixed', account, accountNoun: w.noun,
    verify: c.verifiable
      ? () => verifyConnector(c.name, opts.scope === 'org' ? 'org' : 'auto', account)
      : undefined,
    onConfirm: async (values) => {
      await opts.save(values, account)
      ctx.toast(`${w.noun} « ${account} » mis${w.e} à jour`)
      await opts.reload()
    },
  })
}
