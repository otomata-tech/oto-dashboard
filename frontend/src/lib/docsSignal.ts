// Signal « les pages de ce projet ont changé », partagé par la barre latérale (arbre des
// projets, `SidebarProjectTree`) et l'écran projet (`ProjectDetailView`). Les deux affichent
// l'arbre des pages d'un même projet et chacun peut en créer ou en renommer : sans ce signal,
// une page créée depuis la barre latérale n'apparaissait pas dans l'arbre de l'écran, et
// l'inverse (23/09/2026, arbre repris d'oto-frontend).
//
// Un compteur par projet, rien d'autre : qui écrit incrémente, qui affiche relit. Un
// consommateur ignore le numéro qu'il vient lui-même d'émettre (`bumpDocs` le rend), ce qui
// évite de recharger deux fois après sa propre écriture.
import { reactive } from 'vue'

const versions = reactive<Record<number, number>>({})

export function docsVersion(projectId: number): number {
  return versions[projectId] ?? 0
}

export function bumpDocs(projectId: number): number {
  versions[projectId] = docsVersion(projectId) + 1
  return versions[projectId]
}
