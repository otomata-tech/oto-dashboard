// Ce que voit un invité branché sur le lien/l'endpoint « secret » d'un projet — SEAM
// UNIQUE des trois opt-ins d'exposition (issue #131) : pages (mcp_expose_docs),
// tableaux en lecture (mcp_expose_datastore), tableaux en écriture
// (mcp_expose_datastore_write). Sans ce point unique, le formulaire de publication
// (ProjectMcpPublishDialog, avant l'acte) et l'écran de partage (ProjectShareDialog,
// après, pour signaler un défaut d'opt-in) auraient chacun recalculé les tableaux
// liés et la dépendance écriture→lecture — avec le risque de diverger.
import type { Project, ProjectLink } from '@/types/api'

/** Tableaux réellement liés au projet — jamais promettre « les tableaux liés » sans en avoir. */
export function linkedTablesOf(p: Pick<Project, 'links'>): ProjectLink[] {
  return (p.links ?? []).filter((l) => l.target_type === 'tableau')
}

export interface ExposureFlags {
  docs: boolean
  datastoreRead: boolean
  datastoreWrite: boolean
}

/** Lit les trois opt-ins depuis un projet — l'écriture est TOUJOURS subordonnée à la lecture. */
export function exposureFlagsOf(
  p: Pick<Project, 'mcp_expose_docs' | 'mcp_expose_datastore' | 'mcp_expose_datastore_write'>,
): ExposureFlags {
  const datastoreRead = !!p.mcp_expose_datastore
  return { docs: !!p.mcp_expose_docs, datastoreRead, datastoreWrite: datastoreRead && !!p.mcp_expose_datastore_write }
}

export interface ExposureItem {
  key: 'docs' | 'datastoreRead' | 'datastoreWrite'
  label: string
  exposed: boolean
  /** `null` = actionnable ; sinon la raison pour laquelle l'opt-in ne s'applique pas ici. */
  disabledReason: string | null
  /** Ce que verra le destinataire, à l'état courant de CET opt-in — la même phrase partout. */
  sentence: string
}

export interface ExposureRows {
  docs: ExposureItem
  datastoreRead: ExposureItem
  datastoreWrite: ExposureItem
}

/**
 * Les trois lignes d'opt-in, dans l'ordre où l'issue les énonce : pages, lecture, écriture.
 * Objet NOMMÉ (pas un tableau) — un accès par clé reste garanti défini, là où un index de
 * tableau redevient `| undefined` sous `noUncheckedIndexedAccess`.
 */
export function exposureRowsOf(flags: ExposureFlags, tableCount: number): ExposureRows {
  const hasTables = tableCount > 0
  return {
    docs: {
      key: 'docs',
      label: 'Pages du projet',
      exposed: flags.docs,
      disabledReason: null,
      sentence: flags.docs
        ? 'Le destinataire pourra lire les pages de ce projet.'
        : 'Le destinataire ne verra aucune page du projet — seulement le brief.',
    },
    datastoreRead: {
      key: 'datastoreRead',
      label: 'Tableaux · lecture',
      exposed: flags.datastoreRead,
      disabledReason: hasTables ? null : 'aucun tableau lié à ce projet',
      sentence: !hasTables
        ? 'Aucun tableau n’est lié à ce projet — rien à exposer.'
        : flags.datastoreRead
          ? `Le destinataire pourra lire ${tableCount > 1 ? `les ${tableCount} tableaux liés` : 'le tableau lié'} à ce projet.`
          : 'Le destinataire ne verra aucun tableau.',
    },
    datastoreWrite: {
      key: 'datastoreWrite',
      label: 'Tableaux · écriture',
      exposed: flags.datastoreWrite,
      disabledReason: flags.datastoreRead ? null : 'active d’abord la lecture',
      sentence: flags.datastoreWrite
        ? 'Le destinataire pourra aussi modifier ces tableaux (ajouter/éditer des lignes).'
        : 'Le destinataire ne pourra pas modifier les tableaux.',
    },
  }
}
