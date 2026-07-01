// Dialogue de transfert de propriété (ADR 0030) : on peut donner une ressource
// (namespace datastore, projet…) soit à un AUTRE UTILISATEUR (par e-mail), soit à
// une de SES ORGS (owner_type='org'). Picker d'org + champ e-mail dans un seul
// promptForm. Renvoie la cible choisie (le caller fait l'appel API adéquat selon le
// type de ressource), ou null si annulé / rien de valide.
import { getMyOrgs } from '@/api/console'
import { useFormPrompt } from '@/composables/useFormPrompt'

export interface TransferTarget {
  email?: string
  org_id?: number
}

export function useTransferOwnership() {
  const { promptFormDialog } = useFormPrompt()

  async function pickTarget(resourceLabel: string): Promise<TransferTarget | null> {
    const orgs = (await getMyOrgs().catch(() => ({ orgs: [] }))).orgs
    const r = await promptFormDialog({
      title: 'transférer la propriété',
      description: `donne « ${resourceLabel} » à une de tes orgs, ou à un autre utilisateur. tu gardes l'accès en écriture.`,
      submitLabel: 'transférer',
      fields: [
        {
          key: 'target',
          label: 'destinataire',
          type: 'select',
          initial: 'user',
          // reka Select refuse une option value="" → sentinel 'user' pour « autre utilisateur ».
          options: [
            { value: 'user', label: 'un autre utilisateur (e-mail ci-dessous)' },
            ...orgs.map((o) => ({ value: `org:${o.id}`, label: `org · ${o.name}` })),
          ],
        },
        {
          key: 'email',
          label: 'e-mail (uniquement si transfert à un utilisateur)',
          placeholder: 'user@email.com',
        },
      ],
    })
    if (!r) return null
    if (r.target && r.target.startsWith('org:')) return { org_id: Number(r.target.slice(4)) }
    const email = (r.email || '').trim()
    return email ? { email } : null
  }

  return { pickTarget }
}
