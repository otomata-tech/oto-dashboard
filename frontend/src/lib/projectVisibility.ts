// Qui voit ce projet ? — source UNIQUE du langage de visibilité (ADR 0049 : la
// visibilité DÉCOULE de l'ownership).
//
// Pourquoi ce module : la liste et la page projet affichaient l'APPARTENANCE en un
// mot (« perso », « org »), ce qui ne répond pas à la question que se pose l'auteur
// d'un projet sensible — « est-ce que quelqu'un d'autre le voit ? ». On formule donc
// la visibilité en clair, du point de vue de l'utilisateur, au même endroit pour
// toutes les surfaces.
import type { Project } from '@/types/api'

export interface ProjectVisibility {
  /** Étiquette courte, orientée AUDIENCE (« Privé », « Toute l'org »…). */
  label: string
  /** Phrase complète pour un tooltip / une ligne d'en-tête. */
  detail: string
  /** `true` quand personne d'autre n'y a accès — permet d'insister visuellement. */
  isPrivate: boolean
  tone?: 'olive' | 'cobalt' | 'saffron'
}

/**
 * `orgName` / `groupName` : noms affichables du contexte (facultatifs — sans eux on
 * reste générique plutôt que d'inventer un nom).
 * `sharedCount` : nombre de partages explicites connus de l'appelant (grants). Un
 * projet privé PARTAGÉ n'est plus « vous seul » : on le dit.
 */
export function projectVisibility(
  p: Pick<Project, 'owner_type' | 'shared' | 'mcp_access'>,
  opts: { orgName?: string | null; groupName?: string | null; sharedCount?: number } = {},
): ProjectVisibility {
  const shared = opts.sharedCount ?? (p.shared ? 1 : 0)

  // Publié : l'audience réelle dépasse l'org — ça prime sur l'ownership.
  if (p.mcp_access && p.mcp_access !== 'off') {
    const pub = p.mcp_access === 'anonymous'
    return {
      label: pub ? 'Public' : 'Lien de partage',
      detail: pub
        ? 'Publié : accessible sans compte, et listé dans l’annuaire.'
        : 'Publié : accessible à qui détient le lien secret.',
      isPrivate: false,
      tone: 'saffron',
    }
  }

  if (p.owner_type === 'org') {
    const who = opts.orgName ? `l’organisation ${opts.orgName}` : 'l’organisation'
    return { label: 'Toute l’org', detail: `Visible par tous les membres de ${who}.`, isPrivate: false, tone: 'cobalt' }
  }
  if (p.owner_type === 'group') {
    const who = opts.groupName ? `l’équipe ${opts.groupName}` : 'l’équipe'
    return { label: 'Équipe', detail: `Visible par les membres de ${who}.`, isPrivate: false, tone: 'cobalt' }
  }
  if (p.owner_type === 'platform') {
    return { label: 'Bibliothèque oto', detail: 'Visible par tous les comptes oto.', isPrivate: false, tone: 'saffron' }
  }

  // owner_type === 'user' : privé au créateur, sauf partages explicites.
  if (shared > 0) {
    return {
      label: 'Privé · partagé',
      detail: shared === 1
        ? 'Visible par toi et la personne (ou l’équipe) avec qui tu l’as partagé.'
        : `Visible par toi et ${shared} destinataires de partage.`,
      isPrivate: false,
      tone: 'cobalt',
    }
  }
  return {
    label: 'Privé',
    detail: 'Visible par toi seul — personne d’autre n’y a accès.',
    isPrivate: true,
    tone: 'olive',
  }
}

/** Contexte de résolution des NOMS (le module ne fetche rien : l'appelant fournit). */
export interface OwnerNameCtx {
  mySub?: string | null
  myOrgId?: number | string | null
  myOrgName?: string | null
  orgs?: { id: number | string; name: string }[]
  groups?: { group_id?: number; id?: number; name: string }[]
}

/**
 * « Détenu par … » — l'axe DÉTENIR, nommé du point de vue du lecteur (« toi »,
 * le nom de l'org/équipe). Complémentaire de `projectVisibility` (l'axe AUDIENCE) :
 * les deux vivent ici pour que le vocabulaire de propriété ne diverge plus d'une
 * surface à l'autre.
 */
export function projectOwnerLabel(
  p: Pick<Project, 'owner_type' | 'owner_id'>,
  ctx: OwnerNameCtx = {},
): string {
  const t = p.owner_type
  const id = String(p.owner_id ?? '')
  if (t === 'user') return id === ctx.mySub ? 'toi' : 'un utilisateur'
  if (t === 'platform') return 'la bibliothèque Otomata'
  if (t === 'org') {
    if (ctx.myOrgId != null && id === String(ctx.myOrgId)) return ctx.myOrgName || 'ton org'
    return (ctx.orgs ?? []).find((o) => String(o.id) === id)?.name || 'une org'
  }
  if (t === 'group') {
    return (ctx.groups ?? []).find((g) => String(g.group_id ?? g.id) === id)?.name || 'une équipe'
  }
  return t
}

/** Regroupement de la LISTE : « à moi » vs « partagé avec moi » vs le collectif. */
export type ProjectBucket = 'mine' | 'org' | 'group' | 'platform'

export function projectBucket(p: Pick<Project, 'owner_type'>): ProjectBucket {
  if (p.owner_type === 'org') return 'org'
  if (p.owner_type === 'group') return 'group'
  if (p.owner_type === 'platform') return 'platform'
  return 'mine'
}

export const BUCKET_LABEL: Record<ProjectBucket, string> = {
  mine: 'Mes projets',
  group: 'Projets d’équipe',
  org: 'Projets de l’organisation',
  platform: 'Bibliothèque oto',
}

export const BUCKET_HINT: Record<ProjectBucket, string> = {
  mine: 'À toi. Privés sauf partage explicite de ta part.',
  group: 'Visibles par les membres de l’équipe.',
  org: 'Visibles par tous les membres de l’organisation.',
  platform: 'Modèles publiés par oto.',
}
