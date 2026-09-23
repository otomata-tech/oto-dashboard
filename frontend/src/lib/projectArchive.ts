// Archiver un projet, avec la confirmation que le serveur exige (oto#38).
//
// Le backend refuse (409 `confirm_required`) d'archiver un projet qui porte un brief non
// vide ou une procédure liée, et dit dans `details.unreachable` ce que l'archivage
// rendrait injoignable. Le refus n'est pas une erreur à afficher : c'est une question.
// On la pose DANS la page (modale partagée `usePrompt`, jamais `window.confirm`), avec
// ce compte, et on rejoue l'appel avec `confirm: true` si la personne confirme.
import { ApiError } from '@/api'
import { archiveProject, type ProjectUnreachable } from '@/api/console'
import { usePrompt } from '@/composables/usePrompt'

function plural(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`
}

// « 3 pages, 1 procédure liée, 4 liens et son brief » — ce que la liste des projets
// ne rendra plus.
export function describeUnreachable(u: ProjectUnreachable): string {
  const parts = [
    plural(u.pages, 'page', 'pages'),
    plural(u.procedures, 'procédure liée', 'procédures liées'),
    plural(u.links, 'lien', 'liens'),
  ]
  if (u.brief) parts.push('son brief')
  return `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}`
}

// Le compte porté par un refus `confirm_required`, ou null si `e` est un autre échec.
// Un refus sans `details.unreachable` est un contrat rompu : il remonte tel quel.
export function confirmRequired(e: unknown): ProjectUnreachable | null {
  if (!(e instanceof ApiError) || e.status !== 409 || e.code !== 'confirm_required') return null
  const u = e.details?.unreachable as ProjectUnreachable | undefined
  if (!u) throw e
  return u
}

// true = archivé ; false = la personne a renoncé. Toute autre erreur est levée.
export async function archiveWithConfirm(id: number, name: string): Promise<boolean> {
  try {
    await archiveProject(id)
    return true
  } catch (e) {
    const u = confirmRequired(e)
    if (!u) throw e
    const ok = await usePrompt().confirmAction({
      title: `Archiver « ${name} » ?`,
      message: `Il sort de toutes les listes, avec ce qu'il porte : ${describeUnreachable(u)}. `
        + 'Rien n’est détruit, et le projet se désarchive depuis la liste des projets archivés.',
      confirmLabel: 'Archiver',
      danger: true,
    })
    if (!ok) return false
    await archiveProject(id, true)
    return true
  }
}
