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
 * `received` : le projet n'appartient pas au lecteur ni au contexte consulté, il lui a
 * été PARTAGÉ — `org` à l'org consultée ou à une de mes équipes en elle (bucket
 * `shared`), `me` à moi en personne. `orgName` nomme alors l'org consultée — celle qui
 * reçoit —, jamais son propriétaire : dire « visible par tous les membres de <org
 * consultée> » d'un projet d'une autre org attribuerait ce projet à la mauvaise org.
 */
export function projectVisibility(
  p: Pick<Project, 'owner_type' | 'shared' | 'mcp_access'>,
  opts: { orgName?: string | null; groupName?: string | null; sharedCount?: number; received?: 'org' | 'me' } = {},
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

  if (opts.received === 'me') {
    return {
      label: 'Partagé avec toi',
      detail: 'Il appartient à une autre organisation ou personne, qui l’a partagé avec toi en personne.',
      isPrivate: false,
      tone: 'cobalt',
    }
  }
  if (opts.received === 'org') {
    const here = opts.orgName ? `l’organisation ${opts.orgName}` : 'cette organisation'
    return {
      label: 'Partagé ici',
      detail: `Il appartient à une autre organisation ou personne, qui l’a partagé avec ${here} (ou une de tes équipes).`,
      isPrivate: false,
      tone: 'cobalt',
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

/**
 * Regroupement de la LISTE d'une org : « à moi », le collectif, et ce que l'org REÇOIT.
 *
 * `shared` = un projet que la liste de l'org consultée rend sans qu'il lui appartienne :
 * partagé à l'org (ou à une de mes équipes en elle) par une AUTRE org ou une autre
 * personne. Il est rangé à part — dans « Projets de l'organisation », il se lisait
 * comme un projet de l'org consultée, ce qu'il n'est pas. Le critère est l'OWNERSHIP,
 * rapporté au contexte (`orgId` consultée, `sub` du lecteur) : une org qui n'est pas
 * celle consultée, une personne qui n'est pas le lecteur. Sans contexte, on ne
 * devine pas : le projet reste dans le rang de son propriétaire.
 *
 * Un projet partagé à la PERSONNE n'arrive jamais ici : le backend ne le met dans la
 * liste d'aucune org (`oto_project op=list scope="me"`).
 */
export type ProjectBucket = 'mine' | 'org' | 'group' | 'shared' | 'platform'

export interface BucketCtx {
  orgId?: number | string | null
  sub?: string | null
}

export function projectBucket(
  p: Pick<Project, 'owner_type' | 'owner_id'>,
  ctx: BucketCtx = {},
): ProjectBucket {
  const id = String(p.owner_id ?? '')
  if (p.owner_type === 'org') {
    return ctx.orgId != null && id !== String(ctx.orgId) ? 'shared' : 'org'
  }
  if (p.owner_type === 'group') return 'group'
  if (p.owner_type === 'platform') return 'platform'
  return ctx.sub != null && id !== ctx.sub ? 'shared' : 'mine'
}

/** Ordre des sections : ce qui est À MOI d'abord, puis le collectif, puis le reçu. */
export const BUCKET_ORDER: ProjectBucket[] = ['mine', 'group', 'org', 'shared', 'platform']

export const BUCKET_LABEL: Record<ProjectBucket, string> = {
  mine: 'Mes projets',
  group: 'Projets d’équipe',
  org: 'Projets de l’organisation',
  shared: 'Partagés avec cette organisation',
  platform: 'Bibliothèque oto',
}

export const BUCKET_HINT: Record<ProjectBucket, string> = {
  mine: 'À toi. Privés sauf partage explicite de ta part.',
  group: 'Visibles par les membres de l’équipe.',
  org: 'Visibles par tous les membres de l’organisation.',
  shared: 'Ils appartiennent à une autre organisation ou à une autre personne, qui les a partagés ici.',
  platform: 'Modèles publiés par oto.',
}
