// Choix de la NOUVELLE ENTITÉ DÉTENTRICE d'une ressource possédée (ADR 0030/0049).
// « Transférer » = changer de détenteur, et le détenteur est une ENTITÉ nommée, pas un
// e-mail à taper : on liste **moi** / **mes orgs** / **les équipes de l'org active**
// (et « autre utilisateur » par e-mail en repli, pour une passation hors de ses scopes).
// Miroir du sélecteur de la CRÉATION (ProjectCreateDialog). Le caller fait l'appel API
// adéquat selon le type de ressource ; renvoie la cible choisie, ou null si annulé.
//
// `opts.allowTeams` : n'offrir les équipes que si le backend cible sait les recevoir
// (`new_owner_group`) — vrai pour les PROJETS (oto_resource) ; l'endpoint datastore
// bespoke ne les accepte pas encore → on ne les propose pas là (pas de trou silencieux).
import { getMyOrgs, listGroups, transferResource } from '@/api/console'
import { useFormPrompt } from '@/composables/useFormPrompt'
import { usePrompt } from '@/composables/usePrompt'
import { useMe } from '@/composables/useMe'

export interface TransferTarget {
  email?: string
  org_id?: number
  group_id?: number
}

export function useTransferOwnership() {
  const { promptFormDialog } = useFormPrompt()
  const { confirmAction } = usePrompt()
  const { me } = useMe()

  async function pickTarget(
    resourceLabel: string,
    opts: { allowTeams?: boolean } = {},
  ): Promise<TransferTarget | null> {
    const activeOrg = me.value?.active_org ?? null
    const [orgs, groups] = await Promise.all([
      getMyOrgs().then((d) => d.orgs).catch(() => []),
      opts.allowTeams && activeOrg != null
        // Uniquement les équipes où j'ai un rôle (le backend exige can_read_group).
        ? listGroups(activeOrg).then((d) => d.groups.filter((g) => g.my_role != null)).catch(() => [])
        : Promise.resolve([]),
    ])

    const options = [
      { value: 'me', label: 'moi (privé)' },
      ...orgs.map((o) => ({ value: `org:${o.id}`, label: `org · ${o.name}` })),
      ...groups.map((g) => ({ value: `group:${g.group_id}`, label: `équipe · ${g.name}` })),
      { value: 'user', label: 'un autre utilisateur (e-mail ci-dessous)' },
    ]

    const r = await promptFormDialog({
      title: 'transférer la propriété',
      description: `qui détient « ${resourceLabel} » ? choisis la nouvelle entité détentrice `
        + `(toi, une org, une équipe) — ou cède-le à un autre utilisateur par e-mail.`,
      submitLabel: 'transférer',
      fields: [
        { key: 'target', label: 'nouveau détenteur', type: 'select', initial: 'me', options },
        { key: 'email', label: 'e-mail (uniquement si « un autre utilisateur »)',
          placeholder: 'user@email.com' },
      ],
    })
    if (!r) return null
    const target = r.target || 'me'
    if (target === 'me') {
      const email = (me.value?.email || '').trim()
      return email ? { email } : null   // « moi » = cession à mon propre compte (owner_type=user)
    }
    if (target.startsWith('org:')) return { org_id: Number(target.slice(4)) }
    if (target.startsWith('group:')) return { group_id: Number(target.slice(6)) }
    const email = (r.email || '').trim()
    return email ? { email } : null
  }

  // Flux COMPLET, partagé par toutes les surfaces (projet, datastore…) : choisir l'entité
  // détentrice → transférer via la capacité unique `oto_resource` → gérer le garde-fou
  // anti-lockout (409 `confirm_loss_of_control` → confirmation → rejeu avec confirm=true).
  // Retourne true si transféré, false si annulé. LÈVE sur erreur réelle (le caller toast).
  async function transfer(
    resourceType: string, resourceId: string | number, label: string,
    opts: { allowTeams?: boolean } = {},
  ): Promise<boolean> {
    const target = await pickTarget(label, opts)
    if (!target) return false
    const perform = async (confirm: boolean): Promise<boolean> => {
      try {
        await transferResource(resourceType, String(resourceId), { ...target, confirm })
        return true
      } catch (e) {
        if (String((e as Error).message).includes('confirm_loss_of_control')) {
          const ok = await confirmAction({
            title: 'Tu vas perdre le contrôle',
            message: `Tu cèdes « ${label} » hors de ta portée : tu n'en seras plus détenteur et `
              + `tu ne pourras plus le récupérer toi-même — seul un admin Otomata le pourra. `
              + `Confirmer la cession ?`,
            confirmLabel: 'Céder quand même', danger: true,
          })
          return ok ? perform(true) : false
        }
        throw e
      }
    }
    return perform(false)
  }

  return { pickTarget, transfer }
}
