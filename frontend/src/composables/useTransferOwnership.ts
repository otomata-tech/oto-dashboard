// Choix de la NOUVELLE ENTITÉ DÉTENTRICE d'une ressource possédée (ADR 0030/0049).
// « Transférer » = changer de détenteur, et le détenteur est une ENTITÉ nommée, pas un
// e-mail à taper : on liste **moi** / **les personnes de l'org active** / **les équipes**
// / **mes orgs** (« autre utilisateur » par e-mail reste en repli, pour une passation
// hors de ses scopes). Miroir du sélecteur de la CRÉATION (ProjectCreateDialog). Le caller
// fait l'appel API adéquat selon le type de ressource ; renvoie la cible choisie, ou null.
//
// Les options sont ordonnées par AUDIENCE CROISSANTE (moi seul → une personne → une
// équipe → toute une org) : la question posée est « qui le voit ? », pas « quel type
// d'entité ? » — l'utilisateur choisit une audience, pas une taxonomie backend.
//
// `opts.allowTeams` : n'offrir les équipes que si le backend cible sait les recevoir
// (`new_owner_group`) — vrai pour les PROJETS (oto_resource) ; l'endpoint datastore
// bespoke ne les accepte pas encore → on ne les propose pas là (pas de trou silencieux).
import { getMyOrgs, getOrg, listGroups, transferResource } from '@/api/console'
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
    const [orgs, groups, members] = await Promise.all([
      getMyOrgs().then((d) => d.orgs).catch(() => []),
      opts.allowTeams && activeOrg != null
        // Uniquement les équipes où j'ai un rôle (le backend exige can_read_group).
        ? listGroups(activeOrg).then((d) => d.groups.filter((g) => g.my_role != null)).catch(() => [])
        : Promise.resolve([]),
      // Les PERSONNES de l'org active, nommées : céder un projet à une collègue ne doit
      // pas exiger de retaper son e-mail de mémoire (le repli e-mail reste, pour hors-org).
      activeOrg != null
        ? getOrg(activeOrg).then((d) => (d.members ?? []).filter((m) => !!m.email && m.sub !== me.value?.sub)).catch(() => [])
        : Promise.resolve([]),
    ])

    // Ordre = audience croissante : moi seul → une personne → une équipe → toute une org.
    const options = [
      { value: 'me', label: 'moi seul (privé)' },
      ...members.map((m) => ({ value: `email:${m.email}`, label: `${m.name || m.email} (privé, à cette personne)` })),
      ...groups.map((g) => ({ value: `group:${g.group_id}`, label: `l’équipe ${g.name}` })),
      ...orgs.map((o) => ({ value: `org:${o.id}`, label: `toute l’org ${o.name}` })),
      { value: 'user', label: 'quelqu’un d’autre (e-mail ci-dessous)' },
    ]

    const r = await promptFormDialog({
      title: 'qui détient ce projet ?',
      description: `« ${resourceLabel} » — le détenteur est celui qui le voit. Choisis la `
        + `nouvelle audience : toi seul, une personne, une équipe ou toute une org. Les prêts `
        + `déjà accordés restent en place.`,
      submitLabel: 'appliquer',
      fields: [
        { key: 'target', label: 'détenteur', type: 'select', initial: 'me', options },
        { key: 'email', label: 'e-mail (uniquement si « quelqu’un d’autre »)',
          placeholder: 'user@email.com' },
      ],
    })
    if (!r) return null
    const target = r.target || 'me'
    if (target === 'me') {
      const email = (me.value?.email || '').trim()
      return email ? { email } : null   // « moi » = cession à mon propre compte (owner_type=user)
    }
    if (target.startsWith('email:')) return { email: target.slice(6) }
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
