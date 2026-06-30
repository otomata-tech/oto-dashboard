// Dialogue de transfert de propriété (ADR 0030) : on peut donner une ressource
// (namespace datastore, projet…) soit à un AUTRE UTILISATEUR (par e-mail), soit à
// une de SES ORGS (owner_type='org'). Picker d'org + champ e-mail dans un seul
// promptForm. Renvoie la cible choisie (le caller fait l'appel API adéquat selon le
// type de ressource), ou null si annulé / rien de valide.
import { getMyOrgs } from '@/api/console'
import { usePrompt } from '@/composables/usePrompt'

export interface TransferTarget {
  email?: string
  org_id?: number
}

export function useTransferOwnership() {
  const { promptForm } = usePrompt()

  async function pickTarget(resourceLabel: string): Promise<TransferTarget | null> {
    const orgs = (await getMyOrgs().catch(() => ({ orgs: [] }))).orgs
    const r = await promptForm({
      title: 'transférer la propriété',
      description: `donne « ${resourceLabel} » à une de tes orgs, ou à un autre utilisateur. tu gardes l'accès en écriture.`,
      fields: [
        {
          key: 'target',
          label: 'destinataire',
          type: 'select',
          value: '',
          options: [
            { value: '', label: '— un autre utilisateur (e-mail ci-dessous) —' },
            ...orgs.map((o) => ({ value: `org:${o.id}`, label: `org · ${o.name}` })),
          ],
        },
        {
          key: 'email',
          label: 'e-mail (uniquement si transfert à un utilisateur)',
          placeholder: 'user@email.com',
        },
      ],
      submitLabel: 'transférer',
    })
    if (!r) return null
    if (r.target?.startsWith('org:')) return { org_id: Number(r.target.slice(4)) }
    const email = (r.email || '').trim()
    return email ? { email } : null
  }

  return { pickTarget }
}
