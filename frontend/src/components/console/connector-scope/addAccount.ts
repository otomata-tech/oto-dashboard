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
    // Au palier ORG la sonde vise le compte que la pose vient d'écrire (`account`,
    // backend v1.314.0) : sans lui elle lirait la ligne anonyme, que le serveur vient
    // justement de renommer, et répondrait « aucune clé d'org » sur une pose réussie
    // (vécu 18/09). Au palier membre elle teste le credential effectif de la cascade.
    verify: c.verifiable
      ? (account) => (opts.scope === 'org'
        ? verifyConnector(c.name, 'org', account)
        : verifyConnector(c.name))
      : undefined,
    onConfirm: async (values, account) => {
      await opts.save(values, account)
      ctx.toast(`${w.noun} « ${account} » ajouté${w.e}`)
      await opts.reload()
    },
  })
}
