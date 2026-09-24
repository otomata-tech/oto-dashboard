// Remet un fichier construit dans le navigateur au geste « enregistrer » : un lien
// `download` éphémère sur une URL d'objet, révoquée aussitôt. Seul chemin de sortie d'un
// fichier du dashboard — l'export CSV d'un tableau, un binaire servi (`apiDownload`), le
// journal des accès d'une org.
export function saveBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
