// Le contenu d'un fichier choisi par l'utilisateur, en base64 NU (sans le préfixe
// `data:…;base64,`) : la forme qu'attend un corps JSON qui transporte un document
// (`pdf_base64` de l'émission d'une facture, oto-commerce).
export function fichierEnBase64(fichier: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader()
    lecteur.onerror = () => reject(lecteur.error ?? new Error('lecture du fichier impossible'))
    lecteur.onload = () => {
      const url = String(lecteur.result)
      const virgule = url.indexOf(',')
      if (virgule < 0) { reject(new Error('lecture du fichier : forme inattendue')); return }
      resolve(url.slice(virgule + 1))
    }
    lecteur.readAsDataURL(fichier)
  })
}
